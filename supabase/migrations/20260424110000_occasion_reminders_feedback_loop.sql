ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS last_gift_name text;

CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('occasion', 'feedback')),
  date_label text NOT NULL DEFAULT '',
  date_value text NOT NULL DEFAULT '',
  days_before integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_day date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_occasion_unique
  ON public.reminder_logs(recipient_id, date_value, days_before, sent_day)
  WHERE kind = 'occasion' AND recipient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_feedback_unique
  ON public.reminder_logs(session_id, sent_day)
  WHERE kind = 'feedback' AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_logs_user_sent_day
  ON public.reminder_logs(user_id, sent_day DESC);

CREATE OR REPLACE FUNCTION public.update_recipient_stats_for(recipient_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF recipient_uuid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.recipients
  SET
    session_count = (
      SELECT count(*)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
    ),
    gift_count_cached = (
      SELECT count(*)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    ),
    last_gift_date = (
      SELECT max(created_at)
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    ),
    last_gift_name = (
      SELECT selected_gift_name
      FROM public.gift_sessions
      WHERE recipient_id = recipient_uuid
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
        AND selected_gift_name IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    )
  WHERE id = recipient_uuid;
END;
$$;

SELECT public.update_recipient_stats_for(id)
FROM public.recipients;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('send-occasion-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-occasion-reminders');

SELECT cron.unschedule('send-feedback-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-feedback-reminders');

SELECT cron.schedule(
  'send-occasion-reminders',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-occasion-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'send-feedback-reminders',
  '35 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-feedback-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
