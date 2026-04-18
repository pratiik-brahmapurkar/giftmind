# 05 — Agent Design: LangGraph

> This document specifies each of the nine nodes in the LangGraph recommendation pipeline: inputs, processing logic, outputs, fallback behavior, and latency budget.

---

## LangGraph State Definition

The graph state is a TypeScript interface passed through every node. Each node receives the full state and returns only the fields it modifies.

```typescript
// packages/langgraph-agent/src/state.ts

export interface RecipientAnalysis {
  primary_interests: string[];          // Top 5 interests ranked by signal strength
  interest_strength: Record<string, number>;  // 0.0–1.0 per interest
  lifestyle: string;                    // e.g. "urban professional", "retired homebody"
  relationship_nuance: string;          // e.g. "close_family_minimal_contact"
  cultural_markers: string[];           // e.g. ["indian_diaspora", "jain", "vegetarian"]
  enrichment_source: 'llm' | 'raw';    // 'raw' if LLM failed; fallback to direct data
}

export interface CulturalRule {
  rule_text: string;
  rule_type: 'hard_constraint' | 'soft_preference' | 'regional_note';
  confidence: number;
  context_tags: string[];
}

export interface OccasionContext {
  sentiment: 'celebratory' | 'commemorative' | 'gratitude' | 'romantic' | 'professional';
  urgency: 'same_day' | 'within_week' | 'planned_ahead';
  gift_norms: string;          // e.g. "Diwali gifts typically involve sweets, dry fruits, or lights"
  budget_appropriateness: string;
  avoid_themes: string[];      // e.g. ["sad themes", "overly personal"]
}

export interface PastGift {
  gift_name: string;
  occasion: string;
  reaction: string | null;     // loved_it, liked_it, neutral, didnt_like
  similarity_score: number;    // cosine similarity to current query
  gifted_at: string;
}

export interface GiftRecommendation {
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;
  signal_interpretation: string;
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
  what_not_to_do: string;
  personalization_score?: number;       // Filled by Node 7
}

export interface RecommendationState {
  // ── Input fields (set before graph runs) ──────────────────────────────
  userId: string;
  sessionId: string;
  recipientId: string;
  recipientName: string;
  recipientRelationship: string;
  recipientRelationshipDepth: string;
  recipientAgeRange: string;
  recipientGender: string;
  recipientInterests: string[];
  recipientCulturalContext: string;
  recipientCountry: string;
  recipientNotes: string;
  occasion: string;
  occasionDate: string | null;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  specialContext: string;
  contextTags: string[];
  userPlan: 'spark' | 'thoughtful' | 'confident' | 'gifting-pro';

  // ── Intermediate (filled by nodes) ────────────────────────────────────
  recipientAnalysis: RecipientAnalysis | null;       // Node 1
  culturalRules: CulturalRule[];                     // Node 2
  occasionContext: OccasionContext | null;            // Node 3
  pastGifts: PastGift[];                             // Node 4
  rawRecommendations: GiftRecommendation[];           // Node 5
  budgetFilteredRecommendations: GiftRecommendation[]; // Node 6
  validatedRecommendations: GiftRecommendation[];    // Node 7
  budgetRetryCount: number;                          // Node 6 retry counter

  // ── Output (filled by Node 8) ─────────────────────────────────────────
  finalRecommendations: GiftRecommendation[];
  occasionInsight: string;
  budgetAssessment: string;
  culturalNote: string | null;

  // ── Metadata (filled throughout) ─────────────────────────────────────
  metadata: {
    providerUsed: string;
    nodeTimings: Record<string, number>;    // node_name → duration_ms
    warnings: string[];
    totalDurationMs: number;
    culturalRulesApplied: number;
    pastGiftsChecked: number;
    engineVersion: 'v2';
  };
}
```

---

## Node 1: Recipient Analyzer

**Purpose:** Transform raw recipient form data into structured psychological and cultural insights that downstream nodes can use precisely.

**Input:** `recipientName`, `recipientRelationship`, `recipientRelationshipDepth`, `recipientAgeRange`, `recipientGender`, `recipientInterests[]`, `recipientCulturalContext`, `recipientCountry`, `recipientNotes`, `specialContext`

**Processing:**
```typescript
const systemPrompt = `You are a recipient profiler. Given raw data about a gift recipient, 
extract structured insights that reveal WHAT KIND OF PERSON they are and WHAT MATTERS TO THEM.

