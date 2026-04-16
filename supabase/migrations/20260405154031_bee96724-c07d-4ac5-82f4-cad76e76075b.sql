ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS feedback_rating text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS feedback_notes text DEFAULT NULL;
