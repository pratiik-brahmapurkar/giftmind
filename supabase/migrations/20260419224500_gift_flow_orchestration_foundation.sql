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

CREATE OR REPLACE FUNCTION public.refund_user_credit(
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
  v_batch_id uuid;
  v_new_balance numeric;
  v_session_exists boolean;
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

  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE session_id = p_session_id
      AND user_id = p_user_id
      AND type = 'refund'
  ) THEN
    SELECT COALESCE(SUM(credits_remaining), 0)
    INTO v_new_balance
    FROM public.credit_batches
    WHERE user_id = p_user_id
      AND is_expired = false
      AND credits_remaining > 0
      AND expires_at > now();

    RETURN jsonb_build_object('success', true, 'refunded', 0, 'new_balance', v_new_balance, 'already_refunded', true);
  END IF;

  SELECT batch_id
  INTO v_batch_id
  FROM public.credit_transactions
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND type = 'usage'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No usage transaction found');
  END IF;

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
    p_amount,
    v_batch_id,
    p_session_id,
    jsonb_build_object('reason', 'ai_generation_failed')
  );

  UPDATE public.credit_batches
  SET credits_remaining = credits_remaining + p_amount
  WHERE id = v_batch_id
    AND user_id = p_user_id;

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

  UPDATE public.gift_sessions
  SET credits_used = GREATEST(COALESCE(credits_used, 0) - p_amount, 0),
      updated_at = now()
  WHERE id = p_session_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'refunded', p_amount, 'new_balance', v_new_balance);
END;
$$;
