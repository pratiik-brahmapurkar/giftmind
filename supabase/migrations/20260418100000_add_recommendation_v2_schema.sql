CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS personalization_scores jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS node_timings jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cultural_rules_applied integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS past_gifts_checked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engine_version text NOT NULL DEFAULT 'v1'
    CHECK (engine_version IN ('v1', 'v2')),
  ADD COLUMN IF NOT EXISTS feedback_cultural_fit integer
    CHECK (feedback_cultural_fit IS NULL OR (feedback_cultural_fit BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS feedback_cultural_note text DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.recipient_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_version integer NOT NULL DEFAULT 1,
  source_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id)
);

CREATE TABLE IF NOT EXISTS public.gift_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gift_name text NOT NULL,
  gift_description text,
  product_category text,
  price_anchor numeric(10,2),
  occasion text,
  reaction text CHECK (reaction IN ('loved_it', 'liked_it', 'neutral', 'didnt_like')),
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  source_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, gift_name)
);

CREATE TABLE IF NOT EXISTS public.cultural_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text text NOT NULL,
  rule_type text NOT NULL DEFAULT 'soft_preference'
    CHECK (rule_type IN ('hard_constraint', 'soft_preference', 'regional_note')),
  context_tags text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  embedding_model text DEFAULT 'text-embedding-3-small',
  confidence numeric(3,2) NOT NULL DEFAULT 0.90
    CHECK (confidence >= 0.00 AND confidence <= 1.00),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'cultural_consultant', 'ai_generated', 'user_reported')),
  avoid_examples text[] NOT NULL DEFAULT '{}',
  suggest_instead text[] NOT NULL DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_recipient_embeddings_updated_at ON public.recipient_embeddings;
CREATE TRIGGER update_recipient_embeddings_updated_at
  BEFORE UPDATE ON public.recipient_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cultural_rules_updated_at ON public.cultural_rules;
CREATE TRIGGER update_cultural_rules_updated_at
  BEFORE UPDATE ON public.cultural_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS recipient_embeddings_ivfflat_idx
  ON public.recipient_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS recipient_embeddings_user_idx
  ON public.recipient_embeddings (user_id);

