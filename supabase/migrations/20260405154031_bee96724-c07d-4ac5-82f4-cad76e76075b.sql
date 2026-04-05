ALTER TABLE public.gift_sessions
  ADD COLUMN feedback_rating text DEFAULT NULL,
  ADD COLUMN feedback_notes text DEFAULT NULL;