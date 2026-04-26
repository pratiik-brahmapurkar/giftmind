-- Admin dashboard RBAC hardening and audit log support.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_label text,
  payload jsonb,
  ip_address inet,
  user_agent text
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role::text IN ('viewer', 'admin', 'superadmin')
  ORDER BY CASE role::text
    WHEN 'superadmin' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role_text(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role_text(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_any_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('viewer', 'admin', 'superadmin')
  );
$$;

REVOKE ALL ON FUNCTION public.has_any_admin_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_admin_role(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_users_role_from_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  next_role text;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT role::text
  INTO next_role
  FROM public.user_roles
  WHERE user_id = target_user_id
  ORDER BY CASE role::text
    WHEN 'superadmin' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'viewer' THEN 2
    WHEN 'user' THEN 1
    ELSE 0
  END DESC
  LIMIT 1;

  UPDATE public.users
  SET role = COALESCE(next_role, 'user')
  WHERE id = target_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_role_to_users ON public.user_roles;
CREATE TRIGGER sync_role_to_users
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_users_role_from_user_roles();

CREATE OR REPLACE FUNCTION public.prevent_last_superadmin_demotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text = 'superadmin'
      AND (SELECT COUNT(*) FROM public.user_roles WHERE role::text = 'superadmin' AND user_id <> OLD.user_id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last superadmin.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role::text = 'superadmin' AND NEW.role::text <> 'superadmin'
    AND (SELECT COUNT(*) FROM public.user_roles WHERE role::text = 'superadmin' AND user_id <> OLD.user_id) = 0 THEN
    RAISE EXCEPTION 'Cannot demote the last superadmin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_superadmin ON public.user_roles;
CREATE TRIGGER prevent_last_superadmin
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_superadmin_demotion();

UPDATE public.users u
SET role = ranked.role
FROM (
  SELECT DISTINCT ON (user_id) user_id, role::text AS role
  FROM public.user_roles
  ORDER BY user_id, CASE role::text
    WHEN 'superadmin' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'viewer' THEN 2
    WHEN 'user' THEN 1
    ELSE 0
  END DESC
) ranked
WHERE u.id = ranked.user_id;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_any_admin_role(auth.uid())
);

DROP POLICY IF EXISTS "Service role inserts audit log" ON public.admin_audit_log;
CREATE POLICY "Service role inserts audit log"
ON public.admin_audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS admin_roles_select_for_admins ON public.user_roles;
CREATE POLICY admin_roles_select_for_admins
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_any_admin_role(auth.uid())
);

DROP POLICY IF EXISTS admin_users_select_for_admins ON public.users;
CREATE POLICY admin_users_select_for_admins
ON public.users
FOR SELECT
TO authenticated
USING (
  public.has_any_admin_role(auth.uid())
);

DROP POLICY IF EXISTS "superadmin_only" ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_select_for_admins ON public.platform_settings;
CREATE POLICY platform_settings_select_for_admins
ON public.platform_settings
FOR SELECT
TO authenticated
USING (
  public.has_any_admin_role(auth.uid())
);

DROP POLICY IF EXISTS platform_settings_write_for_superadmins ON public.platform_settings;
CREATE POLICY platform_settings_write_for_superadmins
ON public.platform_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS admin_insert_credit_packages ON public.credit_packages;
DROP POLICY IF EXISTS admin_update_credit_packages ON public.credit_packages;
DROP POLICY IF EXISTS admin_delete_credit_packages ON public.credit_packages;
CREATE POLICY superadmin_insert_credit_packages
ON public.credit_packages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY superadmin_update_credit_packages
ON public.credit_packages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY superadmin_delete_credit_packages
ON public.credit_packages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS admin_delete_blog_posts ON public.blog_posts;
DROP POLICY IF EXISTS "Superadmins can delete posts" ON public.blog_posts;
CREATE POLICY superadmin_delete_blog_posts
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can insert marketplaces" ON public.marketplace_config;
DROP POLICY IF EXISTS "Superadmins can update marketplaces" ON public.marketplace_config;
DROP POLICY IF EXISTS "Superadmins can delete marketplaces" ON public.marketplace_config;
DROP POLICY IF EXISTS admin_insert_marketplace_config ON public.marketplace_config;
DROP POLICY IF EXISTS admin_update_marketplace_config ON public.marketplace_config;
DROP POLICY IF EXISTS admin_delete_marketplace_config ON public.marketplace_config;
CREATE POLICY admin_insert_marketplace_config
ON public.marketplace_config
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY admin_update_marketplace_config
ON public.marketplace_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY admin_delete_marketplace_config
ON public.marketplace_config
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