CREATE INDEX IF NOT EXISTS gift_embeddings_ivfflat_idx
  ON public.gift_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS gift_embeddings_recipient_created_idx
  ON public.gift_embeddings (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gift_embeddings_user_idx
  ON public.gift_embeddings (user_id);

CREATE INDEX IF NOT EXISTS cultural_rules_ivfflat_idx
  ON public.cultural_rules
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS cultural_rules_context_tags_gin_idx
  ON public.cultural_rules USING gin (context_tags);

CREATE INDEX IF NOT EXISTS cultural_rules_type_idx
  ON public.cultural_rules (rule_type, is_active);

ALTER TABLE public.recipient_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipient_embeddings_select_own ON public.recipient_embeddings;
CREATE POLICY recipient_embeddings_select_own
ON public.recipient_embeddings
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS recipient_embeddings_insert_own ON public.recipient_embeddings;
CREATE POLICY recipient_embeddings_insert_own
ON public.recipient_embeddings
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS recipient_embeddings_update_own ON public.recipient_embeddings;
CREATE POLICY recipient_embeddings_update_own
ON public.recipient_embeddings
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS recipient_embeddings_delete_own ON public.recipient_embeddings;
CREATE POLICY recipient_embeddings_delete_own
ON public.recipient_embeddings
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS superadmin_all_recipient_embeddings ON public.recipient_embeddings;
CREATE POLICY superadmin_all_recipient_embeddings
ON public.recipient_embeddings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS gift_embeddings_select_own ON public.gift_embeddings;
CREATE POLICY gift_embeddings_select_own
ON public.gift_embeddings
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gift_embeddings_insert_own ON public.gift_embeddings;
CREATE POLICY gift_embeddings_insert_own
ON public.gift_embeddings
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gift_embeddings_update_own ON public.gift_embeddings;
CREATE POLICY gift_embeddings_update_own
ON public.gift_embeddings
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS superadmin_all_gift_embeddings ON public.gift_embeddings;
CREATE POLICY superadmin_all_gift_embeddings
ON public.gift_embeddings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS cultural_rules_select_authenticated ON public.cultural_rules;
CREATE POLICY cultural_rules_select_authenticated
ON public.cultural_rules
FOR SELECT TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS cultural_rules_all_superadmin ON public.cultural_rules;
CREATE POLICY cultural_rules_all_superadmin
ON public.cultural_rules
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE OR REPLACE FUNCTION public.match_cultural_rules(
  query_embedding vector(1536),
  filter_tags text[] DEFAULT '{}',
  match_threshold double precision DEFAULT 0.55,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  rule_text text,
  rule_type text,
  confidence double precision,
  context_tags text[],
  avoid_examples text[],
  suggest_instead text[],
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cr.id,
    cr.rule_text,
    cr.rule_type,
    cr.confidence::double precision,
    cr.context_tags,
    cr.avoid_examples,
    cr.suggest_instead,
    (1 - (cr.embedding <=> query_embedding))::double precision AS similarity
  FROM public.cultural_rules cr
  WHERE
    cr.is_active = true
    AND cr.embedding IS NOT NULL
    AND (
      (1 - (cr.embedding <=> query_embedding)) >= match_threshold
      OR (
        cardinality(filter_tags) > 0
        AND cr.context_tags && filter_tags
      )
    )
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_past_gifts(
  p_recipient_id uuid,
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.70,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  gift_name text,
  gift_description text,
  occasion text,
  reaction text,
  similarity double precision,
  gifted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ge.gift_name,
    ge.gift_description,
    gs.occasion,
    ge.reaction,
    (1 - (ge.embedding <=> query_embedding))::double precision AS similarity,
    ge.created_at AS gifted_at
  FROM public.gift_embeddings ge
  JOIN public.gift_sessions gs ON gs.id = ge.session_id
  WHERE
    ge.recipient_id = p_recipient_id
    AND ge.embedding IS NOT NULL
    AND (1 - (ge.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.get_recent_past_gifts(
  p_recipient_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  gift_name text,
  occasion text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    gs.selected_gift_name AS gift_name,
    gs.occasion,
    gs.created_at
  FROM public.gift_sessions gs
  WHERE
    gs.recipient_id = p_recipient_id
    AND gs.user_id = auth.uid()
    AND gs.selected_gift_name IS NOT NULL
    AND gs.status = 'completed'
  ORDER BY gs.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_cultural_rules(vector(1536), text[], double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_cultural_rules(vector(1536), text[], double precision, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.match_past_gifts(uuid, vector(1536), double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_past_gifts(uuid, vector(1536), double precision, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_recent_past_gifts(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_past_gifts(uuid, integer) TO service_role;

INSERT INTO public.cultural_rules (
  rule_text,
  rule_type,
  context_tags,
  confidence,
  source,
  avoid_examples,
  suggest_instead,
  notes
)
VALUES
  ('For Jain recipients, never suggest leather, silk, wool, or other animal-derived products.', 'hard_constraint', ARRAY['india', 'jain', 'diwali'], 0.99, 'manual', ARRAY['leather wallets', 'silk scarves'], ARRAY['plant-based home goods', 'metal decor', 'books'], 'High-confidence religious requirement.'),
  ('For Jain recipients, prefer plant-based, natural, and non-violent gift materials.', 'soft_preference', ARRAY['india', 'jain'], 0.92, 'manual', ARRAY[]::text[], ARRAY['plant-based candles', 'wood decor', 'herbal teas'], 'Preference complementing the hard constraint.'),
  ('For Muslim recipients during Eid, avoid alcohol and pork-derived items.', 'hard_constraint', ARRAY['muslim', 'eid', 'middle-east', 'india'], 0.99, 'manual', ARRAY['wine gift baskets', 'pork charcuterie'], ARRAY['dates', 'sweets', 'fragrance'], 'Applies broadly across markets.'),
  ('For Sikh recipients, avoid tobacco-related gifts.', 'hard_constraint', ARRAY['sikh', 'india', 'lohri'], 0.98, 'manual', ARRAY['cigars', 'tobacco accessories'], ARRAY['premium sweets', 'home gifts'], 'Religious prohibition.'),
  ('For Chinese New Year gifting, avoid clocks, sets of four, and white flowers.', 'hard_constraint', ARRAY['china', 'chinese-new-year'], 0.97, 'manual', ARRAY['wall clocks', '4-piece sets', 'white lilies'], ARRAY['red envelopes', 'tea sets', 'premium fruit'], 'Common cultural taboo set.'),
  ('For Japanese recipients, avoid gifts associated with the numbers 4 and 9, and avoid sharp objects for celebratory occasions.', 'hard_constraint', ARRAY['japan', 'birthday'], 0.95, 'manual', ARRAY['knife sets', '4-piece gift boxes'], ARRAY['artisan stationery', 'tea gifts'], 'Avoid negative numerology and severing symbolism.'),
  ('For Navratri contexts, vegetarian-only edible gifts are appropriate.', 'hard_constraint', ARRAY['india', 'navratri', 'vegetarian'], 0.96, 'manual', ARRAY['meat hampers'], ARRAY['dry fruits', 'sattvic sweets'], 'Festival dietary rule.'),
  ('For Pongal gifting in Tamil contexts, traditional crafts and home-centered gifts resonate strongly.', 'regional_note', ARRAY['india', 'tamil', 'pongal'], 0.84, 'manual', ARRAY[]::text[], ARRAY['traditional cookware', 'kolam-inspired decor'], 'Regional taste guidance.'),
  ('For Bengali recipients during Durga Puja, intellectual, literary, and artistic gifts often land well.', 'soft_preference', ARRAY['india', 'bengali', 'durga-puja'], 0.83, 'manual', ARRAY[]::text[], ARRAY['books', 'artisan decor', 'music gifts'], 'Preference-based guidance.'),
  ('For Gujarati business gifting around Diwali New Year, dry fruits and silverware are conventional safe options.', 'regional_note', ARRAY['india', 'gujarati', 'diwali', 'business'], 0.81, 'manual', ARRAY[]::text[], ARRAY['dry fruit boxes', 'silver-plated decor'], 'Useful in business-contact scenarios.'),
  ('For Christian Indian Christmas gifting, avoid overly Hindu-specific symbolism unless explicitly requested.', 'hard_constraint', ARRAY['india', 'christian', 'christmas'], 0.90, 'manual', ARRAY['Diwali diyas'], ARRAY['baked goods', 'home decor', 'books'], 'Context switching matters.'),
  ('For Parsi Nowruz gifting, natural elements and elegant flowers are well aligned.', 'soft_preference', ARRAY['parsi', 'nowruz', 'india'], 0.78, 'manual', ARRAY[]::text[], ARRAY['flowers', 'garden items', 'elegant sweets'], 'Preference guidance.'),
  ('For corporate gifting in Saudi Arabia, stay conservative and avoid obviously feminine items for male recipients unless explicitly personalized.', 'regional_note', ARRAY['saudi-arabia', 'corporate', 'male'], 0.80, 'manual', ARRAY['jewelry', 'floral perfumes'], ARRAY['desk accessories', 'premium dates'], 'Business etiquette guidance.'),
  ('For UAE Eid gifting, premium dates and oud-based fragrances are strong culturally aligned options.', 'soft_preference', ARRAY['uae', 'eid'], 0.85, 'manual', ARRAY[]::text[], ARRAY['premium dates', 'oud perfume'], 'Useful positive preference.'),
  ('For German professional gifting, practical and understated gifts work better than extravagant gestures.', 'soft_preference', ARRAY['germany', 'colleague', 'professional'], 0.76, 'manual', ARRAY['flashy novelty gifts'], ARRAY['practical desk items', 'quality notebooks'], 'Professional etiquette preference.'),
  ('For French recipients with cultural interests, artisanal and quality-focused gifts tend to outperform generic mass-market items.', 'soft_preference', ARRAY['france', 'birthday', 'cultural-interest'], 0.75, 'manual', ARRAY['generic corporate swag'], ARRAY['artisan foods', 'design-forward home goods'], 'Taste and quality note.'),
  ('For UK office Secret Santa gifting, keep items neutral, professional, and not overly personal.', 'hard_constraint', ARRAY['uk', 'secret-santa', 'office'], 0.88, 'manual', ARRAY['romantic gifts', 'personal apparel'], ARRAY['tea, snacks, desk gifts'], 'Workplace boundary rule.'),
  ('For Australian Christmas gifting, account for summer seasonality rather than northern-hemisphere winter assumptions.', 'regional_note', ARRAY['australia', 'christmas'], 0.79, 'manual', ARRAY['winter scarves', 'heavy blankets'], ARRAY['outdoor dining', 'summer hosting gifts'], 'Seasonality note.'),
  ('For Israeli Hanukkah gifting, avoid overtly Christian symbolism.', 'hard_constraint', ARRAY['israel', 'hanukkah'], 0.92, 'manual', ARRAY['nativity decor'], ARRAY['candles', 'family games', 'sweets'], 'Holiday-specific context rule.'),
  ('For wealthy “have everything” recipients, unique experiences or personalization beats generic premium goods.', 'soft_preference', ARRAY['wealthy', 'difficult-recipient'], 0.74, 'manual', ARRAY['generic gift cards'], ARRAY['experiences', 'custom keepsakes'], 'General but useful gifting heuristic.')
ON CONFLICT DO NOTHING;
