ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS affiliate_variant_label text DEFAULT NULL;

COMMENT ON COLUMN public.product_clicks.affiliate_variant_label IS
  'Label of the affiliate_variants entry selected for this click. NULL if default affiliate_param was used.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_config_store_country_unique'
      AND conrelid = 'public.marketplace_config'::regclass
  ) THEN
    ALTER TABLE public.marketplace_config
      ADD CONSTRAINT marketplace_config_store_country_unique
      UNIQUE (store_id, country_code);
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('deactivate-stale-oos-products')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'deactivate-stale-oos-products'
);

SELECT cron.unschedule('deactivate-stale-marketplace-products')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'deactivate-stale-marketplace-products'
);

SELECT cron.schedule(
  'deactivate-stale-oos-products',
  '0 2 * * *',
  $$SELECT public.deactivate_stale_marketplace_products();$$
)
WHERE EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_cron'
);
