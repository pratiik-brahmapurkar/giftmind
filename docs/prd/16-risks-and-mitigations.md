# 16 — Risks and Mitigations

---

## Risk Registry

| # | Risk | Likelihood | Impact | Status |
|---|------|-----------|--------|--------|
| 1 | LangGraph pipeline latency exceeds 12s P95 | Medium | High | Mitigated |
| 2 | Cultural rules miss important edge cases | High | Medium | Accepted (ongoing) |
| 3 | Embedding costs escalate unexpectedly | Low | Medium | Mitigated |
| 4 | Vercel function cold starts add latency | Medium | Low | Mitigated |
| 5 | pgvector queries are too slow at scale | Low | High | Mitigated |
| 6 | Node 5 (Generator) budget retry loop spins | Low | Medium | Mitigated |
| 7 | Personalization validator over-rejects | Medium | Medium | Mitigated |
| 8 | SSE connection reliability on mobile | Medium | Medium | Mitigated |
| 9 | v1/v2 feature flag creates inconsistent user experience | Low | Low | Accepted |
| 10 | LLM provider rate limits during high-traffic periods | Medium | High | Mitigated |
| 11 | Cultural rules database grows stale | High | Medium | Process mitigation |
| 12 | Budget enforcer is too aggressive (good gifts filtered) | Medium | Medium | Mitigated |
| 13 | Recipient embedding backfill is too slow | Medium | Low | Mitigated |
| 14 | Service costs exceed plan limits during launch spike | Low | High | Mitigated |
| 15 | Supabase pgvector extension not available on current plan | Medium | High | Action required |
| 16 | Node 7 rewrites are lower quality than original | Low | Medium | Mitigated |

---

## Risk 1: LangGraph Pipeline Latency Exceeds 12s P95

**Likelihood:** Medium — the pipeline involves 4 LLM calls (Nodes 1, 3, 5, 7). Under load, LLM API latency can spike. Claude Sonnet (Gifting Pro) is particularly variable (2-15s per call).

**Impact:** High — latency above 12s was identified as a primary metric gate condition. If P95 exceeds 12s, we cannot ship v2.

**Root causes:**
- Nodes 1, 3 run sequentially before 2, 3, 4 parallelize
- Node 5 (generator) is the longest node at 4-6s P50
- Node 7 (validator) adds 2s on top of generator

**Mitigations:**

1. **Parallel execution of Nodes 2, 3, 4** (already in the design). This saves ~1s.

2. **Cache Node 1 output for repeat sessions.** If a user runs a session for the same recipient within 24 hours (e.g., regeneration), the recipient analysis from Node 1 is likely identical. Cache in Redis (Vercel KV) by `recipient_id + profile_hash`. Expected hit rate: ~20-30% of sessions. Saves ~1.5s per cache hit.

3. **Stream SSE events before Node 5 completes.** Users perceive latency as lower when they see progress. Sending `node_start` and `node_complete` events for nodes 1-4 (completed in ~3s) while Node 5 runs eliminates the "blank wait" even if total time is 10s.

4. **Timeout Node 1 early and proceed with raw data.** Node 1 has a 2s latency budget. If it exceeds 2s, use raw input (enrichment_source: 'raw') and skip waiting. Downstream nodes get less analysis quality but session completes within time budget.

5. **Pre-warm Vercel functions.** Use Vercel Pro's cron pinging feature to keep functions warm (eliminates cold start for the first request of a period).

**Monitoring:** PostHog alert if P95 latency exceeds 12s in a rolling 4-hour window.

---

## Risk 2: Cultural Rules Miss Important Edge Cases

**Likelihood:** High — it is not possible to enumerate every cultural edge case at launch. The seed set of 30 rules will miss nuances.

