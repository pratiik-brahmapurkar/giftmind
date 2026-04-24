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
    'signal_checks_per_day'
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

CREATE OR REPLACE FUNCTION public.refund_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 1,
  p_reason text DEFAULT 'ai_generation_failed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_session_exists boolean;
  v_remaining numeric := GREATEST(COALESCE(p_amount, 1), 0);
  v_refunded numeric := 0;
  v_batch_refundable numeric;
  v_batch_refund numeric;
  v_usage RECORD;
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

  IF v_remaining = 0 THEN
    SELECT COALESCE(SUM(credits_remaining), 0)
    INTO v_new_balance
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
    )
    INTO v_batch_refundable
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND session_id = p_session_id
      AND type = 'refund'
      AND batch_id = v_usage.batch_id;

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
      jsonb_build_object('reason', COALESCE(NULLIF(p_reason, ''), 'ai_generation_failed'))
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

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refunded,
    'new_balance', v_new_balance,
    'already_refunded', v_refunded = 0
  );
END;
$$;
