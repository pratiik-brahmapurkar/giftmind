-- Fix users_update_own policy: the previous version used = comparisons which
-- fail for NULL columns (NULL = NULL is NULL, not TRUE). Restore the safe
-- comparison approach using IS NOT DISTINCT FROM, now also covering the new
-- onboarding_bonus_granted column.

CREATE OR REPLACE FUNCTION public.user_update_is_safe(
  _id uuid,
  _role text,
  _credits_balance numeric,
  _active_plan text,
  _referral_code text,
  _referred_by uuid,
  _email text,
  _onboarding_bonus_granted boolean
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
      AND u.onboarding_bonus_granted IS NOT DISTINCT FROM _onboarding_bonus_granted
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_update_is_safe(uuid, text, numeric, text, text, uuid, text, boolean)
  TO authenticated;

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
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
      email,
      onboarding_bonus_granted
    )
  );
