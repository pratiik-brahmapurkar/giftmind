-- =============================================================================
-- PRD 08: Credits Wallet & Deduction Rules — Phase 1 Database Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================================================

-- ─── STEP 1: Add batch_type + credit_month to credit_batches ─────────────────

ALTER TABLE public.credit_batches
  ADD COLUMN IF NOT EXISTS batch_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (batch_type IN ('free_monthly', 'paid', 'referral_bonus', 'free_signup', 'admin_grant')),
  ADD COLUMN IF NOT EXISTS credit_month TEXT;  -- 'YYYY-MM', only for free_monthly batches

-- Backfill batch_type based on existing package_name values
UPDATE public.credit_batches SET batch_type = 'free_signup'
  WHERE package_name IN ('free_signup', 'spark_free') AND batch_type = 'paid';

UPDATE public.credit_batches SET batch_type = 'referral_bonus'
  WHERE package_name IN ('referral_reward', 'referral_signup_bonus') AND batch_type = 'paid';

UPDATE public.credit_batches SET batch_type = 'admin_grant'
  WHERE payment_provider = 'admin' AND batch_type = 'paid';

-- ─── STEP 2: Unique index — one free_monthly batch per user per month ─────────

CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_one_free_monthly_per_month
  ON public.credit_batches (user_id, credit_month)
  WHERE batch_type = 'free_monthly';

-- ─── STEP 3: Create credit_action_ledger (idempotency table) ─────────────────

CREATE TABLE IF NOT EXISTS public.credit_action_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id   TEXT NOT NULL,
  action_type TEXT NOT NULL,
  units       INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'committed', 'refunded')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_id)
);

ALTER TABLE public.credit_action_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger" ON public.credit_action_ledger;
CREATE POLICY "Users can view own ledger"
  ON public.credit_action_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── STEP 4: Double existing credits to integer unit system ──────────────────
-- 1 credit (old) = 2 units (new). This touches all users — verify in staging first.

UPDATE public.credit_batches
  SET credits_purchased = credits_purchased * 2,
      credits_remaining = credits_remaining * 2
  WHERE credits_purchased > 0;

UPDATE public.users
  SET credits_balance = credits_balance * 2
  WHERE credits_balance > 0;

-- ─── STEP 5: Update deduct_user_credit — add action_id + action_type ─────────

