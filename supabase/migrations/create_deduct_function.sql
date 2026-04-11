DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'deduct_user_credit') THEN
    RAISE NOTICE 'Function does not exist — will create';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.deduct_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND is_expired = false
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
    RAISE EXCEPTION 'Insufficient credits. Needed %, could deduct %',
      p_amount, p_amount - v_remaining;
  END IF;

  SELECT COALESCE(SUM(credits_remaining), 0) INTO v_total_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND is_expired = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_total_balance, updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.gift_sessions
  SET credits_used = COALESCE(credits_used, 0) + p_amount
  WHERE id = p_session_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_amount,
    'remaining_balance', v_total_balance
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'remaining_balance', (
        SELECT COALESCE(SUM(credits_remaining), 0)
        FROM public.credit_batches
        WHERE user_id = p_user_id
          AND is_expired = false
          AND credits_remaining > 0
          AND expires_at > now()
      )
    );
END;
$$;
