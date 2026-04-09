-- Security hardening for application RLS policies.
-- Run this SQL in the Supabase SQL Editor, or apply it as a migration.

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = _user_id
        AND u.role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'superadmin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = _user_id
        AND u.role IN ('admin', 'superadmin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('admin', 'superadmin')
    );
$$;

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

-- ---------------------------------------------------------------------------
-- Server-side rate limit support
-- Service-role edge functions write here; client roles get no access.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  identifier text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_events_action_identifier_created_at_idx
  ON public.rate_limit_events (action, identifier, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limit_events IS
  'Edge-function rate limit ledger keyed by action and identifier.';

-- ---------------------------------------------------------------------------
-- Reset policies on audited tables
-- ---------------------------------------------------------------------------

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
    'referrals',
    'credit_packages',
    'blog_categories',
    'blog_posts',
    'blog_media',
    'marketplace_config'
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

-- ---------------------------------------------------------------------------
-- Enable RLS on all audited tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- public.users
-- Users can read/update only their own safe fields.
-- Role, credits, plan, referral state, and email are immutable to end users.
-- ---------------------------------------------------------------------------

CREATE POLICY users_select_own
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

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
    email
  )
);

CREATE POLICY superadmin_select_all_users
ON public.users
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE POLICY superadmin_update_all_users
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- No INSERT policy on public.users.
-- No DELETE policy on public.users.

-- ---------------------------------------------------------------------------
-- public.recipients
-- ---------------------------------------------------------------------------

CREATE POLICY recipients_select_own
ON public.recipients
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY recipients_insert_own
ON public.recipients
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY recipients_update_own
ON public.recipients
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY recipients_delete_own
ON public.recipients
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY superadmin_select_all_recipients
ON public.recipients
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.credit_batches
-- ---------------------------------------------------------------------------

CREATE POLICY credit_batches_select_own
ON public.credit_batches
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY superadmin_select_all_credit_batches
ON public.credit_batches
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policies for regular client access.

-- ---------------------------------------------------------------------------
-- public.credit_transactions
-- ---------------------------------------------------------------------------

CREATE POLICY credit_transactions_select_own
ON public.credit_transactions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY superadmin_select_all_credit_transactions
ON public.credit_transactions
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policies for regular client access.

-- ---------------------------------------------------------------------------
-- public.gift_sessions
-- ---------------------------------------------------------------------------

CREATE POLICY gift_sessions_select_own
ON public.gift_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY gift_sessions_insert_own
ON public.gift_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY gift_sessions_update_own
ON public.gift_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY superadmin_select_all_gift_sessions
ON public.gift_sessions
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.product_clicks
-- ---------------------------------------------------------------------------

CREATE POLICY product_clicks_select_own
ON public.product_clicks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY product_clicks_insert_own
ON public.product_clicks
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY superadmin_select_all_product_clicks
ON public.product_clicks
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.gift_feedback
-- ---------------------------------------------------------------------------

CREATE POLICY gift_feedback_select_own
ON public.gift_feedback
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY gift_feedback_insert_own
ON public.gift_feedback
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY superadmin_select_all_gift_feedback
ON public.gift_feedback
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.referrals
-- ---------------------------------------------------------------------------

CREATE POLICY referrals_select_involved_user
ON public.referrals
FOR SELECT
TO authenticated
USING (
  referrer_id = auth.uid()
  OR referred_id = auth.uid()
);

CREATE POLICY superadmin_select_all_referrals
ON public.referrals
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- No INSERT / UPDATE / DELETE policies for regular client access.

-- ---------------------------------------------------------------------------
-- public.credit_packages
-- ---------------------------------------------------------------------------

CREATE POLICY credit_packages_select_public
ON public.credit_packages
FOR SELECT
USING (COALESCE(is_active, true));

CREATE POLICY admin_insert_credit_packages
ON public.credit_packages
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_credit_packages
ON public.credit_packages
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_credit_packages
ON public.credit_packages
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.blog_categories
-- ---------------------------------------------------------------------------

CREATE POLICY blog_categories_select_public
ON public.blog_categories
FOR SELECT
USING (true);

CREATE POLICY admin_insert_blog_categories
ON public.blog_categories
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_blog_categories
ON public.blog_categories
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_blog_categories
ON public.blog_categories
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.blog_posts
-- ---------------------------------------------------------------------------

CREATE POLICY blog_posts_select_published_public
ON public.blog_posts
FOR SELECT
USING (status = 'published');

CREATE POLICY admin_select_all_blog_posts
ON public.blog_posts
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_insert_blog_posts
ON public.blog_posts
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_blog_posts
ON public.blog_posts
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_blog_posts
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.blog_media
-- ---------------------------------------------------------------------------

CREATE POLICY admin_select_blog_media
ON public.blog_media
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_insert_blog_media
ON public.blog_media
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_blog_media
ON public.blog_media
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_blog_media
ON public.blog_media
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- public.marketplace_config
-- ---------------------------------------------------------------------------

CREATE POLICY marketplace_config_select_public
ON public.marketplace_config
FOR SELECT
USING (COALESCE(is_active, true));

CREATE POLICY admin_select_all_marketplace_config
ON public.marketplace_config
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_insert_marketplace_config
ON public.marketplace_config
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_marketplace_config
ON public.marketplace_config
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_marketplace_config
ON public.marketplace_config
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));
