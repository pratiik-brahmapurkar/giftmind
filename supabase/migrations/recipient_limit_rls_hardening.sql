-- Recipient plan limits and RLS hardening.
-- Run this SQL in Supabase SQL Editor.

-- =============================================
-- STEP 1: Server-side recipient limit trigger
-- =============================================
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
    WHEN 'spark' THEN 1
    WHEN 'thoughtful' THEN 5
    WHEN 'confident' THEN 15
    WHEN 'gifting-pro' THEN -1
    ELSE 1
  END;

  IF v_max != -1 AND v_count >= v_max THEN
    RAISE EXCEPTION 'Recipient limit reached. Plan "%" allows % people.', v_plan, v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_recipient_limit ON public.recipients;
CREATE TRIGGER enforce_recipient_limit
  BEFORE INSERT ON public.recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.check_recipient_limit();

-- =============================================
-- STEP 2: Safe user self-update helper
-- =============================================
CREATE OR REPLACE FUNCTION public.user_update_is_safe(
  _id uuid,
  _role text,
  _credits_balance numeric,
  _active_plan text,
  _referral_code text,
  _referred_by uuid,
  _email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = _id
      AND u.role IS NOT DISTINCT FROM _role
      AND u.credits_balance IS NOT DISTINCT FROM _credits_balance
      AND u.active_plan IS NOT DISTINCT FROM _active_plan
      AND u.referral_code IS NOT DISTINCT FROM _referral_code
      AND u.referred_by IS NOT DISTINCT FROM _referred_by
      AND u.email IS NOT DISTINCT FROM _email
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _user_id AND u.role = 'superadmin'
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'superadmin'
  );
$$;

-- =============================================
-- STEP 3: Enable RLS
-- =============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 4: Drop old overlapping user-data policies
-- =============================================
DO $$
DECLARE
  _table text;
  _policy record;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'users',
    'recipients',
    'credit_batches',
    'credit_transactions',
    'gift_sessions',
    'product_clicks',
    'gift_feedback',
    'referrals'
  ]
  LOOP
    FOR _policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = _table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _policy.policyname, _table);
    END LOOP;
  END LOOP;
END
$$;

-- =============================================
-- STEP 5: public.users
-- =============================================
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY users_update_safe ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND public.user_update_is_safe(
      id,
      role,
      credits_balance,
      active_plan,
      referral_code,
      referred_by,
      email
    )
  );

CREATE POLICY superadmin_select_all_users ON public.users
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY superadmin_update_all_users ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- No INSERT or DELETE policy for regular users.

-- =============================================
-- STEP 6: public.recipients
-- =============================================
CREATE POLICY recipients_select ON public.recipients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY recipients_insert ON public.recipients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY recipients_update ON public.recipients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY recipients_delete ON public.recipients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_recipients ON public.recipients
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- =============================================
-- STEP 7: public.credit_batches
-- =============================================
CREATE POLICY credit_batches_select ON public.credit_batches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_credit_batches ON public.credit_batches
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policy for regular users.

-- =============================================
-- STEP 8: public.credit_transactions
-- =============================================
CREATE POLICY credit_transactions_select ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_credit_transactions ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policy for regular users.

-- =============================================
-- STEP 9: public.gift_sessions
-- =============================================
CREATE POLICY gift_sessions_select ON public.gift_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY gift_sessions_insert ON public.gift_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gift_sessions_update ON public.gift_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gift_sessions_delete ON public.gift_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_gift_sessions ON public.gift_sessions
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- =============================================
-- STEP 10: public.product_clicks
-- =============================================
CREATE POLICY product_clicks_select ON public.product_clicks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY product_clicks_insert ON public.product_clicks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY product_clicks_update ON public.product_clicks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY product_clicks_delete ON public.product_clicks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_product_clicks ON public.product_clicks
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- =============================================
-- STEP 11: public.gift_feedback
-- =============================================
CREATE POLICY gift_feedback_select ON public.gift_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY gift_feedback_insert ON public.gift_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gift_feedback_update ON public.gift_feedback
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gift_feedback_delete ON public.gift_feedback
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_gift_feedback ON public.gift_feedback
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- =============================================
-- STEP 12: public.referrals
-- =============================================
CREATE POLICY referrals_select ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY superadmin_select_all_referrals ON public.referrals
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policy for regular users.
