# 02 — Problem Statement

> This document defines the specific, evidence-based problems that the v2 Gift Recommendation Engine is designed to solve. Each problem includes a concrete symptom, its root cause in the current codebase, its measurable impact, and the specific architectural gap responsible.

---

## Problem 1: Generic Recommendations

**Symptom:** AI returns gifts like "scented candle set," "luxury chocolate box," or "Bluetooth speaker" with `why_it_works` text that reads: *"This thoughtful gift shows you care about their wellbeing and makes for a perfect birthday surprise."* No mention of the recipient's name, interests, occupation, relationship depth, or anything specific to this person.

**Location in codebase:**
- `supabase/functions/generate-gifts/index.ts:208–253` — `buildSystemPrompt()` instructs the model to "Reference specific recipient details in every why_it_works" but provides no mechanism to verify this happened.
- There is no post-generation check. Whatever the LLM returns (if it passes `validateAIResponse()` structural validation) goes directly to the user.

**Root cause:** The architecture has a single validation step at the schema level (`validateAIResponse()` checks that fields exist and have correct types). It does not validate the semantic quality of those fields. A `why_it_works` string that says "a great choice for any occasion" passes schema validation identically to one that says "Given Priya's deep interest in Indian classical cooking and her recent move to a new city, this spice subscription from a regional artisan fits exactly the kind of discovery she's seeking."

**Estimated prevalence:** Based on the system prompt relying solely on LLM instruction (no verification step), and the known behavior of frontier LLMs under token pressure, an estimated 30–40% of recommendations fail to reference at least 2 specific recipient signals. This estimate would be confirmed in the golden set evaluation (see 14-testing-strategy.md).

**Impact:**
- Users perceive GiftMind as "just another AI gift finder" instead of an emotionally intelligent recommender.
- High regeneration rate (users click "Try Again" because results feel generic).
- Low word-of-mouth / referral conversion ("it just gives the same stuff as a Google search").

**v2 Fix:** Node 7 (Personalization Validator) scores each recommendation 0–100 for personalization quality. Any recommendation scoring below 70 is either rewritten (if a refinement is generated) or rejected and regenerated. The scoring prompt checks for 4 conditions: ≥2 specific interest references, occasion connection, person-specific authorship tone, no clichés.

---

## Problem 2: Cultural Mismatches

**Symptom:** For a Jain recipient celebrating Diwali, the AI suggests "a beautiful silk saree" (silk is prohibited in Jainism due to the silkworm being killed in production) or a "leather passport holder" (leather is non-vegan). For a Muslim recipient celebrating Eid, the AI suggests "a premium wine gift set." For a Chinese New Year gift, the AI suggests giving 4 items (4 is the death number in Chinese culture).

**Location in codebase:**
- `supabase/functions/generate-gifts/index.ts:228` — Cultural awareness is the last line of the system prompt:
  ```
  "- Consider cultural context (Diwali, Eid, etc.) if recipient's country implies it"
  ```
  That's the entire cultural intelligence system.
- The `recipients.cultural_context` enum is `('indian_hindu','indian_muslim','indian_christian','western','mixed','other')` — 6 options that collapse vast cultural diversity into buckets (no Jain, no Sikh, no Buddhist, no regional sub-contexts).

**Root cause:** Cultural rules exist only as implicit model knowledge. There is no:
- Database of explicit cultural rules
- Retrieval mechanism for context-specific rules
- Hard constraint enforcement for religious/cultural taboos
- Mechanism to add new rules without editing code or retraining

When the LLM's training data is thin on a specific cultural edge case (e.g., Jain dietary restrictions in gifting), it may not surface the relevant constraint — especially when other signals (budget pressure, occasion enthusiasm) compete for token attention.

**Estimated prevalence:** Cultural mismatch is difficult to measure without explicit feedback. The `feedback_rating` column exists in `gift_sessions` but the feedback collection UI is not implemented. However, cultural gifting taboos (leather for Jains, pork for Muslims, specific number symbolism for Chinese recipients) are deterministic — they are always wrong, not sometimes. One bad suggestion in 10 destroys trust for the entire session.

**Impact:**
- Loss of trust in a market (India) where cultural sensitivity is a core differentiator.
- Risk of negative social sharing ("GiftMind suggested a leather gift for my Jain mother").
- Inability to enter certain markets (Middle East, East Asia) without systematic cultural handling.