Output strict JSON only. No markdown.`

const userMessage = `Profile this recipient:
Name: ${name}
Relationship: ${relationship} (depth: ${depth})
Age: ${ageRange}
Gender: ${gender}
Interests: ${interests.join(', ')}
Cultural context: ${culturalContext}
Country: ${country}
Notes: ${notes}
Special context: ${specialContext}

Return:
{
  "primary_interests": [up to 5 interests, ranked strongest first],
  "interest_strength": { "interest_name": 0.0-1.0 },
  "lifestyle": "one phrase describing their lifestyle",
  "relationship_nuance": "how close/formal/distant is this relationship",
  "cultural_markers": ["specific cultural identifiers beyond the dropdown"]
}`
```

**Model:** Claude Haiku (all plans — this is a cheap enrichment step)

**Output:**
```json
{
  "primary_interests": ["home cooking", "gardening", "reading"],
  "interest_strength": { "home cooking": 0.9, "gardening": 0.7, "reading": 0.5 },
  "lifestyle": "urban professional with active home life",
  "relationship_nuance": "close_family_infrequent_contact",
  "cultural_markers": ["indian_diaspora", "jain", "vegetarian_lifestyle"]
}
```

**Fallback:** If Claude Haiku fails or returns invalid JSON, Node 1 uses the raw input data directly — interests array becomes `primary_interests`, all strengths set to 0.7, `lifestyle` defaults to "not specified", `cultural_markers` mirrors `recipientCulturalContext`. Sets `enrichment_source: 'raw'` so downstream nodes know the quality of analysis.

**State mutation:** Sets `state.recipientAnalysis`.

**Latency budget:** ≤ 2,000ms

---

## Node 2: Cultural Context Retriever

**Purpose:** Fetch relevant cultural rules from the pgvector `cultural_rules` table based on recipient's cultural markers, country, and occasion.

**Input:** `recipientCountry`, `occasion`, `recipientAnalysis.cultural_markers`

**Processing:**
```typescript
// Build an embedding query string
const queryText = [
  `gift for ${occasion}`,
  `recipient from ${recipientCountry}`,
  ...culturalMarkers,
].join(', ')

// Generate embedding (OpenAI text-embedding-3-small or Gemini embedding-001)
const queryEmbedding = await generateEmbedding(queryText)

// pgvector similarity search
const { data: rules } = await supabase.rpc('match_cultural_rules', {
  query_embedding: queryEmbedding,
  context_tags: [recipientCountry.toLowerCase(), occasion.toLowerCase(), ...culturalMarkers],
  match_threshold: 0.6,
  match_count: 8
})
```

