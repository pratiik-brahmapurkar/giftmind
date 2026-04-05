
-- Add credits column to profiles
ALTER TABLE public.profiles ADD COLUMN credits integer NOT NULL DEFAULT 3;

-- Gift sessions table
CREATE TABLE public.gift_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  occasion text,
  occasion_date date,
  budget_min integer,
  budget_max integer,
  currency text NOT NULL DEFAULT 'INR',
  context_tags text[] DEFAULT '{}',
  extra_notes text,
  results jsonb,
  chosen_gift jsonb,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.gift_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.gift_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.gift_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_gift_sessions_updated_at
  BEFORE UPDATE ON public.gift_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