**v2 Fix:** Node 2 (Cultural Context Retriever) performs pgvector similarity search on a `cultural_rules` table seeded with 50+ hard constraints and soft preferences. Rules are returned as structured objects with `rule_type: "hard_constraint" | "soft_preference" | "regional_note"`. Hard constraints are injected into Node 5 (Gift Generator) as a `MUST NOT include:` system block that is processed before any gift generation. This makes it structurally impossible for the model to suggest leather for a Jain recipient — the constraint is in the prompt as a system-level prohibition, not a soft instruction.

---

## Problem 3: Budget Overshoot

**Symptom:** User sets a $30–$50 budget. The AI returns a recommendation with `price_anchor: 75`. The product links generated by `search-products` either (a) return actual products priced at $65–$85, confusing the user, or (b) return no match (the scored products near that price anchor are all above budget), resulting in a fallback generic search link.

**Location in codebase:**
- `supabase/functions/generate-gifts/index.ts:282–285` (in `buildUserMessage()`):
  ```
  BUDGET: ${sanitizeString(body.currency, 10)} ${body.budget_min} - ${body.budget_max}
  ```
  Budget is communicated as a text range in the user message.
- System prompt line 226: `"Price anchors must fit within the user's budget range"` — this is a suggestion to the LLM, not a constraint.
- `supabase/functions/search-products/index.ts:235–244` — `scoreProduct()` applies a -10 penalty for out-of-budget items but does not filter them out. An item scored at 60 (in-budget) beats one at 30 (out-of-budget), but the scoring logic is primarily keyword-based, meaning an exact-match out-of-budget product often beats a poor-match in-budget product.

**Root cause:** There is no post-generation filter that enforces the budget as a hard constraint. The LLM is asked to comply, and it mostly does, but:
- Under token pressure (complex recipient profiles, many interests), budget compliance degrades.
- Groq (Llama 70B), used for Spark plan, is more prone to budget overshoot than Claude.
- There is no retry mechanism if budget is violated — the violation silently reaches the user.

**Estimated prevalence:** ~30% of sessions have at least one recommendation outside budget range. This is estimated from the behavior profile of the model stack (Groq/Gemini being less instruction-following on numeric constraints than Claude Sonnet).

**Impact:**
- Product links show out-of-range prices, breaking the core value proposition of the product discovery flow.
- Users report "the prices are wrong" — eroding trust in the AI's practical utility.
- Affiliate conversion suffers: users won't click links for products they've already decided cost too much.

**v2 Fix:** Node 6 (Budget Enforcer) is a deterministic TypeScript/Python function (no LLM). It receives the array from Node 5, checks each `price_anchor` against `[budget_min, budget_max]`, and discards violators. If fewer than 3 recommendations remain, the graph triggers a retry of Node 5 with a strengthened budget constraint. After 2 retries, it shows partial results with a user-facing note. Budget compliance becomes a guarantee, not a best-effort.

---

## Problem 4: No Memory — Every Session Starts from Zero

**Symptom:** A user has gifted their partner (Ananya) five times over three years: a cooking class voucher, a board game set, a premium spice kit, a succulent garden kit, and a reading lamp. The sixth session for Ananya's birthday gets recommendations for: a cooking class, a board game, and a spice set. The AI has no knowledge that these exact categories have been used.

**Location in codebase:**
- `supabase/hooks/useGiftSession.ts:600–618` — `selectGift()` stores `selected_gift_name` and `selected_gift_index` in `gift_sessions`, then updates `recipients.last_gift_date`. The selected gift name is a text string.
- `supabase/functions/generate-gifts/index.ts:256–290` (`buildUserMessage()`) — nowhere in the user message is past gift history retrieved or included. The function has no query to `gift_sessions` to fetch prior selected gifts.
- No embedding infrastructure exists anywhere in the codebase.

**Root cause:** Past gift data is written but never read during new session generation. The `selected_gift_name` field exists and is populated, but no code path queries it during recommendation generation. This is a structural gap — not a prompt engineering failure.

**Impact:**
- Repeat suggestions destroy the feeling of an "intelligent" recommender.
- Users who use GiftMind regularly get diminishing value over time rather than increasing value.
- The compounding advantage of a memory-based product (each session improves the next) is entirely unrealized.

