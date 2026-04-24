ALTER TABLE public.credit_batches
  ADD COLUMN IF NOT EXISTS batch_type text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS credit_month text;

ALTER TABLE public.credit_batches
  DROP CONSTRAINT IF EXISTS credit_batches_batch_type_check;

ALTER TABLE public.credit_batches
  ADD CONSTRAINT credit_batches_batch_type_check
  CHECK (batch_type IN ('free_monthly', 'paid', 'referral_bonus', 'free_signup', 'admin_grant'));

UPDATE public.credit_batches
SET batch_type = CASE
  WHEN package_name = 'free_signup' THEN 'free_signup'
  WHEN package_name = 'admin_grant' OR payment_provider = 'admin' THEN 'admin_grant'
  WHEN payment_provider = 'referral' OR package_name ILIKE 'referral%' THEN 'referral_bonus'
  ELSE 'paid'
END
WHERE batch_type IS NULL
   OR batch_type = 'paid';

CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_one_free_monthly_per_month
ON public.credit_batches (user_id, credit_month)
WHERE batch_type = 'free_monthly';

CREATE TABLE IF NOT EXISTS public.credit_action_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id text NOT NULL,
  action_type text NOT NULL,
  units integer NOT NULL CHECK (units >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'committed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id)
);

ALTER TABLE public.credit_action_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_batches
  ALTER COLUMN credits_purchased TYPE integer
  USING GREATEST(ROUND(COALESCE(credits_purchased, 0) * 2), 0)::integer,
  ALTER COLUMN credits_remaining TYPE integer
  USING GREATEST(ROUND(COALESCE(credits_remaining, 0) * 2), 0)::integer;

ALTER TABLE public.users
  ALTER COLUMN credits_balance TYPE integer
  USING GREATEST(ROUND(COALESCE(credits_balance, 0) * 2), 0)::integer;

ALTER TABLE public.gift_sessions
  ALTER COLUMN credits_used TYPE integer
  USING GREATEST(ROUND(COALESCE(credits_used, 0) * 2), 0)::integer;

ALTER TABLE public.gift_sessions
  ALTER COLUMN credits_used SET DEFAULT 0;

ALTER TABLE public.signal_checks
  ALTER COLUMN credits_used TYPE integer
  USING GREATEST(ROUND(COALESCE(credits_used, 0) * 2), 0)::integer;

ALTER TABLE public.signal_checks
  ALTER COLUMN credits_used SET DEFAULT 1;

ALTER TABLE public.credit_batches
  DROP CONSTRAINT IF EXISTS credit_batches_credits_purchased_nonnegative,
  DROP CONSTRAINT IF EXISTS credit_batches_credits_remaining_nonnegative;

ALTER TABLE public.credit_batches
  ADD CONSTRAINT credit_batches_credits_purchased_nonnegative CHECK (credits_purchased >= 0),
  ADD CONSTRAINT credit_batches_credits_remaining_nonnegative CHECK (credits_remaining >= 0);

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_credits_balance_nonnegative;

ALTER TABLE public.users
  ADD CONSTRAINT users_credits_balance_nonnegative CHECK (credits_balance >= 0);

ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_credits_used_nonnegative;

ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_credits_used_nonnegative CHECK (credits_used >= 0);

ALTER TABLE public.signal_checks
  DROP CONSTRAINT IF EXISTS signal_checks_credits_used_nonnegative;

ALTER TABLE public.signal_checks
  ADD CONSTRAINT signal_checks_credits_used_nonnegative CHECK (credits_used >= 0);

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('purchase', 'used', 'usage', 'bonus', 'refund', 'expired', 'referral', 'admin_grant', 'onboarding_bonus'));

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
    'free_monthly_units',
    'gift_generation_units',
    'message_draft_units',
    'signal_check_units',
    'relationship_insight_units',
    'free_tier_provider_chain',
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