**Impact:** Medium — a miss is not a catastrophic failure (the LLM's implicit knowledge still applies). However, systematic misses in key markets (Jain gifting, regional Indian variations) undermine a core differentiator.

**Mitigation:**

1. **Grow the rule set over time.** Target: 30 rules at launch → 100 by Month 3 → 300 by Year 1. Each user-reported cultural inappropriateness triggers a rule review.

2. **User feedback loop for cultural fit.** The new `feedback_cultural_fit` field (1-5 stars) provides a signal. If cultural fit scores are low for a specific context tag combination, that tag needs new rules.

3. **LLM implicit knowledge as a safety net.** Node 5's system prompt still instructs the model to apply cultural sensitivity. Retrieval improves on top of the model's base knowledge — it doesn't replace it.

4. **Cultural consultant engagement (Month 2-3).** Hire a part-time cultural consultant to review and expand rules for key markets. Budget: ~$500-1000 for a one-time consultation covering 50+ new rules.

**Accepted residual risk:** Some edge cases will be missed indefinitely. The goal is to systematically eliminate the most common and highest-impact violations, not achieve perfection on every conceivable edge case.

---

## Risk 3: Embedding Costs Escalate Unexpectedly

**Likelihood:** Low — at current scale, embedding costs are negligible (< $0.10/month at 1,000 users with OpenAI). Would only matter at 100,000+ users.

**Impact:** Medium — unexpected costs could damage unit economics.

**Mitigations:**

1. **Use Gemini `embedding-001` (free) as the default provider.** Free tier: 1,500 requests/day = 45,000/month. Sufficient up to ~15,000 monthly sessions. At higher scale, OpenAI is still only $2/month per 100,000 sessions.

2. **Cache embeddings aggressively.** Recipient embeddings are only regenerated when the profile changes. Gift embeddings are generated once, after selection. Cultural rule embeddings are generated once per rule. There are no repeated embeddings for the same content.

3. **Alert at $10/month embedding spend.** Set OpenAI spending alert. At $10/month, something unexpected is happening (e.g., re-embedding all content daily due to a bug).

---

## Risk 4: Vercel Function Cold Starts Add Latency

**Likelihood:** Medium — Vercel's serverless functions have cold starts of 200-400ms on Node.js. The first request after a period of inactivity is slow.

**Impact:** Low — 300ms cold start on a 9s pipeline is 3% overhead. Users won't notice.

**Mitigation:** Vercel Pro plan supports keeping functions warm via cron pinging. A simple scheduled ping to `/api/recommend/status?session_id=test` every 5 minutes keeps the function hot during business hours. Cost: 288 pings/day × 30 days = 8,640 invocations/month (within free tier).

---

## Risk 5: pgvector Queries Are Too Slow at Scale

**Likelihood:** Low — IVFFlat ANN search is designed for large tables. At GiftMind's current scale (< 10,000 users → < 30,000 recipient embeddings), IVFFlat with 100 lists provides sub-millisecond queries.

**Impact:** High — if pgvector queries are slow, the entire pipeline is blocked.

**Mitigations:**

1. **IVFFlat index is appropriate for up to ~1M rows.** Switch to HNSW if the table exceeds 500K rows (see migration note in `11-database-schema-changes.md`).

2. **Monitor query latency.** The `match_cultural_rules` and `match_past_gifts` functions log execution time. PostHog event `node_complete` for `cultural_context_retriever` includes `duration_ms`. If Node 2 exceeds 500ms, investigate query performance.

3. **Limit `match_count`.** Cultural rules: return max 8 rules. Past gifts: return max 10 gifts. Small result sets keep queries fast.

4. **Ensure `SET enable_indexscan = on`** in production. pgvector sometimes falls back to sequential scan if the planner estimates it's faster. Confirm the index is being used with `EXPLAIN ANALYZE`.

---

## Risk 6: Node 5 Budget Retry Loop Causes Excessive Latency

**Likelihood:** Low — the retry loop is triggered when fewer than 3 of 5-6 recommendations survive budget filtering. With Node 5 generating candidates over-constrained to the budget range, this should be rare.

**Impact:** Medium — each retry adds 4-6 seconds of LLM time.

**Mitigation:**

1. **Max 2 retries.** After 2 retries, return partial results. Total maximum retries: 2 × 5s = 10s additional, pushing P99 latency to ~22s. This is acceptable as a tail case.

2. **Strong budget constraint in retry prompt.** Retry 1 and 2 prompts are more specific about budget than the first attempt. Retry rate should decrease significantly (retry 2 is rarely triggered).

3. **Monitor retry frequency.** PostHog event `budget_enforcer_ran` with `retry_triggered: true`. If retry rate exceeds 10% of sessions, investigate generator prompt for budget drift.

---

## Risk 7: Personalization Validator Over-Rejects (Overly Strict Scoring)

**Likelihood:** Medium — a stringent scoring rubric could reject good recommendations because they phrase things differently than expected.

**Impact:** Medium — if the validator rejects good recs and the rewrite is poor, overall quality drops.

**Mitigations:**

1. **Low temperature (0.2) for consistent scoring.** The validator runs with `temperature: 0.2` to minimize random variation in scores for the same input.

2. **Calibration during development.** Before launch, run the golden set through Node 7 and compare scores with human ratings. If human raters give 7/10 and the validator gives 48/100 consistently, the rubric is too strict.

3. **Prefer rewrite over rejection.** The node rewrites `why_it_works` for scores 50-69 rather than discarding the gift. Only scores < 50 lead to gift rejection.

4. **Fallback to pass-through.** If Claude Haiku fails during validation, pass all recommendations through unvalidated. The user gets slightly lower average quality but no failure. The `_meta.warnings` field flags this for monitoring.

5. **Conservative threshold.** The 70/100 threshold was chosen to be achievable (not set at 85+). A basic, competent personalization should score 70+ with the rubric as designed.

---

## Risk 8: SSE Connection Reliability on Mobile

**Likelihood:** Medium — EventSource (SSE) has known issues on some mobile browsers and behind certain proxies. iOS Safari has been historically problematic with SSE.

**Impact:** Medium — if SSE drops, users see a blank screen until they refresh.

**Mitigations:**

1. **Polling fallback.** The `GET /api/recommend/status` endpoint provides a polling alternative. If EventSource fails to connect within 3 seconds, the frontend falls back to 2-second polling.

2. **Use `@microsoft/fetch-event-source`** instead of native EventSource. This library handles reconnection, auth headers, and mobile edge cases more reliably.

3. **Send `event: done` + complete payload on reconnect.** If a client reconnects after the pipeline is complete, send the full recommendations in one event rather than replaying the stream.

4. **Timeout fallback to v1.** If the SSE connection fails 3 times in 60 seconds, fall back to a direct call to the v1 Edge Function (`generate-gifts`). The user gets v1 quality rather than no result.

---

## Risk 10: LLM Provider Rate Limits During High-Traffic Periods

**Likelihood:** Medium — if GiftMind goes viral (gifting season: Diwali, Christmas, Valentine's Day) or gets a press mention, request volume could spike 10×.

**Impact:** High — rate-limited LLM calls mean failed sessions and lost revenue during peak gifting periods.

**Mitigations:**

1. **Provider fallback chain still works.** If Claude Haiku (Node 5, Confident plan) is rate-limited, the chain falls back to Gemini Flash, then Groq. The user gets a slightly different quality provider but the session succeeds.

2. **Anthropic burst limits.** On the default tier, Anthropic allows 40,000 tokens/minute for Claude Haiku. At ~2,000 tokens/session, that's 20 concurrent sessions/minute — sufficient for current scale. Upgrade to Tier 2 (140,000 tokens/min) before Diwali/Christmas.

3. **Rate limiting on the frontend.** The existing 10-session-per-hour rate limit (carried over from v1) prevents individual users from hammering the system.

4. **Pre-Diwali capacity check.** One week before major gifting occasions, run a load test with 50 concurrent sessions to verify all provider chains respond within latency targets.

---

## Risk 11: Cultural Rules Database Grows Stale

**Likelihood:** High over time — cultural contexts evolve, new markets are entered, edge cases are discovered. Without active maintenance, the rule set will become outdated.

**Impact:** Medium — stale or wrong rules could cause cultural violations (harder to detect than they were to prevent).

**Process Mitigation:**

1. **Monthly rule audit.** Review all rules with `confidence < 0.80` and `source = 'ai_generated'`. Flag for human review.

2. **Feedback-triggered rule review.** Any user feedback mentioning "inappropriate" or "wrong" for a cultural context triggers a rule review for that context.

3. **Annual full refresh.** Once per year, do a systematic review of all rules in all markets, incorporating new research and community feedback.

4. **Rule versioning.** Keep `created_at` and `updated_at` on all rules. Rules not updated in 18+ months are flagged for review.

---

## Risk 15: Supabase pgvector Extension Not Available on Current Plan

**Likelihood:** Medium — pgvector requires Supabase Pro plan ($25/month). If GiftMind is on the Free plan, this migration cannot proceed.

**Impact:** High — the entire vector memory architecture depends on pgvector.

**Action Required (pre-migration):**

1. Confirm current Supabase plan.
2. If on Free plan, upgrade to Pro before applying migrations.
3. Alternative: use a hosted pgvector service (Neon, Supabase, Railway) alongside Supabase for vectors only.

Note from the codebase audit: the codebase uses `SUPABASE_SERVICE_ROLE_KEY` which suggests a Pro plan is already in use (service role key is available on Pro). Confirm before proceeding.

---

## Residual Risks (Accepted)

These risks have been assessed and accepted without additional mitigation:

| Risk | Acceptance Rationale |
|------|---------------------|
| Cultural rules miss some edge cases | Accepted as an ongoing process risk; LLM implicit knowledge provides a safety net |
| v1/v2 feature flag creates slight UX inconsistency during A/B period | Duration is short (<2 weeks at 10-50%); inconsistency is acceptable for test validity |
| Node 7 rewrites occasionally feel less natural than the original | The rewrite is a fallback for genuinely bad outputs; the original is preserved for scores 70+ |
| Embedding model lock-in | Choosing one embedding model at setup prevents mixing; accepted as a one-time architecture decision |
| LangGraph TypeScript SDK is less mature than Python SDK | Acceptable; TypeScript is preferred for type safety with the frontend; Python SDK can be used if issues arise |
