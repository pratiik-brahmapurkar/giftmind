
-- Create credit_packages table
CREATE TABLE IF NOT EXISTS public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL,
  price_inr numeric(10,2) NOT NULL DEFAULT 0,
  price_usd numeric(10,2) NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 365,
  badge_text text,
  features text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Existing remote projects may already have the newer credit package schema.
ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS price_inr numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS features text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Everyone can view active packages
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.credit_packages;
CREATE POLICY "Anyone can view active packages"
ON public.credit_packages FOR SELECT TO authenticated
USING (is_active = true);

-- Superadmins can do everything
DROP POLICY IF EXISTS "Superadmins can view all packages" ON public.credit_packages;
CREATE POLICY "Superadmins can view all packages"
ON public.credit_packages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can insert packages" ON public.credit_packages;
CREATE POLICY "Superadmins can insert packages"
ON public.credit_packages FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can update packages" ON public.credit_packages;
CREATE POLICY "Superadmins can update packages"
ON public.credit_packages FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can delete packages" ON public.credit_packages;
CREATE POLICY "Superadmins can delete packages"
ON public.credit_packages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Seed default packages
INSERT INTO public.credit_packages (name, credits, price_inr, price_usd, validity_days, badge_text, features, sort_order)
VALUES
  ('Starter', 5, 99, 1.99, 90, NULL, ARRAY['5 gift recommendations', 'Basic occasions'], 1),
  ('Popular', 15, 249, 4.99, 180, 'Most Popular', ARRAY['15 gift recommendations', 'All occasions', 'Priority support'], 2),
  ('Pro', 40, 499, 9.99, 365, 'Best Value', ARRAY['40 gift recommendations', 'All occasions', 'Priority support', 'Advanced filters', 'Gift tracking'], 3)
ON CONFLICT DO NOTHING;

-- Add payment tracking columns to credit_transactions
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS provider text;

-- Updated_at trigger for packages
DROP TRIGGER IF EXISTS update_credit_packages_updated_at ON public.credit_packages;
CREATE TRIGGER update_credit_packages_updated_at
  BEFORE UPDATE ON public.credit_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
