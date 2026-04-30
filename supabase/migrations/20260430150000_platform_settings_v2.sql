-- PRD 13: platform settings v2, provider routing, public flags, and settings history.

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('provider_chain_spark_gifts',   '["groq-llama","gemini-flash","claude-haiku"]',   'Provider fallback chain for Spark plan gift generation'),
  ('provider_chain_pro_gifts',     '["claude-sonnet","claude-haiku","gemini-pro"]',  'Provider fallback chain for Pro plan gift generation'),
  ('provider_chain_signal_free',   '["groq-llama","gemini-flash","claude-haiku"]',   'Provider chain for Signal Check on Spark'),
  ('provider_chain_signal_pro',    '["claude-sonnet","claude-haiku","gemini-flash"]','Provider chain for Signal Check on Pro'),
  ('provider_chain_relationship',  '["groq-llama","gemini-flash","claude-haiku"]',   'Provider chain for relationship insight generation'),
  ('ai_timeout_ms_primary',        '45000',  'Timeout for primary AI provider in milliseconds'),
  ('ai_timeout_ms_fallback',       '30000',  'Timeout for fallback AI providers in milliseconds'),
  ('ai_max_attempts',              '3',      'Max AI providers to try before failing')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS idx_settings_history_key
  ON public.settings_history(key, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_settings_history_user
  ON public.settings_history(changed_by, changed_at DESC);

ALTER TABLE public.settings_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settings_history'
      AND policyname = 'settings_history_admin_read'
  ) THEN
    CREATE POLICY settings_history_admin_read ON public.settings_history
      FOR SELECT TO authenticated
      USING (public.has_any_admin_role(auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_settings_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email text := 'unknown';
  v_actor_role text := 'superadmin';
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT COALESCE(email, 'unknown'), COALESCE(role::text, 'superadmin')
    INTO v_actor_email, v_actor_role
    FROM public.users
    WHERE id = auth.uid();
  END IF;

  INSERT INTO public.settings_history (key, old_value, new_value, changed_by)
  VALUES (NEW.key, OLD.value, NEW.value, auth.uid());

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (
      actor_id,
      actor_email,
      actor_role,
      action,
      target_type,
      target_id,
      target_label,
      payload
    ) VALUES (
      auth.uid(),
      v_actor_email,
      v_actor_role,
      'platform_setting_updated',
      'platform_settings',
      NEW.key,
      NEW.key,
      jsonb_build_object('old_value', OLD.value, 'new_value', NEW.value)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_history_trigger ON public.platform_settings;
CREATE TRIGGER settings_history_trigger
  AFTER UPDATE ON public.platform_settings
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION public.record_settings_history();

DROP POLICY IF EXISTS "superadmin_only" ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_select_for_admins ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_write_for_superadmins ON public.platform_settings;
DROP POLICY IF EXISTS authenticated_read_public_settings ON public.platform_settings;
DROP POLICY IF EXISTS anon_read_maintenance ON public.platform_settings;

CREATE POLICY platform_settings_select_for_admins
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.has_any_admin_role(auth.uid()));

CREATE POLICY platform_settings_write_for_superadmins
ON public.platform_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY authenticated_read_public_settings ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key = ANY(ARRAY[
    'feature_signup_enabled',
    'feature_google_oauth',
    'feature_blog_enabled',
    'feature_signal_check',
    'feature_cross_border_gifting',
    'feature_posthog_enabled',
    'feature_cookie_consent_required',
    'maintenance_mode',
    'site_name',
    'site_tagline',
    'free_credits'
  ]));

CREATE POLICY anon_read_maintenance ON public.platform_settings
  FOR SELECT TO anon
  USING (key = 'maintenance_mode');

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
    'feature_signup_enabled',
    'feature_google_oauth',
    'feature_blog_enabled',
    'feature_signal_check',
    'feature_cross_border_gifting',
    'feature_posthog_enabled',
    'feature_cookie_consent_required',
    'maintenance_mode',
    'site_name',
    'site_tagline',
    'free_credits',
    'signal_check_units',
    'signal_check_cost',
    'gift_generation_units'
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
