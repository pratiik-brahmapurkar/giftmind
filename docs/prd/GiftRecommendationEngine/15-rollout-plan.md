# 15 — Rollout Plan

> Six-week plan from kickoff to 100% v2 traffic. Each week has concrete deliverables, success criteria, and go/no-go decisions.

---

## Week 1: Foundation

**Goal:** Database, tooling, and infrastructure ready. No user-facing changes.

### Deliverables

| Task | Owner | Done When |
|------|-------|-----------|
| Apply pgvector migration | Engineering | `SELECT * FROM pg_extension WHERE extname = 'vector'` returns a row |
| Apply recipient_embeddings migration | Engineering | Table exists with correct schema |
| Apply gift_embeddings migration | Engineering | Table exists with correct schema |
| Apply cultural_rules migration | Engineering | Table exists with correct schema |
| Apply gift_sessions alterations | Engineering | New columns exist with correct defaults |
| Seed cultural_rules (30+ rules) | Engineering | `SELECT COUNT(*) FROM cultural_rules` ≥ 30 |
| Generate embeddings for seeded rules | Engineering | `SELECT COUNT(*) FROM cultural_rules WHERE embedding IS NOT NULL` = total |
| Vercel project initialized | Engineering | `vercel link` succeeds, project visible in dashboard |
| LangGraph package scaffolded | Engineering | `packages/langgraph-agent/src/state.ts` exists with full TypeScript interfaces |
| AI provider module ported to Node.js | Engineering | Unit tests pass for `callAIWithFallback()` in Node.js context |
| Embedding utility built | Engineering | `generateEmbedding('test text')` returns 1536-dim vector |
| CI pipeline running unit tests | Engineering | GitHub Actions passes on main branch push |

### Go/No-Go for Week 2

All deliverables complete. pgvector queries returning results from seeded cultural_rules.

---

## Week 2: Agent Nodes 1–5

**Goal:** The data-gathering and generation nodes are built and individually tested.

### Deliverables

| Task | Owner | Done When |
|------|-------|-----------|
| Node 1 (Recipient Analyzer) built | Engineering | 10 unit tests pass |
| Node 2 (Cultural Context Retriever) built | Engineering | Jain+Diwali query returns leather prohibition; empty context returns [] |
| Node 3 (Occasion Interpreter) built | Engineering | 10 occasions return valid OccasionContext |
| Node 4 (Past Gift Retriever) built | Engineering | Returns empty array gracefully; returns results with seeded data |
| Node 5 (Gift Generator) built | Engineering | Returns 5+ GiftRecommendation objects for test input |
| LangGraph graph wired (Nodes 1-5 only) | Engineering | Partial graph runs without errors |
| Provider chain ported for all plans | Engineering | All 4 plan chains produce valid results |

### Day-by-Day

**Day 1-2: Node 1**
- Build recipient analyzer prompt
- Test with 5 sample recipients
- Verify `cultural_markers` extraction from notes field
- Add unit tests

**Day 3: Node 2**
- Build cultural retriever
- Test Jain case, Muslim case, Chinese case, Western case
- Verify similarity scores are reasonable
- Add unit tests

**Day 4: Node 3**
- Build occasion interpreter
- Test 10 occasions
- Add unit tests

**Day 5-6: Node 4**
- Build past gift retriever
- Test with empty `gift_embeddings` (text fallback)
- Seed 3-4 test `gift_embeddings` rows, verify semantic retrieval
- Add unit tests

**Day 7: Node 5**
- Build gift generator
- Wire all context from nodes 1-4 into the prompt
- Test with full context vs no context (baseline comparison)
- Add integration test fixture #1

**Day 8-9: Wire Nodes 1-5**
- Wire partial LangGraph graph
- Run 5 full pipeline tests (nodes 1-5 only; nodes 6-9 are stubs returning input unchanged)
- Verify parallel execution of nodes 2, 3, 4

**Day 10: Node tests review**
- Code review
- Fix any failing tests
- Document any prompt changes needed

### End-of-Week 2 Milestone

Partial pipeline (nodes 1-5) produces valid, personalized, budget-aware gift recommendations on all 10 integration test fixtures.

### Go/No-Go for Week 3

≥ 80% of integration fixture test outputs are within budget AND reference recipient-specific interests.

---

## Week 3: Agent Nodes 6–9 + Vercel API

**Goal:** Complete the pipeline. Add enforcement and validation layers. Connect to Vercel.

### Deliverables

