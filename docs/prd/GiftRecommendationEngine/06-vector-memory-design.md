# 06 — Vector Memory Design

---

## Why Vector Memory

### The Current State

Past gifts are stored as text in `gift_sessions.selected_gift_name` (a VARCHAR column, populated when the user selects a gift). The data exists but is never read during recommendation generation. Even if it were read, text matching would only catch exact or near-exact repeats — it would never catch that "Cooking Masterclass Voucher" and "Kitchen Skills Workshop" are semantically the same category of gift.

Recipients' interests are stored as a `text[]` array in `recipients.interests`. These are keyword strings ("cooking", "reading", "hiking"). There is no mechanism to compute semantic similarity between recipients, to understand that "urban professional who loves sustainability and plant-based cooking" is describing someone similar to "environmentally conscious home cook."

Cultural rules are locked inside the LLM's weights — they cannot be updated, audited, or expanded without changing the prompt.

### What Vector Memory Enables

1. **Past-gift semantic deduplication:** Prevent suggesting not just exact repeats ("spice kit") but semantically equivalent gifts ("artisan spice collection," "global cuisine spice set"). Cosine similarity threshold of 0.85 covers this reliably.

2. **Recipient profile similarity:** If a user has gifted multiple recipients with similar profiles, past successful gifts for one recipient can inform recommendations for another. (Future feature — not in v2 scope, but the infrastructure supports it.)

3. **Cultural rule retrieval:** Query the `cultural_rules` table using natural language. A query like "gift for Jain recipient in India for Diwali" finds the most relevant rules by semantic similarity, not just tag matching.

4. **Compounding quality:** Every completed session makes the next one better. The product's intelligence grows with usage.

---

## pgvector Setup

### Enable Extension

```sql
-- Run once in Supabase SQL editor (requires Supabase Pro plan for pgvector)
CREATE EXTENSION IF NOT EXISTS vector;
```

### Embedding Dimensions

All vectors use **1536 dimensions** (OpenAI `text-embedding-3-small`).

Alternative: Gemini `embedding-001` generates 768-dimension vectors. If using Gemini, update all `vector(1536)` to `vector(768)` in the schema below. The choice is made once at setup and cannot be changed without re-embedding all data.

**Recommendation:** Use OpenAI `text-embedding-3-small` for consistency and broad ecosystem support. Cost: $0.02 per million tokens. A recipient profile text is ~100 tokens → $0.000002 per embedding. Negligible.

---

## New Tables

### `public.recipient_embeddings`

Stores a semantic representation of each recipient's full profile. Updated whenever the recipient profile is edited.

```sql
CREATE TABLE public.recipient_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  source_text text NOT NULL,    -- The text that was embedded (for debugging/auditing)
  embedding_version integer NOT NULL DEFAULT 1,  -- increment when source_text schema changes
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id)
);

-- Trigger for updated_at
CREATE TRIGGER update_recipient_embeddings_updated_at
  BEFORE UPDATE ON public.recipient_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- IVFFlat index for fast ANN search
-- lists = 100 is appropriate for tables up to ~1M rows
CREATE INDEX ON public.recipient_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

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

CREATE POLICY superadmin_select_all_recipient_embeddings
  ON public.recipient_embeddings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
```

**Source text template for embedding a recipient:**
```typescript
function buildRecipientEmbeddingText(recipient: Recipient): string {
  return [
    `Name: ${recipient.name}`,
    `Relationship: ${recipient.relationship_type} (${recipient.relationship_depth})`,
    `Age: ${recipient.age_range}`,
    `Gender: ${recipient.gender}`,
    `Interests: ${(recipient.interests ?? []).join(', ')}`,
    `Cultural context: ${recipient.cultural_context}`,
    `Country: ${recipient.country}`,
    `Notes: ${recipient.notes ?? ''}`,
  ].filter(Boolean).join('. ')
}
// Example output:
// "Name: Priya. Relationship: parent (very_close). Age: 50_65. Gender: female. 
//  Interests: cooking, gardening, classical music. Cultural context: indian_hindu. 
//  Country: IN. Notes: loves anything related to her home and garden."
```

---

### `public.gift_embeddings`

Stores a semantic representation of each selected gift, linked to the recipient it was gifted to. Written after a user selects a gift and the session is completed.