**SQL function:**
```sql
CREATE OR REPLACE FUNCTION public.match_cultural_rules(
  query_embedding vector(1536),
  context_tags text[],
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  rule_text text,
  rule_type text,
  confidence float,
  context_tags text[],
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    rule_text,
    rule_type,
    confidence,
    context_tags,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.cultural_rules
  WHERE
    1 - (embedding <=> query_embedding) > match_threshold
    OR context_tags && $2
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Output:**
```json
[
  {
    "rule_text": "For Jain recipients, avoid leather goods, silk, and any animal-derived products",
    "rule_type": "hard_constraint",
    "confidence": 0.97,
    "context_tags": ["jain", "india", "vegetarian"],
    "similarity": 0.91
  },
  {
    "rule_text": "Dry fruits, nuts, and sweets are auspicious Diwali gifts",
    "rule_type": "soft_preference",
    "confidence": 0.90,
    "context_tags": ["diwali", "india", "hindu"],
    "similarity": 0.88
  }
]
```

**Fallback:** Returns empty array `[]`. Generation proceeds without cultural rules (the LLM's implicit knowledge still applies, but no hard constraints are injected). Logs warning to `metadata.warnings`.

**State mutation:** Sets `state.culturalRules`.

**Latency budget:** ≤ 500ms (pgvector query + embedding generation)

---

## Node 3: Occasion Interpreter

**Purpose:** Enrich the raw occasion string with semantic context about what kind of gift is appropriate, what to avoid, and what the occasion means emotionally.

**Input:** `occasion`, `occasionDate`, `recipientRelationship`, `recipientRelationshipDepth`, `budgetMin`, `budgetMax`

**Processing:**
```typescript
const prompt = `You are an occasion expert. Given an occasion and recipient relationship, 
describe what the occasion means for gift-giving.

Occasion: ${occasion}
Date: ${occasionDate || 'unspecified'}
Recipient relationship: ${relationship} (${depth})
Budget range: $${budgetMin}–$${budgetMax}

Return JSON:
{
  "sentiment": "celebratory|commemorative|gratitude|romantic|professional",
  "urgency": "same_day|within_week|planned_ahead",
  "gift_norms": "1 sentence about typical gifts for this occasion",
  "budget_appropriateness": "1 sentence about whether budget fits this occasion",
  "avoid_themes": ["theme1", "theme2"]
}`
```

**Model:** Claude Haiku (all plans)

**Output:**
```json
{
  "sentiment": "celebratory",
  "urgency": "planned_ahead",
  "gift_norms": "Diwali gifts traditionally include sweets, dry fruits, decorative diyas, and items that bring light and prosperity to the home",
  "budget_appropriateness": "A $30-60 budget is appropriate for a family member — thoughtful but not extravagant",
  "avoid_themes": ["dark colors", "sharp objects", "items symbolizing endings"]
}
```

**Fallback:** Returns a generic `OccasionContext` based on keyword mapping:
- If occasion contains "birthday": `sentiment: "celebratory"`, `avoid_themes: []`
- If occasion contains "anniversary": `sentiment: "romantic"`, `avoid_themes: ["generic items"]`
- etc.

**State mutation:** Sets `state.occasionContext`.

**Latency budget:** ≤ 1,500ms

*Note: Nodes 2, 3, and 4 run in parallel after Node 1 completes.*

---

## Node 4: Past Gift Retriever

**Purpose:** Retrieve semantically similar past gifts for the same recipient to avoid repeats.

**Input:** `recipientId`, `userId`, `recipientAnalysis.primary_interests`

**Processing:**
```typescript
// Step 1: Get recent past gifts from gift_sessions (text fallback, no embedding needed)
const { data: recentSessions } = await supabase
  .from('gift_sessions')
  .select('selected_gift_name, occasion, created_at')
  .eq('recipient_id', recipientId)
  .eq('user_id', userId)
  .not('selected_gift_name', 'is', null)
  .order('created_at', { ascending: false })
  .limit(20)

// Step 2: If gift_embeddings exist for this recipient, do semantic search
const queryText = recipientAnalysis.primary_interests.join(', ')
const queryEmbedding = await generateEmbedding(queryText)

const { data: semanticPastGifts } = await supabase.rpc('match_past_gifts', {
  p_recipient_id: recipientId,
  query_embedding: queryEmbedding,
  match_threshold: 0.7,
  match_count: 10
})