| Task | Owner | Done When |
|------|-------|-----------|
| Node 6 (Budget Enforcer) built | Engineering | All 10 unit tests pass; retry loop works |
| Node 7 (Personalization Validator) built | Engineering | Generic `why_it_works` scores < 70; good ones score > 80 |
| Node 8 (Response Formatter) built | Engineering | Produces correct final response structure |
| Node 9 (Telemetry) built | Engineering | gift_sessions updates correctly; PostHog events fire (mock) |
| Complete LangGraph graph wired | Engineering | Full 9-node graph runs end-to-end |
| Vercel API: POST /api/recommend/start | Engineering | Returns stream_id within 500ms |
| Vercel API: GET /api/recommend/stream | Engineering | SSE stream fires all event types correctly |
| Vercel API: POST /api/recommend/select | Engineering | Updates gift_sessions, queues embedding job |
| Authentication on Vercel routes | Engineering | Invalid JWT returns 401; valid JWT proceeds |
| Rate limiting on Vercel routes | Engineering | 11th request in an hour returns 429 |

### Day-by-Day

**Day 1: Node 6**
- Build budget enforcer
- All 10 unit tests
- Wire retry loop in LangGraph

**Day 2: Node 7**
- Build personalization validator
- Test 5 generic strings (should score < 70)
- Test 5 personalized strings (should score > 80)
- Test rewrite quality

**Day 3: Nodes 8-9**
- Build response formatter
- Build telemetry node
- Wire nodes 8-9 into graph

**Day 4-5: Full Graph**
- Complete LangGraph graph with all 9 nodes
- Run full pipeline on 10 integration test fixtures
- Fix any issues

**Day 6-7: Vercel API Routes**
- Build POST /api/recommend/start
- Build GET /api/recommend/stream (SSE)
- Build POST /api/recommend/select
- Auth validation
- Rate limiting

**Day 8-9: End-to-End Test**
- Complete flow: start → stream → recommendations → select
- Test from a real browser (curl and browser EventSource)
- Fix SSE connection issues (CORS, keep-alive, buffering)

**Day 10: Review + Polish**
- Code review
- Fix any issues
- Document any deferred tasks

### End-of-Week 3 Milestone

Full end-to-end flow works from browser to Vercel to LangGraph to Supabase and back. One complete recommendation session demonstrable.

### Go/No-Go for Week 4

Full pipeline completes in < 15s on 5 out of 5 manual test runs.

---

## Week 4: Frontend Integration + 10% Rollout

**Goal:** v2 hook built and deployed. 10% of real users get v2.

### Deliverables

| Task | Owner | Done When |
|------|-------|-----------|
| `useGiftSessionV2.ts` hook built | Engineering | Handles all 7 states (generating, searching, complete, errors) |
| SSE progress UI component | Engineering | Users see node progress during generation |
| PostHog feature flag configured | Engineering | Flag "use-langgraph-v2" exists in PostHog |
| Feature flag integration | Engineering | `posthog.isFeatureEnabled('use-langgraph-v2')` switches hooks |
| Vercel deployed to production | Engineering | `/api/recommend/start` returns 200 in production |
| 10% rollout enabled | Engineering | PostHog flag set to 10% |
| Monitoring dashboard | Engineering | PostHog dashboard showing v1 vs v2 error rate and latency |

### Day-by-Day

**Day 1-3: `useGiftSessionV2.ts`**
- Port `useGiftSession.ts` to use Vercel API + EventSource
- Add `nodeProgress` state
- Add `statusMessage` state
- Keep all other state identical
- Test in development against Vercel dev server

**Day 4: Progress UI**
- Add a progress indicator component showing which node is active
- Wire to `nodeProgress` state
- Design: subtle, not intrusive — a loading bar with a text message is enough

**Day 5: Feature Flag**
- Create PostHog feature flag "use-langgraph-v2"
- Add `useFeatureFlag('use-langgraph-v2')` to gift flow
- Test: flag off → uses v1 hook; flag on → uses v2 hook

**Day 6-7: Deploy + Monitor**
- Deploy Vercel API to production
- Set PostHog flag to 10%
- Monitor for 24 hours:
  - Error rate in Vercel logs
  - P95 latency in PostHog
  - No session failures in gift_sessions

**Day 8-10: Observation + Fixes**
- Fix any issues discovered in 10% rollout
- Do not increase rollout until all P0 bugs are fixed

### Go/No-Go for Week 5

10% rollout running for ≥ 48 hours with:
- Error rate < 2%
- P95 latency < 15s (slightly relaxed during early rollout)
- No reports of cultural violations or budget overshots from real users

---

## Week 5: A/B Testing + Gate Check

**Goal:** Validate v2 quality against primary metrics. Make go/no-go decision for 100% rollout.

### Day 1: Increase Rollout to 50%

```
PostHog: "use-langgraph-v2" → 50% rollout
```

### Day 2-3: Data Collection

Collect at least 200 v2 sessions before evaluation.

