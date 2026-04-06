
CREATE TABLE public.product_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE SET NULL,
  gift_concept_name text NOT NULL,
  store text NOT NULL,
  product_url text NOT NULL,
  country text DEFAULT NULL,
  is_search_link boolean DEFAULT true,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own clicks"
  ON public.product_clicks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own clicks"
  ON public.product_clicks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmins can view all clicks"
  ON public.product_clicks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
