-- GiftMind PRD Database Single Source SQL
-- Last updated: 2026-04-25
--
-- Purpose:
--   Paste this file into the Supabase SQL Editor when you need one ordered SQL
--   script for the currently implemented PRD database changes.
--
-- Scope:
--   Covers active app PRDs: onboarding, recipients, gift flow, results/product
--   links, signal check, reminders, credits, and plans/waitlist.
--
-- Assumptions:
--   The original base app schema already exists: public.users,
--   public.recipients, public.gift_sessions, public.credit_batches,
--   public.credit_transactions, public.product_clicks, public.platform_settings,
--   public.marketplace_config, and role helper functions such as
--   public.has_role/public.is_superadmin.
--
-- Important:
--   This script is intentionally guarded where possible. The PRD 08 credit-unit
--   conversion is protected by a platform_settings marker so balances are not
--   doubled repeatedly.
--
-- Not included:
--   Supabase Edge Function deployment. Deploy functions separately with
--   `supabase functions deploy <name>`.

BEGIN;

-- =============================================================================
-- 1. Onboarding Profile Setup
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_completion_percentage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_bonus_granted boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND constraint_name = 'users_profile_completion_percentage_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_profile_completion_percentage_check
      CHECK (profile_completion_percentage >= 0 AND profile_completion_percentage <= 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_profile_completion(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 0;
  v_user record;
  v_recipient_count integer := 0;
  v_audience_len integer := 0;
  v_style_len integer := 0;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  IF v_user.full_name IS NOT NULL AND length(trim(v_user.full_name)) >= 2 THEN
    v_score := v_score + 20;
  END IF;

  IF v_user.country IS NOT NULL AND trim(v_user.country) <> '' THEN
    v_score := v_score + 20;
  END IF;

  SELECT count(*) INTO v_recipient_count
  FROM public.recipients
  WHERE user_id = p_user_id;

  IF v_recipient_count >= 1 THEN
    v_score := v_score + 25;
  END IF;

  IF v_user.onboarding_state IS NOT NULL THEN
    v_audience_len := COALESCE(jsonb_array_length(v_user.onboarding_state->'audience'), 0);
    v_style_len := COALESCE(jsonb_array_length(v_user.onboarding_state->'gift_style'), 0);
  END IF;

  IF v_audience_len > 0 THEN
    v_score := v_score + 15;
  END IF;

  IF v_user.birthday IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;

  IF v_style_len > 0 THEN
    v_score := v_score + 10;
  END IF;

  RETURN LEAST(v_score, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_profile_completion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.profile_completion_percentage := public.calculate_profile_completion(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_completion_on_user_update ON public.users;
CREATE TRIGGER sync_profile_completion_on_user_update
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_completion();

CREATE OR REPLACE FUNCTION public.refresh_profile_completion_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF v_user_id IS NOT NULL THEN
    UPDATE public.users
    SET profile_completion_percentage = public.calculate_profile_completion(v_user_id)
    WHERE id = v_user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS refresh_profile_completion_on_recipient_change ON public.recipients;
CREATE TRIGGER refresh_profile_completion_on_recipient_change
  AFTER INSERT OR UPDATE OR DELETE ON public.recipients
  FOR EACH ROW EXECUTE FUNCTION public.refresh_profile_completion_for_user();

-- =============================================================================
-- 2. Recipient Management
-- =============================================================================

ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_count_cached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_gift_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'recipients'
      AND constraint_name = 'recipients_notes_length'
  ) THEN
    ALTER TABLE public.recipients
      ADD CONSTRAINT recipients_notes_length
      CHECK (notes IS NULL OR length(notes) <= 500);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipients_user_created
  ON public.recipients(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipients_user_last_gift
  ON public.recipients(user_id, last_gift_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_recipients_user_archived
  ON public.recipients(user_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_recipients_interests_gin
  ON public.recipients USING GIN(interests);

UPDATE public.recipients
SET cultural_context = jsonb_build_object(
  'category', cultural_context,
  'dietary', '[]'::jsonb
)::text
WHERE cultural_context IS NOT NULL
  AND cultural_context != ''
  AND left(trim(cultural_context), 1) != '{';

-- =============================================================================
-- 3. Gift Flow Foundation
-- =============================================================================

ALTER TABLE public.gift_sessions
  ALTER COLUMN currency SET DEFAULT 'USD';

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS selected_gift_note text,
  ADD COLUMN IF NOT EXISTS product_results jsonb,
  ADD COLUMN IF NOT EXISTS regeneration_count integer NOT NULL DEFAULT 0;

UPDATE public.gift_sessions
SET status = 'active'
WHERE status = 'in_progress';

ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_status_check;

ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_status_check
  CHECK (status IS NULL OR status IN ('active', 'completed', 'abandoned', 'errored'));

ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_recipient_id_fkey;

ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_recipient_id_fkey
    FOREIGN KEY (recipient_id)
    REFERENCES public.recipients(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.feedback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  occasion text NOT NULL,
  occasion_date date,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);

ALTER TABLE public.feedback_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_reminders_own ON public.feedback_reminders;
CREATE POLICY feedback_reminders_own
ON public.feedback_reminders
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_recipient_stats_for(recipient_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF recipient_uuid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.recipients
  SET
    session_count = (
      SELECT count(*)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
    ),
    gift_count_cached = (
      SELECT count(*)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    ),
    last_gift_date = (
      SELECT max(created_at)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    ),
    last_gift_name = (
      SELECT selected_gift_name
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
        AND selected_gift_name IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    )
  WHERE id = recipient_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_recipient_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_recipient_stats_for(COALESCE(NEW.recipient_id, OLD.recipient_id));

  IF TG_OP = 'UPDATE' AND NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN
    PERFORM public.update_recipient_stats_for(OLD.recipient_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS gift_sessions_update_recipient_stats ON public.gift_sessions;
CREATE TRIGGER gift_sessions_update_recipient_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.gift_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_recipient_stats();

-- =============================================================================
-- 4. Product Results, Product Links, and Affiliate Tables
-- =============================================================================

ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommendation_index integer,
  ADD COLUMN IF NOT EXISTS recommendation_confidence integer,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS estimated_price numeric,
  ADD COLUMN IF NOT EXISTS clicked_from text DEFAULT 'results_screen',
  ADD COLUMN IF NOT EXISTS store_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'product_clicks'
      AND constraint_name = 'product_clicks_recommendation_index_check'
  ) THEN
    ALTER TABLE public.product_clicks
      ADD CONSTRAINT product_clicks_recommendation_index_check
      CHECK (recommendation_index IS NULL OR recommendation_index BETWEEN 0 AND 2);
  END IF;
END $$;

UPDATE public.product_clicks
SET store_id = store
WHERE store_id IS NULL AND store IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clicks_user_at
  ON public.product_clicks(user_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_clicks_session
  ON public.product_clicks(session_id);

CREATE INDEX IF NOT EXISTS idx_clicks_store_country
  ON public.product_clicks(store_name, country);

CREATE INDEX IF NOT EXISTS idx_clicks_recipient
  ON public.product_clicks(recipient_id);

CREATE TABLE IF NOT EXISTS public.marketplace_products (
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

CREATE INDEX IF NOT EXISTS marketplace_products_store_country_idx
  ON public.marketplace_products (store_id, country_code, is_active, priority);

CREATE INDEX IF NOT EXISTS marketplace_products_category_idx
  ON public.marketplace_products (product_category);

CREATE INDEX IF NOT EXISTS marketplace_products_keywords_idx
  ON public.marketplace_products USING gin (keyword_tags);

ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_select_all_marketplace_products ON public.marketplace_products;
CREATE POLICY admin_select_all_marketplace_products
ON public.marketplace_products
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS admin_insert_marketplace_products ON public.marketplace_products;
CREATE POLICY admin_insert_marketplace_products
ON public.marketplace_products
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS admin_update_marketplace_products ON public.marketplace_products;
CREATE POLICY admin_update_marketplace_products
ON public.marketplace_products
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS admin_delete_marketplace_products ON public.marketplace_products;
CREATE POLICY admin_delete_marketplace_products
ON public.marketplace_products
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP TRIGGER IF EXISTS update_marketplace_products_updated_at ON public.marketplace_products;
CREATE TRIGGER update_marketplace_products_updated_at
  BEFORE UPDATE ON public.marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketplace_config
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affiliate_network text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affiliate_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'marketplace_config'
      AND constraint_name = 'marketplace_config_affiliate_network_check'
  ) THEN
    ALTER TABLE public.marketplace_config
      ADD CONSTRAINT marketplace_config_affiliate_network_check
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
      );
  END IF;
END $$;

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

-- =============================================================================
-- 5. Signal Check
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.signal_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  gift_name text NOT NULL,
  parent_signal_check_id uuid REFERENCES public.signal_checks(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1,
  follow_up_prompt text,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits_used numeric(4,1) NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_checks_revision_positive CHECK (revision_number >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_checks_session_gift_revision_idx
  ON public.signal_checks (session_id, gift_name, revision_number);

CREATE INDEX IF NOT EXISTS signal_checks_user_created_idx
  ON public.signal_checks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS signal_checks_session_gift_created_idx
  ON public.signal_checks (session_id, gift_name, created_at DESC);

ALTER TABLE public.signal_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_checks_select_own ON public.signal_checks;
CREATE POLICY signal_checks_select_own
ON public.signal_checks
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS signal_checks_insert_own ON public.signal_checks;
CREATE POLICY signal_checks_insert_own
ON public.signal_checks
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS superadmin_select_all_signal_checks ON public.signal_checks;
CREATE POLICY superadmin_select_all_signal_checks
ON public.signal_checks
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE OR REPLACE FUNCTION public.get_public_platform_settings(
  p_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_keys text[] := ARRAY[
    'feature_signal_check',
    'signal_check_cost',
    'signal_checks_per_day',
    'signal_check_units',
    'gift_generation_units',
    'free_monthly_units',
    'message_draft_units',
    'relationship_insight_units',
    'referral_reward_units'
  ];
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_object_agg(key, value)
      FROM public.platform_settings
      WHERE key = ANY(p_keys)
        AND key = ANY(v_allowed_keys)
    ),
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_platform_settings(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings(text[]) TO service_role;

-- =============================================================================
-- 6. Reminder Logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('occasion', 'feedback')),
  date_label text NOT NULL DEFAULT '',
  date_value text NOT NULL DEFAULT '',
  days_before integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_day date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_occasion_unique
  ON public.reminder_logs(recipient_id, date_value, days_before, sent_day)
  WHERE kind = 'occasion' AND recipient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_feedback_unique
  ON public.reminder_logs(session_id, sent_day)
  WHERE kind = 'feedback' AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_logs_user_sent_day
  ON public.reminder_logs(user_id, sent_day DESC);

-- =============================================================================
-- 7. Credits Wallet and Monthly Free Credits
-- =============================================================================

ALTER TABLE public.credit_batches
  ADD COLUMN IF NOT EXISTS batch_type text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS credit_month text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'credit_batches'
      AND constraint_name = 'credit_batches_batch_type_check'
  ) THEN
    ALTER TABLE public.credit_batches
      ADD CONSTRAINT credit_batches_batch_type_check
      CHECK (batch_type IN ('free_monthly', 'paid', 'referral_bonus', 'free_signup', 'admin_grant'));
  END IF;
END $$;

UPDATE public.credit_batches SET batch_type = 'free_signup'
  WHERE package_name IN ('free_signup', 'spark_free') AND batch_type = 'paid';

UPDATE public.credit_batches SET batch_type = 'referral_bonus'
  WHERE package_name IN ('referral_reward', 'referral_signup_bonus') AND batch_type = 'paid';

UPDATE public.credit_batches SET batch_type = 'admin_grant'
  WHERE payment_provider = 'admin' AND batch_type = 'paid';

CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_one_free_monthly_per_month
  ON public.credit_batches (user_id, credit_month)
  WHERE batch_type = 'free_monthly';

CREATE TABLE IF NOT EXISTS public.credit_action_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id text NOT NULL,
  action_type text NOT NULL,
  units integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'committed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id)
);

ALTER TABLE public.credit_action_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger" ON public.credit_action_ledger;
CREATE POLICY "Users can view own ledger"
  ON public.credit_action_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Convert legacy whole-credit balances to half-credit units once.
DO $$
DECLARE
  v_already_applied boolean;
BEGIN
  SELECT COALESCE(value::text IN ('true', '"true"'), false)
  INTO v_already_applied
  FROM public.platform_settings
  WHERE key = 'credit_units_migration_applied';

  IF NOT COALESCE(v_already_applied, false)
     AND NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'free_monthly_units') THEN
    UPDATE public.credit_batches
      SET credits_purchased = credits_purchased * 2,
          credits_remaining = credits_remaining * 2
      WHERE credits_purchased > 0;

    UPDATE public.users
      SET credits_balance = credits_balance * 2
      WHERE credits_balance > 0;
  END IF;

  INSERT INTO public.platform_settings (key, value, description)
  VALUES ('credit_units_migration_applied', 'true', 'Guard marker: legacy credits converted to internal units')
  ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.deduct_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 2,
  p_action_id text DEFAULT NULL,
  p_action_type text DEFAULT 'gift_generation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_amount;
  v_batch record;
  v_deducted numeric;
  v_total_balance int;
  v_existing record;
BEGIN
  IF p_action_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.credit_action_ledger
    WHERE action_id = p_action_id;

    IF FOUND AND v_existing.status = 'committed' THEN
      SELECT COALESCE(SUM(credits_remaining), 0)::int INTO v_total_balance
      FROM public.credit_batches
      WHERE user_id = p_user_id
        AND coalesce(is_expired, false) = false
        AND credits_remaining > 0
        AND expires_at > now();

      RETURN jsonb_build_object(
        'success', true,
        'deducted', p_amount,
        'remaining_balance', v_total_balance,
        'idempotent', true
      );
    END IF;

    IF FOUND AND v_existing.status = 'refunded' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Action already refunded');
    END IF;
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  FOR v_batch IN
    SELECT id, credits_remaining, expires_at
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND coalesce(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now()
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deducted := LEAST(v_batch.credits_remaining, v_remaining);

    UPDATE public.credit_batches
    SET credits_remaining = credits_remaining - v_deducted
    WHERE id = v_batch.id;

    INSERT INTO public.credit_transactions (
      user_id, type, amount, batch_id, session_id, metadata
    ) VALUES (
      p_user_id, 'usage', -v_deducted, v_batch.id, p_session_id,
      jsonb_build_object(
        'batch_expires_at', v_batch.expires_at,
        'action_id', p_action_id,
        'action_type', p_action_type
      )
    );

    v_remaining := v_remaining - v_deducted;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits');
  END IF;

  SELECT COALESCE(SUM(credits_remaining), 0)::int INTO v_total_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND coalesce(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_total_balance, updated_at = now()
  WHERE id = p_user_id;

  IF p_action_id IS NOT NULL THEN
    INSERT INTO public.credit_action_ledger (user_id, action_id, action_type, units, status)
    VALUES (p_user_id, p_action_id, p_action_type, p_amount::integer, 'committed')
    ON CONFLICT (action_id) DO UPDATE SET status = 'committed', updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_amount,
    'remaining_balance', v_total_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 2,
  p_reason text DEFAULT 'ai_generation_failed',
  p_action_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_session_exists boolean;
  v_remaining numeric := GREATEST(COALESCE(p_amount, 2), 0);
  v_refunded numeric := 0;
  v_batch_refundable numeric;
  v_batch_refund numeric;
  v_usage record;
  v_existing_ledger record;
BEGIN
  IF p_action_id IS NOT NULL THEN
    SELECT * INTO v_existing_ledger
    FROM public.credit_action_ledger
    WHERE action_id = p_action_id;

    IF FOUND AND v_existing_ledger.status = 'refunded' THEN
      SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
      FROM public.credit_batches
      WHERE user_id = p_user_id
        AND is_expired = false
        AND credits_remaining > 0
        AND expires_at > now();

      RETURN jsonb_build_object(
        'success', true,
        'refunded', 0,
        'new_balance', v_new_balance,
        'already_refunded', true
      );
    END IF;
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  SELECT EXISTS(
    SELECT 1
    FROM public.gift_sessions
    WHERE id = p_session_id
      AND user_id = p_user_id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_remaining = 0 THEN
    SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND is_expired = false
      AND credits_remaining > 0
      AND expires_at > now();

    RETURN jsonb_build_object('success', true, 'refunded', 0, 'new_balance', v_new_balance, 'already_refunded', true);
  END IF;

  FOR v_usage IN
    SELECT
      batch_id,
      ABS(SUM(amount)) AS used_amount,
      MAX(created_at) AS latest_usage_at
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND session_id = p_session_id
      AND type = 'usage'
      AND batch_id IS NOT NULL
    GROUP BY batch_id
    ORDER BY latest_usage_at DESC
  LOOP
    EXIT WHEN v_remaining <= 0;

    SELECT GREATEST(
      COALESCE(v_usage.used_amount, 0) - COALESCE(SUM(amount), 0),
      0
    ) INTO v_batch_refundable
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND session_id = p_session_id
      AND type = 'refund'
      AND batch_id = v_usage.batch_id;

    CONTINUE WHEN COALESCE(v_batch_refundable, 0) <= 0;

    v_batch_refund := LEAST(v_batch_refundable, v_remaining);

    INSERT INTO public.credit_transactions (
      user_id, type, amount, batch_id, session_id, metadata
    ) VALUES (
      p_user_id, 'refund', v_batch_refund, v_usage.batch_id, p_session_id,
      jsonb_build_object(
        'reason', COALESCE(NULLIF(p_reason, ''), 'ai_generation_failed'),
        'action_id', p_action_id
      )
    );

    UPDATE public.credit_batches
    SET credits_remaining = credits_remaining + v_batch_refund
    WHERE id = v_usage.batch_id
      AND user_id = p_user_id;

    v_refunded := v_refunded + v_batch_refund;
    v_remaining := v_remaining - v_batch_refund;
  END LOOP;

  SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND is_expired = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_new_balance,
      updated_at = now()
  WHERE id = p_user_id;

  IF v_refunded > 0 THEN
    UPDATE public.gift_sessions
    SET credits_used = GREATEST(COALESCE(credits_used, 0) - v_refunded, 0),
        updated_at = now()
    WHERE id = p_session_id
      AND user_id = p_user_id;
  END IF;

  IF p_action_id IS NOT NULL THEN
    UPDATE public.credit_action_ledger
    SET status = 'refunded', updated_at = now()
    WHERE action_id = p_action_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refunded,
    'new_balance', v_new_balance,
    'already_refunded', v_refunded = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_free_monthly_credits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_month text;
  v_expires_at timestamptz;
  v_existing_id uuid;
  v_new_batch_id uuid;
  v_free_units integer := 30;
  v_new_balance integer;
  v_user_plan text;
BEGIN
  SELECT active_plan INTO v_user_plan FROM public.users WHERE id = p_user_id;
  IF v_user_plan IS DISTINCT FROM 'spark' THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'not_free_tier');
  END IF;

  v_credit_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_expires_at := date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month';

  SELECT id INTO v_existing_id
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND batch_type = 'free_monthly'
    AND credit_month = v_credit_month;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'issued', false,
      'reason', 'already_issued_this_month',
      'credit_month', v_credit_month,
      'batch_id', v_existing_id
    );
  END IF;

  UPDATE public.credit_batches
  SET is_expired = true
  WHERE user_id = p_user_id
    AND batch_type = 'free_monthly'
    AND credit_month <> v_credit_month;

  INSERT INTO public.credit_batches (
    user_id, package_name, credits_purchased, credits_remaining,
    batch_type, credit_month, price_paid, currency, payment_provider, expires_at
  ) VALUES (
    p_user_id, 'free_monthly', v_free_units, v_free_units,
    'free_monthly', v_credit_month, 0, 'USD', 'system', v_expires_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_batch_id;

  SELECT COALESCE(SUM(credits_remaining), 0)::int INTO v_new_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND coalesce(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  IF v_new_batch_id IS NOT NULL THEN
    INSERT INTO public.credit_transactions (user_id, type, amount, batch_id, metadata)
    VALUES (
      p_user_id, 'bonus', v_free_units, v_new_batch_id,
      jsonb_build_object('reason', 'free_monthly_issuance', 'credit_month', v_credit_month)
    );
  END IF;

  RETURN jsonb_build_object(
    'issued', v_new_batch_id IS NOT NULL,
    'units', v_free_units,
    'credit_month', v_credit_month,
    'expires_at', v_expires_at,
    'batch_id', v_new_batch_id,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_free_monthly_credits(uuid) TO service_role;

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('free_monthly_units', '30', '15 free monthly credits in internal units'),
  ('gift_generation_units', '2', 'Gift generation cost in internal units'),
  ('message_draft_units', '1', 'AI message draft cost in internal units'),
  ('signal_check_units', '1', 'Signal Check cost in internal units'),
  ('relationship_insight_units', '0', 'Relationship insight cost in internal units'),
  ('referral_reward_units', '2', 'Referral reward in internal units')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = COALESCE(EXCLUDED.description, public.platform_settings.description),
  updated_at = now();

-- =============================================================================
-- 8. Plans, Limits, and Waitlist
-- =============================================================================

UPDATE public.users
SET active_plan = 'spark'
WHERE active_plan IS NULL
   OR active_plan = ''
   OR active_plan IN ('thoughtful', 'confident', 'gifting-pro', 'free', 'starter', 'popular');

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

-- =============================================================================
-- 9. RLS Policy Refresh
-- =============================================================================

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND onboarding_bonus_granted = (
      SELECT onboarding_bonus_granted FROM public.users WHERE id = auth.uid()
    )
    AND credits_balance = (
      SELECT credits_balance FROM public.users WHERE id = auth.uid()
    )
    AND role = (
      SELECT role FROM public.users WHERE id = auth.uid()
    )
    AND active_plan = (
      SELECT active_plan FROM public.users WHERE id = auth.uid()
    )
  );

-- Recompute derived fields after all triggers/functions are in place.
UPDATE public.users u
SET profile_completion_percentage = public.calculate_profile_completion(u.id);

SELECT public.update_recipient_stats_for(id)
FROM public.recipients;

COMMIT;

-- =============================================================================
-- Optional Cron Setup
-- =============================================================================
-- Do not run this block as-is. Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET
-- first, then run separately after the transaction above succeeds.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.unschedule('send-occasion-reminders')
-- WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-occasion-reminders');
--
-- SELECT cron.unschedule('send-feedback-reminders')
-- WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-feedback-reminders');
--
-- SELECT cron.schedule(
--   'send-occasion-reminders',
--   '30 3 * * *',
--   $cron$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-occasion-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', 'YOUR_CRON_SECRET'
--     ),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
--
-- SELECT cron.schedule(
--   'send-feedback-reminders',
--   '35 3 * * *',
--   $cron$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-feedback-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', 'YOUR_CRON_SECRET'
--     ),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
