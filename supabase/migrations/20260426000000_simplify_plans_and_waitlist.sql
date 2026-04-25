-- PRD 09: Collapse legacy paid bundles into Spark/Pro and add the Pro waitlist.

UPDATE public.users
SET active_plan = 'spark'
WHERE active_plan IS NULL
   OR active_plan = ''
   OR active_plan IN ('thoughtful', 'confident', 'gifting-pro', 'free', 'starter', 'popular');

UPDATE public.users
SET active_plan = 'pro'
WHERE active_plan = 'pro';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_active_plan_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS valid_plan_slug;
ALTER TABLE public.users ALTER COLUMN active_plan SET DEFAULT 'spark';
ALTER TABLE public.users
  ADD CONSTRAINT valid_plan_slug CHECK (active_plan IN ('spark', 'pro'));

CREATE OR REPLACE FUNCTION public.check_recipient_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  SELECT active_plan INTO v_plan
  FROM public.users
  WHERE id = NEW.user_id;

  SELECT count(*) INTO v_count
  FROM public.recipients
  WHERE user_id = NEW.user_id;

  v_max := CASE v_plan
    WHEN 'pro' THEN -1
    ELSE 5
  END;

  IF v_max != -1 AND v_count >= v_max THEN
    RAISE EXCEPTION 'Recipient limit reached for plan "%". Max: % people.', coalesce(v_plan, 'spark'), v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_recipient_limit ON public.recipients;
CREATE TRIGGER enforce_recipient_limit
  BEFORE INSERT ON public.recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.check_recipient_limit();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    referral_code,
    credits_balance,
    active_plan,
    onboarding_state
  )
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    0,
    'spark',
    jsonb_build_object(
      'status', 'not_started',
      'current_step', 1,
      'completed_steps', '[]'::jsonb,
      'skipped_steps', '[]'::jsonb,
      'audience', '[]'::jsonb,
      'gift_style', '[]'::jsonb,
      'skipped_recipient', false,
      'started_at', null,
      'completed_at', null
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    avatar_url = CASE
      WHEN public.users.avatar_url IS NULL OR public.users.avatar_url = ''
      THEN EXCLUDED.avatar_url
      ELSE public.users.avatar_url
    END,
    onboarding_state = CASE
      WHEN public.users.onboarding_state IS NULL
      THEN EXCLUDED.onboarding_state
      ELSE public.users.onboarding_state
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.plan_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan_slug text NOT NULL DEFAULT 'pro',
  source text NOT NULL DEFAULT 'upgrade_modal',
  price_feedback text,
  preferred_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_waitlist_plan_slug_check CHECK (plan_slug = 'pro'),
  CONSTRAINT plan_waitlist_source_check CHECK (
    source IN ('upgrade_modal', 'plans_page', 'soft_paywall', 'feature_lock', 'dashboard_nudge', 'settings')
  ),
  CONSTRAINT plan_waitlist_price_feedback_check CHECK (
    price_feedback IS NULL OR price_feedback IN ('yes_599', 'maybe_different_price', 'no')
  ),
  UNIQUE (user_id, plan_slug)
);

ALTER TABLE public.plan_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own waitlist entries" ON public.plan_waitlist;
CREATE POLICY "Users can view own waitlist entries"
  ON public.plan_waitlist FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own waitlist entries" ON public.plan_waitlist;
CREATE POLICY "Users can insert own waitlist entries"
  ON public.plan_waitlist FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS plan_waitlist_plan_created_idx
  ON public.plan_waitlist (plan_slug, created_at);

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('plan_spark_monthly_credits', '15', 'Spark display credits per month'),
  ('plan_spark_recipient_limit', '5', 'Spark saved profile limit'),
  ('plan_spark_reminder_limit', '2', 'Spark active reminder limit'),
  ('plan_pro_price_usd', '5.99', 'Planned monthly Pro subscription price'),
  ('plan_pro_status', '"coming_soon"', 'Pro launch status')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
