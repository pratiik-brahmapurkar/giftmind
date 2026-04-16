
CREATE TABLE IF NOT EXISTS public.marketplace_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'india',
  store_name text NOT NULL,
  domain text NOT NULL,
  search_url_pattern text,
  affiliate_tag text DEFAULT '',
  logo_url text,
  brand_color text DEFAULT '#6366f1',
  categories text[] DEFAULT '{}',
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active marketplaces" ON public.marketplace_config;
CREATE POLICY "Anyone can view active marketplaces"
ON public.marketplace_config FOR SELECT TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Superadmins can view all marketplaces" ON public.marketplace_config;
CREATE POLICY "Superadmins can view all marketplaces"
ON public.marketplace_config FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Superadmins can insert marketplaces" ON public.marketplace_config;
CREATE POLICY "Superadmins can insert marketplaces"
ON public.marketplace_config FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Superadmins can update marketplaces" ON public.marketplace_config;
CREATE POLICY "Superadmins can update marketplaces"
ON public.marketplace_config FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Superadmins can delete marketplaces" ON public.marketplace_config;
CREATE POLICY "Superadmins can delete marketplaces"
ON public.marketplace_config FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role));

DROP TRIGGER IF EXISTS update_marketplace_config_updated_at ON public.marketplace_config;
CREATE TRIGGER update_marketplace_config_updated_at
  BEFORE UPDATE ON public.marketplace_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
