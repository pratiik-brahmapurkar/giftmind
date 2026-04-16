-- =============================================
-- STEP 1: Migrate plan names in users table
-- =============================================
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_active_plan_check;

UPDATE public.users SET active_plan = 'spark' WHERE active_plan = 'free' OR active_plan IS NULL;
UPDATE public.users SET active_plan = 'thoughtful' WHERE active_plan = 'starter';
UPDATE public.users SET active_plan = 'confident' WHERE active_plan = 'popular';
UPDATE public.users SET active_plan = 'gifting-pro' WHERE active_plan = 'pro';

ALTER TABLE public.users ALTER COLUMN active_plan SET DEFAULT 'spark';
ALTER TABLE public.users ADD CONSTRAINT users_active_plan_check
  CHECK (active_plan IN ('spark', 'thoughtful', 'confident', 'gifting-pro'));

-- =============================================
-- STEP 2: Replace credit packages
-- =============================================
DELETE FROM public.credit_packages;

INSERT INTO public.credit_packages (
  name, slug, credits, price_usd,
  price_inr, price_eur, price_gbp, price_aed, price_cad, price_aud, price_sgd,
  validity_days, per_credit_cost, savings_percent, badge,
  max_recipients, max_regenerations, max_reminders,
  stores_level, has_signal_check, has_batch_mode,
  has_priority_ai, has_history_export,
  sort_order, is_active, features
) VALUES
(
  'Thoughtful', 'thoughtful', 25, 2.99,
  2.99, 2.99, 2.99, 2.99, 2.99, 2.99, 2.99,
  30, 0.12, 0, '💝',
  5, 2, 0, 'basic', false, false, false, false,
  1, true,
  ARRAY['25 gift sessions','Save up to 5 people','2 regenerations per session','Amazon + 1 local store','Confidence scores','30-day validity']
),
(
  'Confident', 'confident', 75, 5.99,
  5.99, 5.99, 5.99, 5.99, 5.99, 5.99, 5.99,
  60, 0.08, 33, '🎯 Best Value',
  15, 3, 3, 'all', true, true, false, false,
  2, true,
  ARRAY['75 gift sessions','Save up to 15 people','3 regenerations per session','All stores in your region','Signal Check — see what your gift says','Batch mode for festivals','3 occasion reminders','60-day validity']
),
(
  'Gifting Pro', 'gifting-pro', 200, 14.99,
  14.99, 14.99, 14.99, 14.99, 14.99, 14.99, 14.99,
  90, 0.07, 37, '🚀 Power Gifter',
  -1, -1, -1, 'all', true, true, true, true,
  3, true,
  ARRAY['200 gift sessions','Unlimited people','Unlimited regenerations','All stores in your region','Signal Check','Batch mode for festivals','Unlimited occasion reminders','Priority AI — faster & smarter','Export gift history','90-day validity']
);

-- =============================================
-- STEP 3: Update signup trigger
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, referral_code, credits_balance, active_plan)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    3,
    'spark'
  )
  ON CONFLICT (id) DO UPDATE SET
    credits_balance = CASE
      WHEN public.users.credits_balance = 0 OR public.users.credits_balance IS NULL
      THEN 3 ELSE public.users.credits_balance
    END;

  INSERT INTO public.credit_batches (
    user_id, package_name, credits_purchased, credits_remaining,
    price_paid, currency, payment_provider, expires_at
  ) VALUES (
    new.id, 'spark_free', 3, 3, 0, 'USD', 'system', now() + interval '7 days'
  ) ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
