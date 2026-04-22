ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommendation_index integer CHECK (
    recommendation_index IS NULL OR recommendation_index BETWEEN 0 AND 2
  ),
  ADD COLUMN IF NOT EXISTS recommendation_confidence integer,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS estimated_price numeric,
  ADD COLUMN IF NOT EXISTS clicked_from text DEFAULT 'results_screen',
  ADD COLUMN IF NOT EXISTS store_id text;

UPDATE public.product_clicks
SET store_id = store
WHERE store_id IS NULL AND store IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clicks_user_at
  ON public.product_clicks(user_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_clicks_session
  ON public.product_clicks(session_id);

CREATE INDEX IF NOT EXISTS idx_clicks_store_country
  ON public.product_clicks(store_name, country);

CREATE INDEX IF NOT EXISTS idx_clicks_recipient
  ON public.product_clicks(recipient_id);
