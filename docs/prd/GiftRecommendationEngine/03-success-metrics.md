# 03 — Success Metrics

> **Principle:** Every metric must be measurable in production with existing instrumentation (PostHog + Supabase). If we can't measure it automatically, we don't ship to 100% until we can.

---

## Primary Metrics (must hit to ship v2 at 100%)

These are the gate conditions for full rollout. All must be met during the Week 5 A/B test period before 100% traffic is switched.

| Metric | Current (v1 estimate) | v2 Target | Measurement Method |
|--------|----------------------|-----------|-------------------|
| **Personalization Rate** | ~60% | **≥ 90%** | % of recs where `personalization_score` ≥ 70 (stored in `gift_sessions.personalization_scores` jsonb) |
| **Budget Compliance** | ~70% | **100%** | % of recs where `price_anchor` is within `[budget_min, budget_max]`. Checked by Node 6 before any rec reaches the user. Zero tolerance. |
| **Cultural Appropriateness** | ~75% | **≥ 90%** | % of sessions where feedback_cultural_fit is 4 or 5 (1-5 scale). Requires feedback UI to be built. |
| **Feedback ≥ "Liked it"** | N/A (no feedback UI) | **≥ 70%** | % of feedback events rated `liked_it` or `loved_it` (4 or 5 on star scale). |
| **P95 E2E Latency** | ~8-12s (estimated) | **< 12s** | `gift_generation_complete` PostHog event `$duration` at P95. Measured server-side from session create to final rec delivery. |

### Notes on Current Estimates

- **Personalization Rate (~60%):** Estimated from the system prompt structure — the model is *asked* to reference specific recipient details but there is no validation. Based on LLM behavior on multi-objective prompts, approximately 40% of outputs use generic phrasing. This will be confirmed by running the golden test set (100 test cases, human-rated) during Week 5.
- **Budget Compliance (~70%):** Estimated from Groq/Llama behavior on numeric constraints. Claude Sonnet is closer to 90%, but Spark plan (majority of free users) uses Groq first. The 70% is a pessimistic-but-reasonable estimate.
- **Cultural Appropriateness (~75%):** No direct measurement exists. Estimate based on the coarseness of the `cultural_context` enum (6 buckets for all cultures) and the single-line cultural instruction in the prompt.

---

## Secondary Metrics (nice-to-hit; tracked but not ship blockers)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Past-Gift Avoidance Rate** | 100% | % of sessions where no suggested gift is semantically similar (cosine similarity > 0.85) to a past selected gift for the same recipient. Checked in Node 4. |
| **Recipient Embedding Coverage** | ≥ 80% of active recipients have an embedding within 24h of profile creation | `recipient_embeddings` table coverage vs `recipients` table |
| **Regeneration Rate** | < 25% | % of sessions where `regeneration_count > 0`. Current baseline: unknown (tracked in `gift_sessions.regeneration_count`). |
| **Cross-session coherence** | Average embedding similarity of same-recipient sessions ≥ 0.6 | Cosine similarity between `recipient_embeddings` across time |
| **Node P95 Latency breakdown** | Node 1: <2s, Node 2: <500ms, Node 3: <1.5s, Node 4: <500ms, Node 5: <5s, Nodes 6-9: <500ms | Per-node timing in `gift_sessions.node_timings` jsonb |
| **Cultural Rules Cache Hit Rate** | > 70% of Node 2 queries return ≥ 3 relevant rules | PostHog event `cultural_rules_retrieved` with `count` property |

---

## Counter-Metrics (must NOT regress)

These are existing metrics that v2 must not make worse. If any of these regress during A/B testing, v2 rollout pauses.

| Metric | Current (v1) | Regression Threshold | Measurement |
|--------|-------------|---------------------|-------------|
| **AI cost per session** | ~$0.01–$0.03 (estimated) | **≤ $0.05** per session (paid plans) | Sum of per-node token costs tracked in PostHog |
| **Session error rate** | < 2% (estimated) | **< 2%** | % of sessions ending in an error state (`status = 'abandoned'` + error events in PostHog) |
| **Abandoned session rate** | < 10% | **< 10%** | % of sessions where no gift is selected within 30 minutes |
| **Credit deduction errors** | ~0% | **< 0.1%** | Failed `deduct-credit` calls that incorrectly charge or fail to charge |
| **P99 availability** | N/A | **≥ 99.5%** | Vercel function error rate < 0.5% as measured by Vercel analytics |
| **Time to first token (TTFT)** | N/A (no streaming in v1) | **< 3s** (for first SSE event to fire) | PostHog `recommendation_stream_start` event timing |