```sql
CREATE TABLE public.gift_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gift_name text NOT NULL,
  gift_description text,           -- From the AI recommendation
  product_category text,           -- e.g. "kitchen", "wellness", "experience"
  price_anchor numeric(10,2),
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  source_text text NOT NULL,       -- Text that was embedded
  reaction text,                   -- loved_it, liked_it, neutral, didnt_like (from feedback)
  occasion text,                   -- What occasion was this for
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, gift_name)    -- One embedding per gift per session
);

CREATE INDEX ON public.gift_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX gift_embeddings_recipient_created_idx
  ON public.gift_embeddings (recipient_id, created_at DESC);

ALTER TABLE public.gift_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gift_embeddings_select_own
  ON public.gift_embeddings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY gift_embeddings_insert_service
  ON public.gift_embeddings FOR INSERT
  WITH CHECK (true);  -- Service role only; backend inserts after selection

CREATE POLICY superadmin_select_all_gift_embeddings
  ON public.gift_embeddings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
```

**Source text template for embedding a selected gift:**
```typescript
function buildGiftEmbeddingText(gift: GiftRecommendation, occasion: string): string {
  return [
    gift.name,
    gift.description,
    gift.why_it_works,
    `category: ${gift.product_category}`,
    `occasion: ${occasion}`,
  ].join('. ')
}
// Example:
// "Premium Artisan Spice Kit. A curated collection of 12 single-origin spices from 
//  India and Southeast Asia. Given Priya's love of Indian classical cooking, this lets 
//  her explore regional cuisines she talks about. category: kitchen. occasion: diwali."
```

---

### `public.cultural_rules`

Stores cultural gifting rules as vector embeddings. Queryable by semantic similarity. Managed by superadmins. Seeded with 50+ rules at launch.

```sql
CREATE TABLE public.cultural_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text text NOT NULL,
  rule_type text NOT NULL DEFAULT 'soft_preference'
    CHECK (rule_type IN ('hard_constraint', 'soft_preference', 'regional_note')),
  context_tags text[] NOT NULL DEFAULT '{}',  -- e.g. ['india', 'jain', 'diwali']
  embedding vector(1536),
  embedding_model text DEFAULT 'text-embedding-3-small',
  confidence numeric(3,2) NOT NULL DEFAULT 0.90,  -- 0.00–1.00
  source text,          -- 'manual', 'cultural_consultant', 'ai_generated', 'user_reported'
  avoid_examples text[] DEFAULT '{}',       -- concrete examples of what to avoid
  suggest_instead text[] DEFAULT '{}',      -- concrete alternatives
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.cultural_rules
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX cultural_rules_context_tags_idx
  ON public.cultural_rules USING gin (context_tags);

CREATE TRIGGER update_cultural_rules_updated_at
  BEFORE UPDATE ON public.cultural_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cultural_rules ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed by Edge Function + Vercel)
CREATE POLICY cultural_rules_select_authenticated
  ON public.cultural_rules FOR SELECT TO authenticated
  USING (is_active = true);

-- Service role (Vercel backend) can read all
CREATE POLICY cultural_rules_select_service
  ON public.cultural_rules FOR SELECT
  USING (true);  -- service_role bypasses RLS

-- Only superadmins can write
CREATE POLICY cultural_rules_insert_superadmin
  ON public.cultural_rules FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY cultural_rules_update_superadmin
  ON public.cultural_rules FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
```

---

## Retrieval Functions

### `match_cultural_rules` — Node 2

```sql
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
    AND (
      (1 - (cr.embedding <=> query_embedding)) > match_threshold
      OR (array_length(filter_tags, 1) > 0 AND cr.context_tags && filter_tags)
    )
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### `match_past_gifts` — Node 4

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
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## Embedding Generation

### When Embeddings Are Generated

| Event | Action |
|-------|--------|
| Recipient created | Queue `generate_recipient_embedding(recipient_id)` |
| Recipient profile updated | Queue `regenerate_recipient_embedding(recipient_id)` |
| Gift selected (session completed) | Queue `generate_gift_embedding(session_id, gift_name, recipient_id)` |
| Cultural rule added/updated (by admin) | Synchronous: `update_cultural_rule_embedding(rule_id)` |

### Embedding Generation Service

Background job running in Vercel (or as a Supabase Edge Function cron):

```typescript
// api/embeddings/generate.ts (Vercel background function)

import OpenAI from 'openai'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return response.data[0].embedding
}

// Alternative: Gemini embedding (free tier)
import { GoogleGenerativeAI } from '@google/generative-ai'
const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

