-- PRD 12: analytics, telemetry, and experimentation foundations.

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS ai_tokens_input integer,
  ADD COLUMN IF NOT EXISTS ai_tokens_output integer,
  ADD COLUMN IF NOT EXISTS ai_error_type text,
  ADD COLUMN IF NOT EXISTS ai_estimated_cost_usd numeric(8,6);

CREATE TABLE IF NOT EXISTS public.ai_telemetry_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
  latency_ms integer,
  tokens_input integer,
  tokens_output integer,
  estimated_cost_usd numeric(8,6),
  error_type text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_function_created
  ON public.ai_telemetry_log(function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_provider
  ON public.ai_telemetry_log(provider, status);

CREATE INDEX IF NOT EXISTS idx_telemetry_session
  ON public.ai_telemetry_log(session_id);

ALTER TABLE public.ai_telemetry_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_telemetry_log'
      AND policyname = 'telemetry_admin_read'
  ) THEN
    CREATE POLICY telemetry_admin_read ON public.ai_telemetry_log
      FOR SELECT TO authenticated
      USING (public.is_admin_or_superadmin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_telemetry_log'
      AND policyname = 'telemetry_service_insert'
  ) THEN
    CREATE POLICY telemetry_service_insert ON public.ai_telemetry_log
      FOR INSERT TO service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$
DECLARE
  telemetry_job_exists boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
      INTO telemetry_job_exists
      USING 'purge-old-telemetry';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL
     AND NOT telemetry_job_exists THEN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING
        'purge-old-telemetry',
        '0 3 * * 0',
        $purge$DELETE FROM public.ai_telemetry_log WHERE created_at < now() - interval '90 days';$purge$;
  END IF;
END $$;

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('posthog_server_api_key', '""', 'PostHog API key for server-side feature flag evaluation'),
  ('experiment_gift_card_layout', '"control"', 'Override: gift card layout experiment'),
  ('experiment_onboarding_flow_v2', '"control"', 'Override: onboarding flow experiment'),
  ('telemetry_retention_days', '90', 'Days to retain AI telemetry logs'),
  ('telemetry_enabled', 'true', 'Enable AI telemetry logging in Edge Functions')
ON CONFLICT (key) DO NOTHING;