**v2 Fix:** Node 4 (Past Gift Retriever) queries `gift_embeddings` for semantically similar past gifts for the same recipient. The retrieved list is passed to Node 5 as a `MUST NOT suggest anything semantically similar to:` constraint. This avoids not just exact repeats ("cooking class") but conceptually similar items ("culinary experience," "chef's workshop") that would feel repetitive.

---

## Problem 5: Monolithic Prompt — Quality Ceiling

**Symptom:** The quality of recommendations is capped by what a single LLM call can reliably handle in one pass. As recipient complexity increases (many interests, nuanced cultural context, unusual occasion, tight budget), the model's attention is distributed across competing concerns and the quality of any single concern degrades.

**Location in codebase:**
- `supabase/functions/generate-gifts/index.ts:207–253` — `buildSystemPrompt()` is 250 words asking the model to be: a cultural expert, an occasion interpreter, a budget calculator, a personalization validator, a search keyword generator, and a confidence scorer — all in one response.
- `buildUserMessage()` passes all recipient context as flat text. There is no pre-processing, enrichment, or structuring of this data before it reaches the model.

**Root cause:** The single-pass architecture is not decomposed. Every concern competes for attention in the same context window. When the occasion is complex (e.g., "colleague's promotion celebration in a conservative corporate culture in South India"), the model must simultaneously reason about cultural norms, relationship distance, workplace appropriateness, budget, and personalization. Any one of these can crowd out another.

Additionally, if the generation fails partially (e.g., budget constraint is violated), there is no mechanism to retry just that constraint — the entire generation retries from scratch (at 1 credit per attempt for the initial call).

**Impact:**
- Quality ceiling is set by model capability on a multi-objective single-pass task.
- No testability: the entire generation is a black box — impossible to unit test budget enforcement, cultural rules, or personalization in isolation.
- No observability: if a recommendation is bad, there is no signal about which concern failed.

**v2 Fix:** Nine focused nodes, each with a single job. Node 1 extracts recipient insights. Node 2 retrieves cultural rules. Node 3 interprets occasion. Node 4 retrieves past gifts. Node 5 generates gifts using all the above as structured context. Each node is independently testable, observable, and retryable. The LangGraph state object tracks inputs and outputs of each node, enabling precise debugging when a recommendation fails.

---

## Problem 6: No Streaming — Synchronous Wait

**Symptom:** User clicks "Find a Gift." The screen shows a loading spinner. After 6–12 seconds, the full results appear at once. There is no incremental feedback — no indication of which stage the system is in, no partial results, no progress.

**Location in codebase:**
- `supabase/hooks/useGiftSession.ts:310–368` — `callAI()` does a `functions.invoke()` which is a standard HTTP POST. The Supabase Edge Function responds synchronously.
- `isGenerating` and `isSearchingProducts` are separate boolean states — the frontend does show two loading states sequentially, but neither gives granular progress.

**Root cause:** Supabase Edge Functions do not natively support SSE (Server-Sent Events) streaming for progressive JSON delivery. The architecture is request-response.

**Impact:**
- Perceived latency is high (even if actual latency is 6s, users experience "blank wait").
- On mobile or slow connections, users abandon before results appear.
- No opportunity for engagement during the wait (progress messages build anticipation rather than anxiety).

**v2 Fix:** Vercel API routes support SSE natively. The `/api/recommend/stream` endpoint sends `event: node_complete` events as each node finishes, giving users progressive feedback: "Analyzing recipient... Checking cultural context... Finding past gifts... Generating recommendations..." Users see meaningful progress and the perceived wait time drops even if actual latency is unchanged.

---

## Summary Table

| Problem | Root Cause | Current Impact | v2 Fix |
|---------|-----------|----------------|--------|
| Generic recommendations | No post-generation personalization check | ~30-40% generic output | Node 7: Personalization Validator |
| Cultural mismatches | Cultural rules in prompt only | Taboo violations, market trust loss | Node 2: pgvector cultural rules retrieval |
| Budget overshoot | Budget is LLM suggestion, not code constraint | ~30% out-of-budget output | Node 6: Deterministic budget filter |
| No memory | Past gifts written but never read | Repeat suggestions, no compounding value | Node 4: Past gift retrieval + gift_embeddings |
| Monolithic prompt | No decomposition, no individual retries | Quality ceiling, black box | 9-node LangGraph pipeline |
| No streaming | Supabase Edge Function sync response | Perceived 6-12s blank wait | Vercel SSE streaming |