---

## Metric Definitions (canonical)

### Personalization Rate
A recommendation is "personalized" if its `personalization_score` (assigned by Node 7, Personalization Validator) is ≥ 70 out of 100.

The personalization score is calculated by Node 7 using Claude Haiku with this scoring rubric:
- +30 points: Mentions ≥ 2 specific interests from the recipient profile
- +25 points: Connects gift to the occasion in a specific way
- +25 points: Avoids generic phrases ("perfect for anyone who loves X", "great choice for any occasion")
- +20 points: References something specific about the relationship (depth, history, context)

Score is stored in `gift_sessions.personalization_scores` as a jsonb array: `[{"gift_index": 0, "score": 82}, ...]`

Personalization Rate = `COUNT(sessions where avg(personalization_scores) >= 70) / COUNT(all sessions)`.

### Budget Compliance
A session has 100% budget compliance if every recommendation in `ai_response.recommendations` has `price_anchor` in `[budget_min, budget_max]` (inclusive). Budget compliance is a boolean per session, not a percentage — it's either 100% or it failed.

Node 6 enforces this before any recommendation reaches the user, so the only way budget compliance can be < 100% in v2 is:
1. A bug in Node 6's code
2. A retry loop that exhausts retries and falls back to partial results

Both cases are tracked as PostHog events: `budget_enforcer_filtered` (normal) and `budget_enforcer_failed` (exhausted retries).

### P95 Latency
Measured as the time from `POST /api/recommend/start` to `event: done` SSE event received by the client. Tracked via PostHog event `recommendation_complete` with property `total_duration_ms`. P95 is computed over a rolling 7-day window.

The 12-second target accounts for:
- Node 1 (Recipient Analyzer): ~1.5s
- Nodes 2-4 (parallel): ~800ms
- Node 5 (Gift Generator): ~4-6s (LLM call, longest node)
- Node 6 (Budget Enforcer): ~50ms
- Node 7 (Personalization Validator): ~2s
- Nodes 8-9 (Formatter + Telemetry): ~200ms
- Network overhead: ~500ms

Total P50 estimate: ~9s. P95 target: 12s (accounting for occasional LLM slowness).

---

## Measurement Infrastructure

### PostHog Events (new events for v2)

```typescript
// When recommendation pipeline starts
posthog.capture('recommendation_v2_started', {
  session_id,
  user_plan,
  recipient_country,
  occasion,
  budget_range: `${budget_min}-${budget_max}`
})

// When each node completes
posthog.capture('recommendation_node_complete', {
  session_id,
  node_name: 'recipient_analyzer' | 'cultural_context_retriever' | ...,
  duration_ms,
  success: boolean,
  output_summary: string  // non-PII summary
})

// When budget enforcer runs
posthog.capture('budget_enforcer_ran', {
  session_id,
  input_count: 3,
  output_count: number,  // how many survived
  filtered_count: number,
  retry_triggered: boolean
})

// When personalization validator runs
posthog.capture('personalization_validation_ran', {
  session_id,
  scores: [82, 74, 91],
  below_threshold_count: number,
  rewritten_count: number,
  rejected_count: number
})

// When recommendation completes
posthog.capture('recommendation_v2_complete', {
  session_id,
  total_duration_ms,
  node_timings: { recipient_analyzer: 1200, ... },
  provider_used: 'claude-haiku',
  cultural_rules_applied: number,
  past_gifts_checked: number,
  budget_compliance: true,
  avg_personalization_score: 83
})
```

### Supabase Schema Changes for Metrics

```sql
-- Add to gift_sessions (new columns)
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS personalization_scores jsonb,  -- [{gift_index, score}, ...]
  ADD COLUMN IF NOT EXISTS node_timings jsonb,            -- {recipient_analyzer: 1200, ...}
  ADD COLUMN IF NOT EXISTS cultural_rules_applied integer,
  ADD COLUMN IF NOT EXISTS past_gifts_checked integer,
  ADD COLUMN IF NOT EXISTS engine_version text DEFAULT 'v1';  -- 'v1' or 'v2'
```

The `engine_version` column enables precise metric segmentation between v1 and v2 during the A/B period.

---

## Weekly Review Cadence

During the 6-week rollout:
- **Daily:** Error rate, P95 latency (automated alert if > 15s)
- **Weekly:** Personalization Rate, Budget Compliance, Regeneration Rate
- **End of Week 5 (gate check):** All primary metrics must hit targets before 100% rollout is approved

Post-rollout:
- **Monthly:** Full metrics review. If personalization rate drops below 80% or budget compliance drops below 99%, incident opened.