DROP FUNCTION IF EXISTS public.deduct_user_credit(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.deduct_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount integer DEFAULT 1,
  p_action_id text DEFAULT NULL,
  p_action_type text DEFAULT 'gift_generation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer := GREATEST(COALESCE(p_amount, 0), 0);
  v_total_balance integer := 0;
  v_batch RECORD;
  v_deducted integer;
  v_session_exists boolean;
  v_existing_ledger public.credit_action_ledger%ROWTYPE;
BEGIN
  PERFORM 1
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  SELECT EXISTS(
    SELECT 1
    FROM public.gift_sessions
    WHERE id = p_session_id
      AND user_id = p_user_id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF COALESCE(NULLIF(p_action_id, ''), '') <> '' THEN
    SELECT *
    INTO v_existing_ledger
    FROM public.credit_action_ledger
    WHERE action_id = p_action_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT COALESCE(SUM(credits_remaining), 0)
      INTO v_total_balance
      FROM public.credit_batches
      WHERE user_id = p_user_id
        AND COALESCE(is_expired, false) = false
        AND credits_remaining > 0
        AND expires_at > now();

      RETURN jsonb_build_object(
        'success', true,
        'deducted', CASE WHEN v_existing_ledger.status = 'refunded' THEN 0 ELSE v_existing_ledger.units END,
        'remaining_balance', v_total_balance,
        'action_id', p_action_id,
        'action_type', v_existing_ledger.action_type,
        'already_processed', true,
        'ledger_status', v_existing_ledger.status
      );
    END IF;

    INSERT INTO public.credit_action_ledger (user_id, action_id, action_type, units, status)
    VALUES (p_user_id, p_action_id, COALESCE(NULLIF(p_action_type, ''), 'gift_generation'), v_remaining, 'pending');
  END IF;

  IF v_remaining = 0 THEN
    SELECT COALESCE(SUM(credits_remaining), 0)
    INTO v_total_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND COALESCE(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now();

    IF COALESCE(NULLIF(p_action_id, ''), '') <> '' THEN
      UPDATE public.credit_action_ledger
      SET status = 'committed', updated_at = now()
      WHERE action_id = p_action_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'deducted', 0,
      'remaining_balance', v_total_balance,
      'action_id', p_action_id,
      'action_type', COALESCE(NULLIF(p_action_type, ''), 'gift_generation')
    );
  END IF;

  SELECT COALESCE(SUM(credits_remaining), 0)
  INTO v_total_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND COALESCE(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  IF v_total_balance < v_remaining THEN
    IF COALESCE(NULLIF(p_action_id, ''), '') <> '' THEN
      DELETE FROM public.credit_action_ledger
      WHERE action_id = p_action_id
        AND status = 'pending';
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credits',
      'remaining_balance', v_total_balance
    );
  END IF;

  FOR v_batch IN
    SELECT id, credits_remaining, expires_at, batch_type
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND COALESCE(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now()
    ORDER BY expires_at ASC, created_at ASC
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
      p_user_id,
      'usage',
      -v_deducted,
      v_batch.id,
      p_session_id,
      jsonb_build_object(
        'batch_expires_at', v_batch.expires_at,
        'batch_type', v_batch.batch_type,
        'action_id', p_action_id,
        'action_type', COALESCE(NULLIF(p_action_type, ''), 'gift_generation')
      )
    );

    v_remaining := v_remaining - v_deducted;
  END LOOP;

  SELECT COALESCE(SUM(credits_remaining), 0)
  INTO v_total_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND COALESCE(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_total_balance,
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.gift_sessions
  SET credits_used = COALESCE(credits_used, 0) + GREATEST(COALESCE(p_amount, 0), 0),
      updated_at = now()
  WHERE id = p_session_id
    AND user_id = p_user_id;

  IF COALESCE(NULLIF(p_action_id, ''), '') <> '' THEN
    UPDATE public.credit_action_ledger
    SET status = 'committed', updated_at = now()
    WHERE action_id = p_action_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', GREATEST(COALESCE(p_amount, 0), 0),
    'remaining_balance', v_total_balance,
    'action_id', p_action_id,
    'action_type', COALESCE(NULLIF(p_action_type, ''), 'gift_generation')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.refund_user_credit(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.refund_user_credit(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.refund_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount integer DEFAULT 1,
  p_reason text DEFAULT 'ai_generation_failed',
  p_action_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer := 0;
  v_session_exists boolean;
  v_remaining integer := GREATEST(COALESCE(p_amount, 0), 0);
  v_refunded integer := 0;
  v_batch_refundable integer;
  v_batch_refund integer;
  v_usage RECORD;
  v_existing_ledger public.credit_action_ledger%ROWTYPE;
  v_has_ledger boolean := false;
BEGIN
  PERFORM 1
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  SELECT EXISTS(
    SELECT 1
    FROM public.gift_sessions
    WHERE id = p_session_id
      AND user_id = p_user_id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF COALESCE(NULLIF(p_action_id, ''), '') <> '' THEN
    SELECT *
    INTO v_existing_ledger
    FROM public.credit_action_ledger
    WHERE action_id = p_action_id
    FOR UPDATE;

    v_has_ledger := FOUND;

    IF v_has_ledger AND v_existing_ledger.status = 'refunded' THEN
      SELECT COALESCE(SUM(credits_remaining), 0)
      INTO v_new_balance
      FROM public.credit_batches
      WHERE user_id = p_user_id
        AND COALESCE(is_expired, false) = false
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

  IF v_remaining = 0 THEN
    SELECT COALESCE(SUM(credits_remaining), 0)
    INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND COALESCE(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now();

    RETURN jsonb_build_object('success', true, 'refunded', 0, 'new_balance', v_new_balance, 'already_refunded', true);
  END IF;

  FOR v_usage IN
    SELECT
      batch_id,
      ABS(SUM(amount))::integer AS used_amount,
      MAX(created_at) AS latest_usage_at
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND session_id = p_session_id
      AND type = 'usage'
      AND batch_id IS NOT NULL
      AND (
        COALESCE(NULLIF(p_action_id, ''), '') = ''
        OR metadata->>'action_id' = p_action_id
      )
    GROUP BY batch_id
    ORDER BY latest_usage_at DESC
  LOOP
    EXIT WHEN v_remaining <= 0;

    SELECT GREATEST(
      COALESCE(v_usage.used_amount, 0) - COALESCE(SUM(amount), 0),
      0
    )::integer
    INTO v_batch_refundable
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND session_id = p_session_id
      AND type = 'refund'
      AND batch_id = v_usage.batch_id
      AND (
        COALESCE(NULLIF(p_action_id, ''), '') = ''
        OR metadata->>'action_id' = p_action_id
      );

    IF COALESCE(v_batch_refundable, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_batch_refund := LEAST(v_batch_refundable, v_remaining);

    INSERT INTO public.credit_transactions (
      user_id,
      type,
      amount,
      batch_id,
      session_id,
      metadata
    ) VALUES (
      p_user_id,
      'refund',
      v_batch_refund,
      v_usage.batch_id,
      p_session_id,
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

  SELECT COALESCE(SUM(credits_remaining), 0)
  INTO v_new_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND COALESCE(is_expired, false) = false
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

  IF COALESCE(NULLIF(p_action_id, ''), '') <> '' AND v_has_ledger THEN
    UPDATE public.credit_action_ledger
    SET status = CASE WHEN v_refunded > 0 THEN 'refunded' ELSE status END,
        updated_at = now()
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

CREATE OR REPLACE FUNCTION public.issue_free_monthly_credits(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_month text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_units integer := COALESCE(
    (
      SELECT NULLIF(value, 'null')::integer
      FROM public.platform_settings
      WHERE key = 'free_monthly_units'
    ),
    30
  );
  v_expires_at timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  v_batch_id uuid;
  v_new_balance integer := 0;
  v_plan text;
  v_issued boolean := false;
BEGIN
  PERFORM 1
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  SELECT active_plan
  INTO v_plan
  FROM public.users
  WHERE id = p_user_id;

  IF COALESCE(v_plan, 'spark') <> 'spark' THEN
    SELECT COALESCE(SUM(credits_remaining), 0)
    INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND COALESCE(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now();

    RETURN jsonb_build_object(
      'issued', false,
      'eligible', false,
      'units', 0,
      'batch_id', NULL,
      'credit_month', v_credit_month,
      'expires_at', v_expires_at,
      'new_balance', v_new_balance
    );
  END IF;

  UPDATE public.credit_batches
  SET is_expired = true,
      credits_remaining = 0
  WHERE user_id = p_user_id
    AND batch_type = 'free_monthly'
    AND credit_month <> v_credit_month
    AND COALESCE(is_expired, false) = false;

  INSERT INTO public.credit_batches (
    user_id,
    package_name,
    credits_purchased,
    credits_remaining,
    price_paid,
    currency,
    payment_provider,
    expires_at,
    batch_type,
    credit_month
  )
  VALUES (
    p_user_id,
    'free_monthly',
    v_units,
    v_units,
    0,
    'USD',
    'system',
    v_expires_at,
    'free_monthly',
    v_credit_month
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_batch_id;

  IF v_batch_id IS NOT NULL THEN
    v_issued := true;
    INSERT INTO public.credit_transactions (
      user_id,
      type,
      amount,
      batch_id,
      metadata
    ) VALUES (
      p_user_id,
      'bonus',
      v_units,
      v_batch_id,
      jsonb_build_object(
        'reason', 'monthly_free_allocation',
        'credit_month', v_credit_month
      )
    );
  ELSE
    SELECT id
    INTO v_batch_id
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND batch_type = 'free_monthly'
      AND credit_month = v_credit_month
    LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(credits_remaining), 0)
  INTO v_new_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND COALESCE(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_new_balance,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'issued', v_issued,
    'eligible', true,
    'units', v_units,
    'batch_id', v_batch_id,
    'credit_month', v_credit_month,
    'expires_at', v_expires_at,
    'new_balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_credit(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_user_credit(uuid, uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_credit(uuid, uuid, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.refund_user_credit(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_user_credit(uuid, uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_user_credit(uuid, uuid, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.issue_free_monthly_credits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_free_monthly_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_free_monthly_credits(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, referral_code, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    6
  )
  ON CONFLICT (id) DO UPDATE SET
    credits_balance = CASE
      WHEN public.users.credits_balance = 0 OR public.users.credits_balance IS NULL
      THEN 6
      ELSE public.users.credits_balance
    END,
    referral_code = CASE
      WHEN public.users.referral_code IS NULL OR public.users.referral_code = ''
      THEN lower(substr(md5(random()::text), 1, 8))
      ELSE public.users.referral_code
    END,
    email = EXCLUDED.email,
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    avatar_url = CASE
      WHEN public.users.avatar_url IS NULL OR public.users.avatar_url = ''
      THEN EXCLUDED.avatar_url
      ELSE public.users.avatar_url
    END;

  INSERT INTO public.credit_batches (
    user_id, package_name, credits_purchased, credits_remaining,
    price_paid, currency, payment_provider, expires_at, batch_type
  )
  VALUES (
    NEW.id, 'free_signup', 6, 6,
    0, 'USD', 'system',
    now() + interval '7 days',
    'free_signup'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

INSERT INTO public.credit_batches (
  user_id, package_name, credits_purchased, credits_remaining,
  price_paid, currency, payment_provider, expires_at, batch_type
)
SELECT
  id,
  'free_signup',
  GREATEST(credits_balance, 2),
  credits_balance,
  0,
  COALESCE(currency_preference, 'USD'),
  'system',
  now() + interval '7 days',
  'free_signup'
FROM public.users u
WHERE credits_balance > 0
AND NOT EXISTS (
  SELECT 1 FROM public.credit_batches b WHERE b.user_id = u.id
);

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('free_monthly_units', '30', 'Monthly free allocation in units'),
  ('gift_generation_units', '2', 'Cost in units per gift recommendation'),
  ('message_draft_units', '1', 'Cost in units per AI message draft'),
  ('signal_check_units', '1', 'Cost in units per Signal Check'),
  ('relationship_insight_units', '0', 'Cost in units for relationship insight'),
  ('free_tier_provider_chain', '["groq-llama","gemini-flash","claude-haiku"]', 'Provider fallback chain for free tier'),
  ('referral_reward_units', '2', 'Units awarded to referrers per completed referral')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;
