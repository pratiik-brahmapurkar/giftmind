
-- Allow superadmins to read all profiles
CREATE POLICY "Superadmins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to read all credit_transactions
CREATE POLICY "Superadmins can view all transactions"
ON public.credit_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to read all gift_sessions
CREATE POLICY "Superadmins can view all sessions"
ON public.gift_sessions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to read all referrals
CREATE POLICY "Superadmins can view all referrals"
ON public.referrals FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to read all recipients
CREATE POLICY "Superadmins can view all recipients"
ON public.recipients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to update profiles (for disabling accounts)
CREATE POLICY "Superadmins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to insert user_roles (for changing roles)
CREATE POLICY "Superadmins can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to update user_roles
CREATE POLICY "Superadmins can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to delete user_roles
CREATE POLICY "Superadmins can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Allow superadmins to insert credit_transactions (for granting credits)
CREATE POLICY "Superadmins can insert transactions"
ON public.credit_transactions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