CREATE OR REPLACE FUNCTION public.deduct_user_credit(
  p_user_id    uuid,
  p_session_id uuid,
  p_amount     numeric DEFAULT 2,
  p_action_id  text    DEFAULT NULL,
  p_action_type text   DEFAULT 'gift_generation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining     numeric := p_amount;
  v_batch         RECORD;
  v_deducted      numeric;
  v_total_balance int;
  v_existing      RECORD;
BEGIN
  -- Idempotency check: if action_id already committed, return cached result
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

  -- Lock the user row to prevent concurrent races
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- FIFO deduction: oldest expiry first
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

  -- Recalculate balance
  SELECT COALESCE(SUM(credits_remaining), 0)::int INTO v_total_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND coalesce(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now();

  UPDATE public.users
    SET credits_balance = v_total_balance, updated_at = now()
    WHERE id = p_user_id;

  -- Write to ledger
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

-- ─── STEP 6: Update refund_user_credit — add action_id + ledger update ────────

CREATE OR REPLACE FUNCTION public.refund_user_credit(
  p_user_id    uuid,
  p_session_id uuid,
  p_amount     numeric DEFAULT 2,
  p_reason     text    DEFAULT 'ai_generation_failed',
  p_action_id  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance      numeric;
  v_session_exists   boolean;
  v_remaining        numeric := GREATEST(COALESCE(p_amount, 2), 0);
  v_refunded         numeric := 0;
  v_batch_refundable numeric;
  v_batch_refund     numeric;
  v_usage            RECORD;
  v_existing_ledger  RECORD;
BEGIN
  -- Idempotency: if already refunded via ledger, return early
  IF p_action_id IS NOT NULL THEN
    SELECT * INTO v_existing_ledger
      FROM public.credit_action_ledger
      WHERE action_id = p_action_id;

    IF FOUND AND v_existing_ledger.status = 'refunded' THEN
      SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
        FROM public.credit_batches
        WHERE user_id = p_user_id
          AND is_expired = false AND credits_remaining > 0 AND expires_at > now();

      RETURN jsonb_build_object(
        'success', true, 'refunded', 0, 'new_balance', v_new_balance, 'already_refunded', true
      );
    END IF;
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  SELECT EXISTS(
    SELECT 1 FROM public.gift_sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_remaining = 0 THEN
    SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
      FROM public.credit_batches
      WHERE user_id = p_user_id AND is_expired = false
        AND credits_remaining > 0 AND expires_at > now();

    RETURN jsonb_build_object('success', true, 'refunded', 0, 'new_balance', v_new_balance, 'already_refunded', true);
  END IF;

  FOR v_usage IN
    SELECT batch_id,
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
      COALESCE(v_usage.used_amount, 0) - COALESCE(SUM(amount), 0), 0
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
      WHERE id = v_usage.batch_id AND user_id = p_user_id;

    v_refunded := v_refunded + v_batch_refund;
    v_remaining := v_remaining - v_batch_refund;
  END LOOP;

  SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id AND is_expired = false
      AND credits_remaining > 0 AND expires_at > now();

  UPDATE public.users
    SET credits_balance = v_new_balance, updated_at = now()
    WHERE id = p_user_id;

  IF v_refunded > 0 THEN
    UPDATE public.gift_sessions
      SET credits_used = GREATEST(COALESCE(credits_used, 0) - v_refunded, 0), updated_at = now()
      WHERE id = p_session_id AND user_id = p_user_id;
  END IF;

  -- Update ledger to refunded
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

-- ─── STEP 7: New RPC — issue_free_monthly_credits ────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_free_monthly_credits(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_month TEXT;
  v_expires_at   TIMESTAMPTZ;
  v_existing_id  UUID;
  v_new_batch_id UUID;
  v_free_units   INTEGER := 30;  -- 15 credits × 2 units
  v_new_balance  INTEGER;
  v_user_plan    TEXT;
BEGIN
  -- Only issue to spark (free) plan users
  SELECT active_plan INTO v_user_plan FROM public.users WHERE id = p_user_id;
  IF v_user_plan IS DISTINCT FROM 'spark' THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'not_free_tier');
  END IF;

  v_credit_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_expires_at   := date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month';

  -- Check if already issued this month
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

  -- Expire any old free_monthly batches (no rollover)
  UPDATE public.credit_batches
    SET is_expired = true
    WHERE user_id = p_user_id
      AND batch_type = 'free_monthly'
      AND credit_month <> v_credit_month;

  -- Issue new monthly batch
  INSERT INTO public.credit_batches (
    user_id, package_name, credits_purchased, credits_remaining,
    batch_type, credit_month, price_paid, currency, payment_provider, expires_at
  ) VALUES (
    p_user_id, 'free_monthly', v_free_units, v_free_units,
    'free_monthly', v_credit_month, 0, 'USD', 'system', v_expires_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_batch_id;

  -- Recalculate balance
  SELECT COALESCE(SUM(credits_remaining), 0)::int INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND coalesce(is_expired, false) = false
      AND credits_remaining > 0
      AND expires_at > now();

  UPDATE public.users
    SET credits_balance = v_new_balance, updated_at = now()
    WHERE id = p_user_id;

  -- Log the issuance as a bonus transaction
  INSERT INTO public.credit_transactions (user_id, type, amount, batch_id, metadata)
    VALUES (
      p_user_id, 'bonus', v_free_units, v_new_batch_id,
      jsonb_build_object('reason', 'free_monthly_issuance', 'credit_month', v_credit_month)
    );

  RETURN jsonb_build_object(
    'issued', true,
    'units', v_free_units,
    'credit_month', v_credit_month,
    'expires_at', v_expires_at,
    'batch_id', v_new_batch_id,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_free_monthly_credits(uuid) TO service_role;

-- ─── STEP 8: Platform settings — new credit cost keys ────────────────────────

INSERT INTO public.platform_settings (key, value) VALUES
  ('free_monthly_units',         '30'),
  ('gift_generation_units',      '2'),
  ('message_draft_units',        '1'),
  ('signal_check_units',         '1'),
  ('relationship_insight_units', '0'),
  ('referral_reward_units',      '2')
ON CONFLICT (key) DO NOTHING;

-- ─── VERIFY ───────────────────────────────────────────────────────────────────
-- Run these selects after to confirm everything looks right:
--
-- SELECT id, package_name, batch_type, credits_purchased, credits_remaining, expires_at
-- FROM public.credit_batches ORDER BY created_at DESC LIMIT 20;
--
-- SELECT id, credits_balance FROM public.users LIMIT 10;
--
-- SELECT * FROM public.platform_settings
-- WHERE key IN ('free_monthly_units','gift_generation_units','signal_check_units',
--               'message_draft_units','relationship_insight_units','referral_reward_units');