**Automated metrics from PostHog:**
- Personalization rate (avg personalization_score across sessions)
- Budget compliance (% sessions where budget_enforcer_filtered any rec)
- P95 latency
- Regeneration rate
- Error rate

**Human review of 50 v2 sessions:**
- Randomly sample 50 completed v2 sessions
- Rate each on the 4-dimension rubric (personalization, cultural fit, budget compliance, overall quality)
- Compare against 50 randomly sampled v1 sessions (same rubric)

### Day 4: Gate Check

Complete the metrics table:

| Metric | v1 Baseline | v2 Target | v2 Actual | Pass? |
|--------|------------|-----------|-----------|-------|
| Personalization Rate | TBD | ≥ 90% | TBD | |
| Budget Compliance | ~70% | 100% | TBD | |
| Cultural Appropriateness | TBD | ≥ 90% | TBD | |
| P95 Latency | TBD | < 12s | TBD | |
| Session error rate | < 2% | < 2% | TBD | |
| Avg personalization score | N/A | ≥ 75 | TBD | |
| Human quality rating (overall) | TBD | ≥ 7.0/10 | TBD | |

**Decision tree:**
- All metrics pass AND no P0 bugs → Proceed to Week 6 (100% rollout)
- 1–2 secondary metrics miss, no P0 bugs → Extended testing for 48h, fix, recheck
- Any primary metric fails → Hold at 50%, root cause analysis, fix, re-run gate check
- P0 bug (data loss, wrong user data, credit deduction error) → Roll back to 0%, fix, restart Week 4

### Day 5: Prepare for Full Rollout

- Document post-mortem of any issues found
- Update runbooks
- Brief customer support on what's changing
- Prepare v1 deprecation checklist

---

## Week 6: 100% Rollout + v1 Deprecation

### Day 1: Full Rollout

```
PostHog: "use-langgraph-v2" → 100% rollout
```

Monitor intensively for first 24 hours.

### Day 2-3: Observation Period

Watch all metrics continuously. No code changes unless a critical bug is found.

**Alert thresholds (trigger immediate investigation):**
- Error rate > 3% in any 1-hour window
- P95 latency > 20s in any 1-hour window
- Budget compliance < 99% in any 10-session window
- Any cultural violation reported by a user

**Escalation path:**
1. Immediate rollback to 50% while investigating
2. Fix in staging, test in 10% rollout for 1 hour
3. Return to 100% if stable

### Day 4: v1 Deprecation

```typescript
// supabase/functions/generate-gifts/index.ts — add header:

/**
 * @deprecated v1.0 — Use /api/recommend/start (Vercel LangGraph) instead.
 * This function is kept for emergency rollback only.
 * Scheduled for removal: [current date + 30 days]
 */
```

Remove the PostHog feature flag (no longer needed — `VITE_USE_LANGGRAPH=true` is now the default):

```
PostHog: delete "use-langgraph-v2" flag
```

```bash
# Set permanent env var
vercel env add VITE_USE_LANGGRAPH true production
```

### Day 5 and Beyond: Post-Launch

**Immediate (Week 6 - Week 7):**
- Backfill `recipient_embeddings` for all existing recipients
- Backfill `gift_embeddings` for all historical selected gifts
- Begin growing `cultural_rules` to 100+ entries

**Within 30 days:**
- Remove `generate-gifts` Edge Function (after confirming zero traffic and no issues)
- Update documentation

**Within 60 days:**
- Review golden set evaluation (run full 100-case set manually)
- Adjust personalization scoring rubric if avg scores diverge from human ratings
- Plan next iteration: Signal Check v2, or recipient profile enrichment from web

---

## Rollback Procedures by Severity

### Severity 1 (P0): Data loss, wrong user data, credit fraud

```
Immediate: PostHog flag → 0%
          (v1 resumes for all users instantly)
Alert engineering team immediately
Investigate Supabase audit logs
File incident report
Return to v2 only after root cause is fixed and verified in staging
```

### Severity 2: Error rate > 5%, latency > 20s, budget compliance < 95%

```
PostHog flag → 50% (buy time to investigate)
Root cause analysis within 4 hours
Fix and deploy to staging
Bump to 100% after 2 hours of stable staging
```

### Severity 3: Metrics don't hit targets but no errors

```
Stay at current rollout %
Schedule fix for next day
Increase rollout only after metric improves
```

---

## Communication Plan

| Week | Who | What |
|------|-----|------|
| Week 1 | Engineering | Database migration complete — heads up on Supabase |
| Week 4 | Engineering + PMs | 10% rollout started — what to watch |
| Week 5 | Engineering + PMs + Founders | Gate check results |
| Week 6 | All | Launch announcement (internal) |
| Week 6+30 days | All | v1 cleanup complete |