// Merge: text-based recent gifts + semantic similar gifts
const pastGifts = mergePastGifts(recentSessions, semanticPastGifts)
```

**SQL function:**
```sql
CREATE OR REPLACE FUNCTION public.match_past_gifts(
  p_recipient_id uuid,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  gift_name text,
  occasion text,
  reaction text,
  similarity float,
  gifted_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ge.gift_name,
    gs.occasion,
    ge.reaction,
    1 - (ge.embedding <=> query_embedding) AS similarity,
    ge.created_at AS gifted_at
  FROM public.gift_embeddings ge
  JOIN public.gift_sessions gs ON ge.session_id = gs.id
  WHERE
    ge.recipient_id = p_recipient_id
    AND 1 - (ge.embedding <=> query_embedding) > match_threshold
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Output:**
```json
[
  {
    "gift_name": "Premium Spice Kit from Saffron Road",
    "occasion": "birthday",
    "reaction": "loved_it",
    "similarity_score": 1.0,
    "gifted_at": "2025-11-12T00:00:00Z"
  },
  {
    "gift_name": "Cooking Masterclass Voucher",
    "occasion": "diwali",
    "reaction": "liked_it",
    "similarity_score": 0.87,
    "gifted_at": "2024-11-01T00:00:00Z"
  }
]
```

**Fallback:** If `gift_embeddings` table is empty for this recipient (first few sessions), return only text-based recent gifts without semantic similarity scores. If no past gifts at all, return empty array.

**State mutation:** Sets `state.pastGifts`.

**Latency budget:** ≤ 500ms

---

## Node 5: Gift Generator

**Purpose:** Generate 3–6 gift candidates using the enriched context from Nodes 1–4. Intentionally generates more candidates than needed (Node 6 will filter).

**Input:** `recipientAnalysis`, `culturalRules`, `occasionContext`, `pastGifts`, `budgetMin`, `budgetMax`, `specialContext`, `contextTags`, `userPlan`, `budgetRetryCount`

**Processing:**
```typescript
const hardConstraints = culturalRules
  .filter(r => r.rule_type === 'hard_constraint')
  .map(r => `• NEVER suggest: ${r.rule_text}`)
  .join('\n')

const softPreferences = culturalRules
  .filter(r => r.rule_type === 'soft_preference')
  .map(r => `• Prefer: ${r.rule_text}`)
  .join('\n')

const avoidGifts = pastGifts
  .slice(0, 5)
  .map(g => `• "${g.gift_name}" (given ${timeAgo(g.gifted_at)})`)
  .join('\n')

const retryInstruction = budgetRetryCount > 0
  ? `\n⚠️ CRITICAL: Previous attempt had budget violations. ALL price_anchor values MUST be between ${budgetMin} and ${budgetMax}. This is non-negotiable.`
  : ''

const systemPrompt = buildV2SystemPrompt({ hardConstraints, softPreferences, budgetRetryCount })
const userMessage = buildV2UserMessage({
  recipientAnalysis, occasionContext, pastGifts, budgetMin, budgetMax,
  specialContext, contextTags, avoidGifts, retryInstruction
})
```

**System prompt template:**
```
You are GiftMind's gift recommender. Generate 5-6 diverse gift candidates.

CULTURAL CONSTRAINTS (HARD — never violate these):
${hardConstraints || 'No hard constraints for this context.'}

CULTURAL PREFERENCES (SOFT — strongly prefer):
${softPreferences || 'No specific preferences for this context.'}

PREVIOUS GIFTS (NEVER suggest these or anything semantically similar):
${avoidGifts || 'No previous gifts for this recipient.'}

RULES:
- ALL price_anchor values MUST be between $${budgetMin} and $${budgetMax}${retryInstruction}
- Reference ≥2 specific interests from the recipient profile in EVERY why_it_works
- Suggest diverse categories (not all the same type)
- Be specific: not "a book" but "Salt Fat Acid Heat by Samin Nosrat"
- Return JSON array of 5-6 recommendations (we'll filter down to 3)
```

**Model by plan:**
| Plan | Model | Rationale |
|------|-------|-----------|
| spark | groq-llama (llama-3.3-70b) | Free, fast enough for basic needs |
| thoughtful | gemini-flash | Good quality/cost ratio |
| confident | claude-haiku | Strong instruction following |
| gifting-pro | claude-sonnet | Best reasoning, best personalization |

**Output:** Array of 5-6 `GiftRecommendation` objects (no filtering yet — Node 6 handles that)

**Fallback:** If primary model fails, falls back using same chain as v1 (`getProviderChain()`). If all models fail, throws `GENERATOR_FAILED` error which propagates to the SSE stream.

**State mutation:** Sets `state.rawRecommendations`.

**Latency budget:** ≤ 6,000ms (P95, including fallback attempt)

---

## Node 6: Budget Enforcer

**Purpose:** Hard-filter recommendations that violate the budget constraint. Pure code — zero LLM involvement.

**Input:** `rawRecommendations`, `budgetMin`, `budgetMax`, `budgetRetryCount`

**Processing:**
```typescript
export function enforceBudget(
  recommendations: GiftRecommendation[],
  budgetMin: number,
  budgetMax: number
): GiftRecommendation[] {
  return recommendations.filter(rec => {
    const price = typeof rec.price_anchor === 'number'
      ? rec.price_anchor
      : parseFloat(String(rec.price_anchor))
    
    if (isNaN(price)) return false  // reject if no valid price
    return price >= budgetMin && price <= budgetMax
  })
}

// In the node:
const filtered = enforceBudget(rawRecommendations, budgetMin, budgetMax)

if (filtered.length < 3) {
  if (budgetRetryCount < 2) {
    // Loop back to Node 5 with higher retry count
    return { budgetRetryCount: budgetRetryCount + 1, rawRecommendations: [] }
  } else {
    // Exhausted retries: return what we have (may be < 3)
    // Frontend will show with a "Limited results" message
    metadata.warnings.push('BUDGET_FILTER_PARTIAL_RESULTS')
  }
}
```

**Conditional edge in LangGraph:**
```typescript
graph.addConditionalEdges(
  'budgetEnforcer',
  (state) => {
    if (state.budgetFilteredRecommendations.length < 3 && state.budgetRetryCount < 2) {
      return 'giftGenerator'  // loop back
    }
    return 'personalizationValidator'  // proceed
  }
)
```

**Output:** `budgetFilteredRecommendations` (3–6 items within budget), `budgetRetryCount` (incremented if retry triggered)

**Fallback:** None — this is the fallback. If this fails, nothing proceeds.

**State mutation:** Sets `state.budgetFilteredRecommendations`, may increment `state.budgetRetryCount`.

**Latency budget:** < 50ms (no I/O — pure computation)

---

## Node 7: Personalization Validator

**Purpose:** Score each recommendation for genuine personalization quality. Rewrite or reject under-threshold recommendations.

**Input:** `budgetFilteredRecommendations`, `recipientAnalysis`, `occasionContext`

**Processing:**
```typescript
const prompt = `You are a personalization quality validator.

RECIPIENT PROFILE:
Name: ${recipientName}
Key interests: ${recipientAnalysis.primary_interests.join(', ')}
Lifestyle: ${recipientAnalysis.lifestyle}
Relationship: ${recipientRelationship}

OCCASION: ${occasion}

For each recommendation below, score the "why_it_works" field for personalization quality.
Score rubric:
+30 if it mentions ≥2 specific interests from the profile above
+25 if it connects to the specific occasion meaningfully
+25 if it avoids generic phrases like "perfect for anyone", "great for any occasion"
+20 if it references something specific about the relationship or context

If score < 70, also provide a rewritten why_it_works.

Recommendations:
${JSON.stringify(budgetFilteredRecommendations)}

Return JSON: 
[{ "gift_index": 0, "score": 85, "issues": [], "rewrite": null },
 { "gift_index": 1, "score": 52, "issues": ["generic phrase"], "rewrite": "Given Priya's deep love of home cooking..." }]`
```

**Logic:**
- Score ≥ 70: accept as-is
- Score 50–69: replace `why_it_works` with Node 7's rewrite
- Score < 50: mark for replacement; Node 8 uses the rewrite or drops the recommendation

**Model:** Claude Haiku (same for all plans — validation quality should be consistent)

**Output:** `validatedRecommendations` (same structure as input but with rewritten `why_it_works` where needed, and `personalization_score` field added)

**Fallback:** If Claude Haiku fails, proceed with unvalidated recommendations. Add `'PERSONALIZATION_VALIDATION_SKIPPED'` to `metadata.warnings`. Frontend can show a soft indicator.

**State mutation:** Sets `state.validatedRecommendations`.

**Latency budget:** ≤ 2,000ms

---

## Node 8: Response Formatter

**Purpose:** Assemble the final response structure from validated recommendations. Select the top 3 if more than 3 remain. Generate occasion_insight, budget_assessment, cultural_note.

**Input:** `validatedRecommendations`, `occasionContext`, `culturalRules`, `budgetMin`, `budgetMax`, `recipientAnalysis`

**Processing:**
```typescript
// Select top 3 by personalization_score (desc), then confidence_score (desc)
const top3 = validatedRecommendations
  .sort((a, b) => {
    const scoreDiff = (b.personalization_score ?? 0) - (a.personalization_score ?? 0)
    if (scoreDiff !== 0) return scoreDiff
    return b.confidence_score - a.confidence_score
  })
  .slice(0, 3)

const culturalNote = culturalRules.length > 0
  ? generateCulturalNote(culturalRules, top3)
  : null

const occasionInsight = occasionContext?.gift_norms ?? `For ${occasion}, thoughtful and personal gifts work best.`

const budgetAssessment = occasionContext?.budget_appropriateness
  ?? `A $${budgetMin}–$${budgetMax} budget is suitable for this occasion.`
```

**Output:** Final `finalRecommendations[]`, `occasionInsight`, `budgetAssessment`, `culturalNote`

**No LLM call** — pure assembler.

**State mutation:** Sets `state.finalRecommendations`, `state.occasionInsight`, `state.budgetAssessment`, `state.culturalNote`.

**Latency budget:** < 100ms

---

## Node 9: Telemetry

**Purpose:** Persist results and fire analytics events. Non-blocking — runs as a fire-and-forget after the response is already streaming.

**Input:** Full `state` (read-only)

**Processing:**
```typescript
// 1. Update gift_sessions with v2 results
await supabase.from('gift_sessions').update({
  ai_response: {
    recommendations: finalRecommendations,
    occasion_insight: occasionInsight,
    budget_assessment: budgetAssessment,
    cultural_note: culturalNote,
  },
  ai_model_used: metadata.providerUsed,
  ai_latency_ms: metadata.totalDurationMs,
  personalization_scores: validatedRecommendations.map((r, i) => ({
    gift_index: i, score: r.personalization_score
  })),
  node_timings: metadata.nodeTimings,
  cultural_rules_applied: metadata.culturalRulesApplied,
  past_gifts_checked: metadata.pastGiftsChecked,
  engine_version: 'v2',
  status: 'active',
}).eq('id', sessionId)

// 2. Fire PostHog events
posthog.capture('recommendation_v2_complete', {
  distinct_id: userId,
  session_id: sessionId,
  total_duration_ms: metadata.totalDurationMs,
  node_timings: metadata.nodeTimings,
  provider_used: metadata.providerUsed,
  cultural_rules_applied: metadata.culturalRulesApplied,
  past_gifts_checked: metadata.pastGiftsChecked,
  avg_personalization_score: avg(validatedRecommendations.map(r => r.personalization_score ?? 0)),
  budget_compliance: true,  // always true if we reach Node 9
  warnings: metadata.warnings,
})
```

**No LLM call** — pure persistence.

**State mutation:** None (read-only).

**Latency budget:** < 300ms (fire-and-forget; client receives `event: done` before this completes)

---

## Parallel Execution Design

Nodes 2, 3, and 4 run in parallel after Node 1 completes:

```typescript
graph.addNode('recipientAnalyzer', node1)
graph.addNode('culturalRetriever', node2)
graph.addNode('occasionInterpreter', node3)
graph.addNode('pastGiftRetriever', node4)
graph.addNode('giftGenerator', node5)
graph.addNode('budgetEnforcer', node6)
graph.addNode('personalizationValidator', node7)
graph.addNode('responseFormatter', node8)
graph.addNode('telemetry', node9)

// After Node 1: fan out to 2, 3, 4 in parallel
graph.addEdge('recipientAnalyzer', 'culturalRetriever')
graph.addEdge('recipientAnalyzer', 'occasionInterpreter')
graph.addEdge('recipientAnalyzer', 'pastGiftRetriever')

// All three must complete before Node 5
graph.addEdge('culturalRetriever', 'giftGenerator')
graph.addEdge('occasionInterpreter', 'giftGenerator')
graph.addEdge('pastGiftRetriever', 'giftGenerator')

// Sequential from Node 5 onward
graph.addEdge('giftGenerator', 'budgetEnforcer')
// Conditional: budgetEnforcer → giftGenerator (retry) or personalizationValidator
graph.addConditionalEdges('budgetEnforcer', budgetRetryCondition)
graph.addEdge('personalizationValidator', 'responseFormatter')
graph.addEdge('responseFormatter', 'telemetry')
```

**Latency benefit of parallelism:**
- Serial (2+3+4): 500 + 1500 + 500 = 2,500ms
- Parallel (2+3+4): max(500, 1500, 500) = 1,500ms
- Saving: ~1,000ms (8% of P95 budget)

---

## SSE Event Timeline

```
t=0ms    → event: node_start  {node: "recipient_analyzer"}
t=1500ms → event: node_complete {node: "recipient_analyzer", duration_ms: 1500}
           + event: status {message: "Understanding your recipient..."}
t=1500ms → event: node_start  {node: "cultural_context_retriever"}  (parallel with 3 & 4)
t=1500ms → event: node_start  {node: "occasion_interpreter"}
t=1500ms → event: node_start  {node: "past_gift_retriever"}
t=1800ms → event: node_complete {node: "cultural_context_retriever", duration_ms: 300}
t=2000ms → event: node_complete {node: "past_gift_retriever", duration_ms: 500}
t=2800ms → event: node_complete {node: "occasion_interpreter", duration_ms: 1300}
           + event: status {message: "Generating personalized recommendations..."}
t=2800ms → event: node_start  {node: "gift_generator"}
t=7200ms → event: node_complete {node: "gift_generator", duration_ms: 4400}
t=7250ms → event: node_start  {node: "budget_enforcer"}
t=7270ms → event: node_complete {node: "budget_enforcer", duration_ms: 20}
           + event: status {message: "Validating personalization..."}
t=7270ms → event: node_start  {node: "personalization_validator"}
t=9100ms → event: node_complete {node: "personalization_validator", duration_ms: 1830}
t=9120ms → event: recommendations {recommendations: [...], occasion_insight: "...", ...}
t=9130ms → event: done {session_id: "...", total_duration_ms: 9130}
```

Total: ~9.1s (well within 12s P95 target)