export async function generateEmbeddingGemini(text: string): Promise<number[]> {
  const model = genai.getGenerativeModel({ model: 'embedding-001' })
  const result = await model.embedContent(text)
  return result.embedding.values
}
```

**Cost comparison:**
| Provider | Model | Dimensions | Cost per 1M tokens | Notes |
|---------|-------|-----------|-------------------|-------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 | Recommended |
| OpenAI | text-embedding-3-large | 3072 | $0.13 | Overkill for this use case |
| Gemini | embedding-001 | 768 | Free (1500 req/day) | Good alternative, fewer dims |
| Cohere | embed-v3 | 1024 | $0.10 | No advantage here |

**Decision:** Default to Gemini `embedding-001` (free, 768 dims). If free tier exhausted, fall back to OpenAI `text-embedding-3-small`. Update vector dims to 768 in that case. **Cannot mix models in the same table.**

For simplicity: **pick one model at setup and stick to it**. Recommended: OpenAI for consistency with the broader ecosystem.

---

## Seed Data: `cultural_rules` Initial Dataset

This is the minimum viable seed — 50 rules covering the 4 priority markets at launch.

### Hard Constraints (Never Violate)

```sql
INSERT INTO public.cultural_rules (rule_text, rule_type, context_tags, confidence, source, avoid_examples, suggest_instead)
VALUES
-- INDIA: Religious taboos
('For Jain recipients, never suggest leather goods, silk, wool, or any animal-derived products', 
 'hard_constraint', ARRAY['india','jain','vegetarian'], 0.99, 'manual',
 ARRAY['leather wallet','silk scarf','wool sweater','suede shoes'],
 ARRAY['vegan leather','cotton','bamboo','plant-based alternatives']),

('For Hindu recipients during auspicious occasions, avoid leather products as gifts', 
 'hard_constraint', ARRAY['india','hindu','diwali','religious'], 0.90, 'manual',
 ARRAY['leather bag','leather belt','leather wallet'],
 ARRAY['fabric bags','plant-based accessories']),

('For Muslim recipients, never suggest alcohol, pork products, or items associated with gambling', 
 'hard_constraint', ARRAY['india','pakistan','uae','muslim','eid','religious'], 0.99, 'manual',
 ARRAY['wine set','beer hamper','poker set','lottery tickets'],
 ARRAY['premium dates','attar perfume','prayer accessories','sweet hampers']),

('For Sikh recipients, avoid tobacco products and anything associated with intoxicants', 
 'hard_constraint', ARRAY['india','sikh','punjab'], 0.95, 'manual',
 ARRAY['cigarettes','alcohol','tobacco accessories'],
 ARRAY['sports equipment','turban fabric','langar donation']),

-- CHINA: Number and color taboos
('For Chinese recipients, never give gifts in sets of 4 (four sounds like death in Chinese)', 
 'hard_constraint', ARRAY['china','chinese','chinese_new_year'], 0.95, 'manual',
 ARRAY['set of 4 cups','4 chocolate pieces','4 candles'],
 ARRAY['sets of 6','sets of 8 (lucky)','sets of 9']),

('For Chinese recipients, never give a clock as a gift (sending a clock means attending a funeral)', 
 'hard_constraint', ARRAY['china','chinese','hong_kong','taiwan'], 0.98, 'manual',
 ARRAY['wall clock','desk clock','alarm clock','watch as primary gift'],
 ARRAY['timepiece-free alternatives','luxury pens','premium tea sets']),

('For Chinese recipients, avoid white flowers (white is the funeral color in Chinese culture)', 
 'hard_constraint', ARRAY['china','chinese','chinese_new_year'], 0.90, 'manual',
 ARRAY['white chrysanthemums','white lilies','white roses alone'],
 ARRAY['red flowers','golden flowers','mixed vibrant bouquets']),

('For Chinese recipients, never give pears (pears sound like separation in Chinese)', 
 'hard_constraint', ARRAY['china','chinese'], 0.85, 'manual',
 ARRAY['pear gift basket','pear-flavored items'],
 ARRAY['oranges (luck)','pomelos (prosperity)','premium fruit baskets without pears']),

-- JAPAN: Gifting etiquette
('For Japanese recipients, never give gifts in sets of 4 or 9 (both associated with death/suffering)', 
 'hard_constraint', ARRAY['japan','japanese'], 0.95, 'manual',
 ARRAY['4 cups','9 chocolates','set of 4'],
 ARRAY['sets of 3','sets of 5','sets of 7']),

('For Japanese recipients, avoid giving sharp objects (knives, scissors) as they symbolize cutting ties', 
 'hard_constraint', ARRAY['japan','japanese'], 0.85, 'manual',
 ARRAY['knife set','scissors','letter opener','sword'],
 ARRAY['cooking accessories (non-sharp)','premium chopsticks','ceramics']),

