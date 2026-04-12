CREATE TABLE public.signal_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  gift_name text NOT NULL,
  parent_signal_check_id uuid REFERENCES public.signal_checks(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1,
  follow_up_prompt text,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits_used numeric(4,1) NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_checks_revision_positive CHECK (revision_number >= 1)
);

CREATE UNIQUE INDEX signal_checks_session_gift_revision_idx
  ON public.signal_checks (session_id, gift_name, revision_number);

CREATE INDEX signal_checks_user_created_idx
  ON public.signal_checks (user_id, created_at DESC);

CREATE INDEX signal_checks_session_gift_created_idx
  ON public.signal_checks (session_id, gift_name, created_at DESC);

ALTER TABLE public.signal_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY signal_checks_select_own
ON public.signal_checks
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY signal_checks_insert_own
ON public.signal_checks
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY superadmin_select_all_signal_checks
ON public.signal_checks
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));
