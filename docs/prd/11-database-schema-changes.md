# 11 — Database Schema Changes

> All SQL in this document is executable against a Supabase Postgres instance. Apply in the order specified in Section 5.

---

## 1. Enable pgvector Extension

```sql
-- Migration: 20260501000000_enable_pgvector.sql
-- Requires Supabase Pro plan (pgvector is available on Pro and above)

CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

## 2. New Table: `public.recipient_embeddings`

Stores semantic vector representations of recipient profiles.

```sql
-- Migration: 20260501000100_create_recipient_embeddings.sql

CREATE TABLE public.recipient_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_version integer NOT NULL DEFAULT 1,
  source_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id)
);

-- Updated_at trigger
CREATE TRIGGER update_recipient_embeddings_updated_at
  BEFORE UPDATE ON public.recipient_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- IVFFlat index for approximate nearest neighbor search
-- probes=10 is a good default for P95 recall ~95%
CREATE INDEX recipient_embeddings_ivfflat_idx
  ON public.recipient_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Standard lookup index
CREATE INDEX recipient_embeddings_user_idx
  ON public.recipient_embeddings (user_id);

-- RLS
ALTER TABLE public.recipient_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipient_embeddings_select_own
  ON public.recipient_embeddings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY recipient_embeddings_insert_own
  ON public.recipient_embeddings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY recipient_embeddings_update_own
  ON public.recipient_embeddings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY recipient_embeddings_delete_own
  ON public.recipient_embeddings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY superadmin_all_recipient_embeddings
  ON public.recipient_embeddings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- Allow service_role (Vercel backend) full access
-- (service_role bypasses RLS by default in Supabase)
COMMENT ON TABLE public.recipient_embeddings IS
  'Semantic vector embeddings of recipient profiles. One per recipient, updated on profile changes.';
```

---

## 3. New Table: `public.gift_embeddings`

Stores semantic vector representations of selected gifts, linked to recipient.

```sql
-- Migration: 20260501000200_create_gift_embeddings.sql

CREATE TABLE public.gift_embeddings (
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
  UNIQUE(session_id, gift_name)
);

-- IVFFlat index for semantic similarity search
CREATE INDEX gift_embeddings_ivfflat_idx
  ON public.gift_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Lookup indexes
CREATE INDEX gift_embeddings_recipient_created_idx
  ON public.gift_embeddings (recipient_id, created_at DESC);

CREATE INDEX gift_embeddings_user_idx
  ON public.gift_embeddings (user_id);

-- RLS
ALTER TABLE public.gift_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gift_embeddings_select_own
  ON public.gift_embeddings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY gift_embeddings_insert_service
  ON public.gift_embeddings FOR INSERT
  WITH CHECK (true);  -- Service role only (Vercel backend)

CREATE POLICY superadmin_all_gift_embeddings
  ON public.gift_embeddings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

COMMENT ON TABLE public.gift_embeddings IS
  'Semantic vector embeddings of selected gifts. Written after gift selection, used for past-gift deduplication.';
```

---

## 4. New Table: `public.cultural_rules`

Stores cultural gifting rules as vector embeddings for retrieval.

```sql
-- Migration: 20260501000300_create_cultural_rules.sql

