ALTER TABLE public.marketplace_config
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affiliate_network text DEFAULT NULL
    CHECK (
      affiliate_network IS NULL
      OR affiliate_network IN (
        'amazon_associates',
        'flipkart_affiliate',
        'impact',
        'rakuten',
        'admitad',
        'cj_affiliate',
        'direct',
        'other'
      )
    ),
  ADD COLUMN IF NOT EXISTS affiliate_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.can_insert_product_click(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*)
    FROM public.product_clicks
    WHERE user_id = p_user_id
      AND clicked_at > now() - interval '1 hour'
  ) < COALESCE(
    (
      SELECT NULLIF(value #>> '{}', '')::integer
      FROM public.platform_settings
      WHERE key = 'product_clicks_per_hour'
      LIMIT 1
    ),
    100
  );
$$;

REVOKE ALL ON FUNCTION public.can_insert_product_click(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_insert_product_click(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_product_click(uuid) TO service_role;

DROP POLICY IF EXISTS insert_own_product_clicks ON public.product_clicks;
DROP POLICY IF EXISTS product_clicks_insert_own ON public.product_clicks;

CREATE POLICY product_clicks_insert_own
ON public.product_clicks
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_insert_product_click(auth.uid())
);

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  order_id text NOT NULL,
  product_url text,
  commission numeric(10,2),
  currency text,
  click_id text,
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  converted_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_conversions_network_order_idx
  ON public.affiliate_conversions (network, order_id);

CREATE INDEX IF NOT EXISTS affiliate_conversions_user_idx
  ON public.affiliate_conversions (user_id, converted_at DESC);

CREATE INDEX IF NOT EXISTS affiliate_conversions_session_idx
  ON public.affiliate_conversions (session_id);

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_conversions_select_own ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_select_own
ON public.affiliate_conversions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS superadmin_select_all_affiliate_conversions ON public.affiliate_conversions;
CREATE POLICY superadmin_select_all_affiliate_conversions
ON public.affiliate_conversions
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE OR REPLACE VIEW public.admin_product_catalog_health
WITH (security_invoker = true)
AS
SELECT
  mp.store_id,
  COALESCE(
    mc.store_name,
    fallback.store_name,
    mp.store_id
  ) AS store_name,
  mp.country_code,
  mp.product_category,
  COUNT(*) AS total_products,
  COUNT(*) FILTER (WHERE mp.stock_status = 'in_stock') AS in_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'out_of_stock') AS out_of_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'unknown') AS unknown_stock,
  COUNT(*) FILTER (WHERE mp.image_url IS NOT NULL) AS has_image,
  COUNT(*) FILTER (WHERE mp.affiliate_url IS NOT NULL) AS has_affiliate_url,
  MAX(mp.updated_at) AS last_updated
FROM public.marketplace_products mp
LEFT JOIN public.marketplace_config mc
  ON mc.store_id = mp.store_id
  AND mc.country_code = mp.country_code
LEFT JOIN public.marketplace_config fallback
  ON fallback.store_id = mp.store_id
  AND fallback.country_code = 'GLOBAL'
WHERE mp.is_active = true
GROUP BY
  mp.store_id,
  COALESCE(mc.store_name, fallback.store_name, mp.store_id),
  mp.country_code,
  mp.product_category
ORDER BY mp.country_code, mp.store_id, mp.product_category;

GRANT SELECT ON public.admin_product_catalog_health TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_stale_marketplace_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can deactivate marketplace products manually';
  END IF;

  UPDATE public.marketplace_products
  SET
    is_active = false,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{auto_deactivated_reason}',
      to_jsonb('stale_out_of_stock'::text),
      true
    ),
    updated_at = now()
  WHERE is_active = true
    AND stock_status = 'out_of_stock'
    AND updated_at < now() - interval '48 hours';

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'affected_count', affected_count,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_stale_marketplace_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_stale_marketplace_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_stale_marketplace_products() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('deactivate-stale-marketplace-products')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'deactivate-stale-marketplace-products'
);

SELECT cron.schedule(
  'deactivate-stale-marketplace-products',
  '17 */6 * * *',
  $$SELECT public.deactivate_stale_marketplace_products();$$
)
WHERE EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_cron'
);
