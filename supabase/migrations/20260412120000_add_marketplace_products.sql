CREATE TABLE public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  country_code text NOT NULL DEFAULT 'GLOBAL',
  product_title text NOT NULL,
  product_url text NOT NULL,
  affiliate_url text,
  image_url text,
  price_amount numeric(10,2),
  price_currency text,
  original_price_amount numeric(10,2),
  stock_status text NOT NULL DEFAULT 'unknown'
    CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'preorder', 'unknown')),
  delivery_eta_text text,
  coupon_code text,
  coupon_text text,
  product_category text,
  keyword_tags text[] NOT NULL DEFAULT '{}',
  affiliate_source text,
  attribution_label text,
  is_affiliate boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_products_store_country_idx
  ON public.marketplace_products (store_id, country_code, is_active, priority);

CREATE INDEX marketplace_products_category_idx
  ON public.marketplace_products (product_category);

CREATE INDEX marketplace_products_keywords_idx
  ON public.marketplace_products USING gin (keyword_tags);

ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_select_all_marketplace_products
ON public.marketplace_products
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY admin_insert_marketplace_products
ON public.marketplace_products
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY admin_update_marketplace_products
ON public.marketplace_products
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY admin_delete_marketplace_products
ON public.marketplace_products
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_marketplace_products_updated_at
  BEFORE UPDATE ON public.marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
