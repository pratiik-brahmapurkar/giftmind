-- Fix the credit deduction chain so GiftFlow Step 5 can deduct real credits.
-- 1. Add the missing RPC used by the deduct-credit edge function.
-- 2. Ensure new signups create a matching free credit batch.
-- 3. Backfill credit batches for existing users who only have users.credits_balance.

CREATE OR REPLACE FUNCTION public.deduct_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_amount;
  v_batch RECORD;
  v_deducted numeric;
  v_total_balance int;
BEGIN
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

    IF v_batch.credits_remaining >= v_remaining THEN
      v_deducted := v_remaining;
    ELSE
      v_deducted := v_batch.credits_remaining;
    END IF;

    UPDATE public.credit_batches
    SET credits_remaining = credits_remaining - v_deducted
    WHERE id = v_batch.id;

    INSERT INTO public.credit_transactions (
      user_id, type, amount, batch_id, session_id, metadata
    ) VALUES (
      p_user_id, 'usage', -v_deducted, v_batch.id, p_session_id,
      jsonb_build_object('batch_expires_at', v_batch.expires_at)
    );

    v_remaining := v_remaining - v_deducted;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credits'
    );
  END IF;

  SELECT COALESCE(SUM(credits_remaining), 0)::int
  INTO v_total_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND coalesce(is_expired, false) = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_total_balance, updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_amount,
    'remaining_balance', v_total_balance
  );
END;
$$;

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
    3
  )
  ON CONFLICT (id) DO UPDATE SET
    credits_balance = CASE
      WHEN public.users.credits_balance = 0 OR public.users.credits_balance IS NULL
      THEN 3
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
    price_paid, currency, payment_provider, expires_at
  )
  VALUES (
    NEW.id, 'free_signup', 3, 3,
    0, 'USD', 'system',
    now() + interval '14 days'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

INSERT INTO public.credit_batches (
  user_id, package_name, credits_purchased, credits_remaining,
  price_paid, currency, payment_provider, expires_at
)
SELECT
  id, 'free_signup', GREATEST(credits_balance, 1), credits_balance,
  0, COALESCE(currency_preference, 'USD'), 'system',
  now() + interval '14 days'
FROM public.users u
WHERE credits_balance > 0
AND NOT EXISTS (
  SELECT 1 FROM public.credit_batches b WHERE b.user_id = u.id
);
