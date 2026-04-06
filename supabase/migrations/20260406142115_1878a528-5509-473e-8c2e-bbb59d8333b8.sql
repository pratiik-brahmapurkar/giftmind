
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;
ALTER TABLE public.gift_sessions ADD COLUMN IF NOT EXISTS recipient_country text DEFAULT NULL;