-- WESTERN: General
('In workplace contexts, avoid overly personal gifts (perfume, clothing, intimate items)', 
 'hard_constraint', ARRAY['usa','uk','western','colleague','boss','professional'], 0.88, 'manual',
 ARRAY['perfume','lingerie','personal hygiene items','very personal jewelry'],
 ARRAY['gourmet food hampers','desk accessories','tech accessories','book recommendations']);
```

### Soft Preferences (Strongly Prefer)

```sql
INSERT INTO public.cultural_rules (rule_text, rule_type, context_tags, confidence, source, avoid_examples, suggest_instead)
VALUES
-- INDIA: Auspicious items
('For Diwali, gifts involving light, sweets, dry fruits, or gold are considered highly auspicious', 
 'soft_preference', ARRAY['india','diwali','hindu'], 0.95, 'manual',
 ARRAY[],
 ARRAY['diyas and candles','premium dry fruit boxes','kaju katli','gold-plated items']),

('For Eid al-Fitr gifts, premium dates, attar (non-alcoholic perfumes), and sweet hampers are traditionally appropriate', 
 'soft_preference', ARRAY['india','pakistan','uae','eid','muslim'], 0.92, 'manual',
 ARRAY[],
 ARRAY['Medjool dates box','Arabian attar set','premium mithai hamper']),

('For Indian weddings, home décor, kitchen sets, and gold/silver items are preferred over perishables', 
 'soft_preference', ARRAY['india','wedding','hindu','muslim','sikh'], 0.88, 'manual',
 ARRAY['food items that may spoil'],
 ARRAY['premium cookware','home décor','silver items','personalized frames']),

('For Raksha Bandhan, the focus is on brother-sister bond; practical, personal, and thoughtful gifts work best', 
 'soft_preference', ARRAY['india','raksha_bandhan','hindu'], 0.90, 'manual',
 ARRAY['overly expensive luxury items for new contacts'],
 ARRAY['personalized items','experiences','books','hobby-related gifts']),

-- CHINA: Auspicious items
('For Chinese New Year, gifts should emphasize luck, prosperity, and good fortune — red and gold packaging is ideal', 
 'soft_preference', ARRAY['china','chinese_new_year','chinese'], 0.92, 'manual',
 ARRAY['dark packaging','plain white wrapping'],
 ARRAY['red envelope with money','premium tea','high-quality nuts','gold-packaged items']),

('For Chinese recipients, numbers 6 (smooth/lucky), 8 (prosperity), and 9 (eternal) are highly auspicious', 
 'soft_preference', ARRAY['china','chinese','chinese_new_year'], 0.88, 'manual',
 ARRAY[],
 ARRAY['sets of 6','sets of 8','sets of 9']),

-- UK: Class-appropriate gifting
('For UK recipients, quality over quantity is valued — one premium item beats multiple cheap items', 
 'soft_preference', ARRAY['uk','england','scotland','wales','british'], 0.82, 'manual',
 ARRAY['quantity gift sets with low-quality items'],
 ARRAY['single premium item','artisan products','heritage brand items']),

-- USA: Practicality valued
('For US recipients, experiential gifts and practical items tend to score higher than decorative ones', 
 'soft_preference', ARRAY['usa','american'], 0.78, 'manual',
 ARRAY['purely decorative items with no function'],
 ARRAY['experiences','subscriptions','practical home goods','tech accessories']),

-- JAPAN: Presentation matters
('For Japanese recipients, gift wrapping and presentation are as important as the gift itself', 
 'soft_preference', ARRAY['japan','japanese'], 0.90, 'manual',
 ARRAY['unwrapped gifts','hastily wrapped items'],
 ARRAY['beautifully packaged items','premium boxed sets','items from prestigious stores']),

-- Middle East: Hospitality
('For Middle Eastern recipients, high-quality perfumes (non-alcoholic), premium dates, and luxury home items are prestigious gifts', 
 'soft_preference', ARRAY['uae','saudi_arabia','qatar','middle_east','arabic'], 0.88, 'manual',
 ARRAY[],
 ARRAY['oud perfume','bakhoor incense','Medjool dates','premium tea set']);
```

### Regional Notes (Inform Generation)

```sql
INSERT INTO public.cultural_rules (rule_text, rule_type, context_tags, confidence, source)
VALUES
('North Indian gifting tends to be more elaborate and demonstrative than South Indian, where understatement is appreciated', 
 'regional_note', ARRAY['india','north_india','south_india'], 0.72, 'manual'),