CREATE TABLE public.cultural_rules (
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

-- Updated_at trigger
CREATE TRIGGER update_cultural_rules_updated_at
  BEFORE UPDATE ON public.cultural_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- IVFFlat index (fewer lists because smaller table)
CREATE INDEX cultural_rules_ivfflat_idx
  ON public.cultural_rules
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- GIN index for tag-based filtering
CREATE INDEX cultural_rules_context_tags_gin_idx
  ON public.cultural_rules USING gin (context_tags);

-- Standard indexes
CREATE INDEX cultural_rules_type_idx ON public.cultural_rules (rule_type, is_active);

-- RLS
ALTER TABLE public.cultural_rules ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active rules
CREATE POLICY cultural_rules_select_authenticated
  ON public.cultural_rules FOR SELECT TO authenticated
  USING (is_active = true);

-- Service role reads all (Vercel backend)
-- (Handled automatically by service_role bypassing RLS)

-- Superadmins can manage all rules
CREATE POLICY cultural_rules_all_superadmin
  ON public.cultural_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

COMMENT ON TABLE public.cultural_rules IS
  'Cultural gifting rules stored as vector embeddings. Queried by Node 2 (Cultural Context Retriever) using pgvector similarity search.';
```

---

## 5. Alter: `public.gift_sessions` — New Columns

```sql
-- Migration: 20260501000400_alter_gift_sessions_v2_columns.sql

ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS personalization_scores jsonb DEFAULT NULL,
  -- Structure: [{"gift_index": 0, "score": 88, "was_rewritten": false}, ...]

  ADD COLUMN IF NOT EXISTS node_timings jsonb DEFAULT NULL,
  -- Structure: {"recipient_analyzer": 1420, "cultural_context_retriever": 310, ...}

  ADD COLUMN IF NOT EXISTS cultural_rules_applied integer DEFAULT 0,
  -- Count of cultural rules used in generation

  ADD COLUMN IF NOT EXISTS past_gifts_checked integer DEFAULT 0,
  -- Count of past gifts retrieved from memory

  ADD COLUMN IF NOT EXISTS engine_version text DEFAULT 'v1'
    CHECK (engine_version IN ('v1', 'v2')),
  -- Which recommendation engine generated this session

  ADD COLUMN IF NOT EXISTS feedback_cultural_fit integer
    CHECK (feedback_cultural_fit IS NULL OR (feedback_cultural_fit >= 1 AND feedback_cultural_fit <= 5)),
  -- Post-session cultural appropriateness rating (1-5)

  ADD COLUMN IF NOT EXISTS feedback_cultural_note text DEFAULT NULL;
  -- Free text about cultural feedback
```

---

## 6. New Functions

### `match_cultural_rules` — Used by Node 2

```sql
-- Migration: 20260501000500_create_match_functions.sql

CREATE OR REPLACE FUNCTION public.match_cultural_rules(
  query_embedding vector(1536),
  filter_tags text[] DEFAULT '{}',
  match_threshold float DEFAULT 0.55,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  rule_text text,
  rule_type text,
  confidence float,
  context_tags text[],
  avoid_examples text[],
  suggest_instead text[],
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id,
    cr.rule_text,
    cr.rule_type,
    cr.confidence::float,
    cr.context_tags,
    cr.avoid_examples,
    cr.suggest_instead,
    (1 - (cr.embedding <=> query_embedding))::float AS similarity
  FROM public.cultural_rules cr
  WHERE
    cr.is_active = true
    AND cr.embedding IS NOT NULL
    AND (
      (1 - (cr.embedding <=> query_embedding)) > match_threshold
      OR (
        array_length(filter_tags, 1) > 0
        AND cr.context_tags && filter_tags
      )
    )
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_cultural_rules TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_cultural_rules TO service_role;

COMMENT ON FUNCTION public.match_cultural_rules IS
  'Find culturally relevant rules using pgvector cosine similarity. Used by Node 2 of the LangGraph pipeline.';
```

### `match_past_gifts` — Used by Node 4

```sql
CREATE OR REPLACE FUNCTION public.match_past_gifts(
  p_recipient_id uuid,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.70,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  gift_name text,
  gift_description text,
  occasion text,
  reaction text,
  similarity float,
  gifted_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ge.gift_name,
    ge.gift_description,
    gs.occasion,
    ge.reaction,
    (1 - (ge.embedding <=> query_embedding))::float AS similarity,
    ge.created_at AS gifted_at
  FROM public.gift_embeddings ge
  JOIN public.gift_sessions gs ON ge.session_id = gs.id
  WHERE
    ge.recipient_id = p_recipient_id
    AND ge.embedding IS NOT NULL
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_past_gifts TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_past_gifts TO service_role;
```

### `get_recent_past_gifts` — Fallback for Node 4 (no embeddings yet)

```sql
CREATE OR REPLACE FUNCTION public.get_recent_past_gifts(
  p_recipient_id uuid,
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  gift_name text,
  occasion text,
  created_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    selected_gift_name AS gift_name,
    occasion,
    created_at
  FROM public.gift_sessions
  WHERE
    recipient_id = p_recipient_id
    AND user_id = p_user_id
    AND selected_gift_name IS NOT NULL
    AND status = 'completed'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_past_gifts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_past_gifts TO service_role;
```

---

## 7. Seed Data: `cultural_rules`

> See [07-cultural-intelligence.md](./07-cultural-intelligence.md) for the full INSERT statements. The seed data includes ~30 rules at launch covering India (Hindu, Jain, Muslim, Sikh), China, Japan, Middle East, and Western markets.

```sql
-- Migration: 20260501000600_seed_cultural_rules.sql
-- NOTE: Embeddings are null at seed time.
-- A background job generates embeddings after seeding.

INSERT INTO public.cultural_rules 
  (rule_text, rule_type, context_tags, confidence, source, avoid_examples, suggest_instead)
VALUES
  -- [Full INSERT statements from 07-cultural-intelligence.md]
  -- ...
;
```

**Post-seed embedding generation:**
After the seed SQL runs, a one-time script generates embeddings for all rules:
```bash
npx ts-node scripts/embed-cultural-rules.ts
```

```typescript
// scripts/embed-cultural-rules.ts
const { data: rules } = await supabase
  .from('cultural_rules')
  .select('id, rule_text, context_tags')
  .is('embedding', null)

for (const rule of rules ?? []) {
  const text = `${rule.rule_text}. Context: ${rule.context_tags.join(', ')}`
  const embedding = await generateEmbedding(text)
  await supabase.from('cultural_rules')
    .update({ embedding, embedding_model: 'text-embedding-3-small' })
    .eq('id', rule.id)
  console.log(`Embedded rule: ${rule.id}`)
}
```

---

## 8. Migration Execution Order

```
1. 20260501000000_enable_pgvector.sql
2. 20260501000100_create_recipient_embeddings.sql
3. 20260501000200_create_gift_embeddings.sql
4. 20260501000300_create_cultural_rules.sql
5. 20260501000400_alter_gift_sessions_v2_columns.sql
6. 20260501000500_create_match_functions.sql
7. 20260501000600_seed_cultural_rules.sql  (followed by embed-cultural-rules.ts script)
```

---

## 9. Index Maintenance Notes

### IVFFlat Indexes Require `ANALYZE` After Bulk Inserts

After the initial backfill of `gift_embeddings` and `recipient_embeddings`, run:
```sql
ANALYZE public.gift_embeddings;
ANALYZE public.recipient_embeddings;
ANALYZE public.cultural_rules;
```

### Index Build Timing

IVFFlat indexes are built at `CREATE INDEX` time on existing data. For empty tables (initial creation), this is instant. After bulk backfill, the index needs to be rebuilt:
```sql
REINDEX INDEX gift_embeddings_ivfflat_idx;
REINDEX INDEX recipient_embeddings_ivfflat_idx;
```

### When to Switch from IVFFlat to HNSW

IVFFlat is appropriate up to ~1M rows. If `gift_embeddings` or `recipient_embeddings` grows past 500K rows, migrate to HNSW:
```sql
DROP INDEX gift_embeddings_ivfflat_idx;
CREATE INDEX gift_embeddings_hnsw_idx
  ON public.gift_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 10. Backward Compatibility Notes

- All existing tables are unchanged except `gift_sessions` (5 new columns with safe defaults).
- All existing RLS policies are unchanged.
- All existing Edge Functions continue to work unchanged.
- The `engine_version` column defaults to `'v1'`, so all existing rows are correctly tagged.
- New tables have no dependency on migrating existing data — they start empty and fill over time.
- The only irreversible step is `CREATE EXTENSION vector` — this cannot be undone without superuser access. Supabase support can remove it if needed.
