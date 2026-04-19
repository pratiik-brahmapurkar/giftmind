ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_count_cached integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'recipients'
      AND constraint_name = 'recipients_notes_length'
  ) THEN
    ALTER TABLE public.recipients
      ADD CONSTRAINT recipients_notes_length
      CHECK (notes IS NULL OR length(notes) <= 500);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipients_user_created
  ON public.recipients(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipients_user_last_gift
  ON public.recipients(user_id, last_gift_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_recipients_user_archived
  ON public.recipients(user_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_recipients_interests_gin
  ON public.recipients USING GIN(interests);

UPDATE public.recipients
SET cultural_context = jsonb_build_object(
  'category', cultural_context,
  'dietary', '[]'::jsonb
)::text
WHERE cultural_context IS NOT NULL
  AND cultural_context != ''
  AND left(trim(cultural_context), 1) != '{';

ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_recipient_id_fkey;

ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_recipient_id_fkey
    FOREIGN KEY (recipient_id)
    REFERENCES public.recipients(id)
    ON DELETE SET NULL;

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
    )
  WHERE id = recipient_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_recipient_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_recipient_stats_for(COALESCE(NEW.recipient_id, OLD.recipient_id));

  IF TG_OP = 'UPDATE' AND NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN
    PERFORM public.update_recipient_stats_for(OLD.recipient_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS gift_sessions_update_recipient_stats ON public.gift_sessions;

CREATE TRIGGER gift_sessions_update_recipient_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.gift_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_recipient_stats();

SELECT public.update_recipient_stats_for(id)
FROM public.recipients;