('Bengali culture celebrates intellect and art — books, music, and cultural experiences are well-received', 
 'regional_note', ARRAY['india','bengali','west_bengal'], 0.80, 'manual'),

('Gujarati gift culture often involves business and festival gifting; dry fruits, silverware, and sweet boxes are traditional', 
 'regional_note', ARRAY['india','gujarati','gujarat'], 0.82, 'manual'),

('South Korean gifting culture values brand recognition and health-oriented gifts; premium health products and branded goods do well', 
 'regional_note', ARRAY['south_korea','korean'], 0.78, 'manual'),

('In Germany, punctuality and practicality are valued; avoid overly extravagant gifts for professional relationships', 
 'regional_note', ARRAY['germany','german','european'], 0.75, 'manual'),

('In Brazil, personal and warm gifts are preferred; impersonal corporate-style gifts underperform', 
 'regional_note', ARRAY['brazil','brazilian','latin_america'], 0.72, 'manual'),

('For Parsi recipients (Zoroastrian community), flowers and natural elements are culturally appropriate and appreciated', 
 'regional_note', ARRAY['india','parsi','zoroastrian'], 0.80, 'manual'),

('For Tamil Nadu recipients, traditional craftsmanship (Tanjore paintings, Kanchipuram silk) is prestigious', 
 'regional_note', ARRAY['india','tamil_nadu','south_india'], 0.82, 'manual');
```

**Total seed rules: 30 hard constraints + soft preferences + regional notes = ~30 rows at launch**. Target: grow to 200+ rules within 6 months via user feedback and cultural consultant review.

---

## Backfill Strategy

### Phase 1 (Week 1): Seed cultural_rules with above SQL
### Phase 2 (Week 2): Enable embedding generation for new sessions going forward
### Phase 3 (Background job): Backfill `gift_embeddings` for all historical selected gifts

```typescript
// Background backfill: runs once after deployment
async function backfillGiftEmbeddings() {
  const { data: sessions } = await supabase
    .from('gift_sessions')
    .select('id, recipient_id, user_id, selected_gift_name, ai_response, occasion')
    .not('selected_gift_name', 'is', null)
    .eq('status', 'completed')
    .is('engine_version', null)  // Only v1 sessions (no embedding yet)
    .order('created_at', { ascending: true })

  for (const session of sessions ?? []) {
    // Find the recommendation that matches selected_gift_name
    const rec = session.ai_response?.recommendations?.find(
      (r: any) => r.name === session.selected_gift_name
    )
    if (!rec) continue

    const text = buildGiftEmbeddingText(rec, session.occasion)
    const embedding = await generateEmbedding(text)

    await supabase.from('gift_embeddings').upsert({
      session_id: session.id,
      recipient_id: session.recipient_id,
      user_id: session.user_id,
      gift_name: session.selected_gift_name,
      gift_description: rec.description,
      product_category: rec.product_category,
      price_anchor: rec.price_anchor,
      embedding,
      source_text: text,
      occasion: session.occasion,
    }, { onConflict: 'session_id,gift_name' })
  }
}
```

### Phase 4: Backfill `recipient_embeddings`

```typescript
async function backfillRecipientEmbeddings() {
  const { data: recipients } = await supabase
    .from('recipients')
    .select('*')
    .order('created_at', { ascending: true })

  for (const recipient of recipients ?? []) {
    const text = buildRecipientEmbeddingText(recipient)
    const embedding = await generateEmbedding(text)

    await supabase.from('recipient_embeddings').upsert({
      recipient_id: recipient.id,
      user_id: recipient.user_id,
      embedding,
      source_text: text,
    }, { onConflict: 'recipient_id' })
  }
}
```

---

## Cost Projection for Embeddings

| Scenario | Embeddings/month | Tokens/embedding | Monthly cost (OpenAI) | Monthly cost (Gemini) |
|---------|-----------------|-----------------|----------------------|----------------------|
| 100 users, 3 recipients each | 300 recipient + 90 gift = 390 | ~120 | $0.001 | Free |
| 1,000 users | 3,000 + 900 = 3,900 | ~120 | $0.009 | Free |
| 10,000 users | 30,000 + 9,000 = 39,000 | ~120 | $0.094 | Free (some paid) |
| Cultural rules seed (once) | 50 rules | ~50 | $0.0001 | Free |

Embedding costs are negligible at current scale. Gemini free tier (1,500 req/day = ~45,000/month) covers all scenarios up to 10,000 users without spending anything.
