# 12 — Migration Plan

---

## Migration Strategy: Parallel Run

v1 and v2 run simultaneously. v2 is never in-place replacement — it's an additive deployment. v1 (`generate-gifts` Edge Function) stays live and fully functional throughout the migration. The switch is controlled by a feature flag, not a deployment toggle.

**Key constraint:** A session is either v1 or v2 — never mixed. The `engine_version` column on `gift_sessions` tracks which engine generated it.

---

## Phase Overview

```
Week 1: Foundation (database + tooling)
Week 2: Agent Nodes 1–5
Week 3: Agent Nodes 6–9 + Vercel API
Week 4: Integration + 10% traffic rollout
Week 5: A/B testing + gate check
Week 6: 100% rollout + v1 deprecation
```

---

## Week 1: Foundation

### Day 1-2: Database Migrations

Apply migrations in order (see [11-database-schema-changes.md](./11-database-schema-changes.md)):
```bash
supabase db push  # Apply all pending migrations
```

Verify:
```sql
-- Check pgvector is available
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('recipient_embeddings', 'gift_embeddings', 'cultural_rules');

-- Check new gift_sessions columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'gift_sessions'
AND column_name IN ('personalization_scores', 'node_timings', 'engine_version');
```

### Day 2: Seed Cultural Rules

```bash
# Apply seed SQL
psql $DATABASE_URL -f supabase/migrations/20260501000600_seed_cultural_rules.sql

# Generate embeddings for all seeded rules
npx ts-node scripts/embed-cultural-rules.ts
```

Verify:
```sql
SELECT rule_type, COUNT(*) FROM cultural_rules GROUP BY rule_type;
-- Expected: hard_constraint: ~15, soft_preference: ~10, regional_note: ~8

SELECT COUNT(*) FROM cultural_rules WHERE embedding IS NOT NULL;
-- Expected: same as total (all embedded)
```

### Day 3-4: Vercel Project Setup

```bash
# Initialize Vercel project in the repo
npx vercel init

# Set environment variables
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add GOOGLE_AI_API_KEY production
vercel env add GROQ_API_KEY production
vercel env add OPENAI_API_KEY production  # For embeddings

# Install LangGraph dependencies
npm install @langchain/langgraph @langchain/anthropic @langchain/google-genai openai
```

### Day 5: LangGraph Scaffold

Create the package structure:
```
packages/
  langgraph-agent/
    src/
      state.ts           -- RecommendationState interface
      graph.ts           -- LangGraph graph definition
      nodes/
        01-recipient-analyzer.ts
        02-cultural-retriever.ts
        03-occasion-interpreter.ts
        04-past-gift-retriever.ts
        05-gift-generator.ts
        06-budget-enforcer.ts
        07-personalization-validator.ts
        08-response-formatter.ts
        09-telemetry.ts
      utils/
        embeddings.ts    -- generateEmbedding() function
        ai-providers.ts  -- Port of _shared/ai-providers.ts to Node.js
    __tests__/
      budget-enforcer.test.ts
      personalization-validator.test.ts
      integration.test.ts
api/
  recommend/
    start.ts            -- POST /api/recommend/start
    stream.ts           -- GET /api/recommend/stream
    select.ts           -- POST /api/recommend/select
    status.ts           -- GET /api/recommend/status (polling fallback)
```

---

## Week 2: Agent Nodes 1–5

**Goal:** All five "data gathering + generation" nodes pass unit tests.

### Node 1: Recipient Analyzer
```
Build → Test with 5 sample recipients → Verify output matches RecipientAnalysis schema
```

### Node 2: Cultural Context Retriever
```
Build → Test queries against seeded cultural_rules table
→ Verify Jain query returns leather prohibition
→ Verify Diwali query returns sweets preference
→ Verify Western professional query returns workplace boundary rule
```

### Node 3: Occasion Interpreter
```
Build → Test with 10 occasions (birthday, diwali, eid, anniversary, graduation, etc.)
→ Verify each returns valid OccasionContext schema
→ Verify occasion-specific norms are accurate
```

### Node 4: Past Gift Retriever
```
Build → Test with empty gift_embeddings (fallback to text search)
→ Test with seeded gift_embeddings
→ Verify similarity scores are reasonable (same gift = 1.0, different category = < 0.5)
```

### Node 5: Gift Generator
```
Build → Wire to existing getProviderChain() (ported to Node.js)
→ Test with full context (nodes 1-4 outputs populated)
→ Verify generates 5-6 candidates with correct schema
→ Verify hard cultural constraints are respected
```

**End of Week 2 milestone:** Run `integration.test.ts` with nodes 1–5 wired together on 10 test cases. All must produce valid output.

---

## Week 3: Nodes 6–9 + Vercel API

### Node 6: Budget Enforcer
```
Build → Unit tests (10 test cases from golden set)
→ Test retry loop: node 5 → node 6 (fail) → node 5 (retry) → node 6 (pass)
→ Test exhausted retries: returns partial results
```

### Node 7: Personalization Validator
```
Build → Test with 10 known-generic why_it_works strings (should score < 70)
→ Test with 5 known-personalized strings (should score > 80)
→ Verify rewrite quality is acceptable
```

### Node 8: Response Formatter
```
Build → Test assembles correct final structure
→ Test top-3 selection by personalization_score
→ Test cultural_note generation
```

### Node 9: Telemetry
```
Build → Test PostHog event fires (with mock)
→ Test gift_sessions update succeeds
→ Test does not block response delivery
```

### Vercel API Routes
```
Build POST /api/recommend/start
→ Test auth validation
→ Test session existence check
→ Test LangGraph pipeline invocation

Build GET /api/recommend/stream
→ Test SSE connection established
→ Test node_start/node_complete events fire
→ Test recommendations event fires with correct payload
→ Test done event closes stream

Build POST /api/recommend/select
→ Test gift_sessions update
→ Test embedding generation queued
```

**End of Week 3 milestone:** Full end-to-end test: POST start → SSE stream → receive recommendations → POST select. One complete cycle working.

---

## Week 4: Integration + Feature Flag Rollout

### Day 1-2: Frontend Integration

Port `useGiftSession.ts` to `useGiftSessionV2.ts`:
- Replace `functions.invoke('generate-gifts', ...)` with Vercel fetch + EventSource
- Add `nodeProgress` state
- Add `statusMessage` state  
- Keep everything else identical (session creation, credit deduction, product search, gift selection)

### Day 3: Feature Flag Setup

```typescript
// In PostHog dashboard: create feature flag "use-langgraph-v2"
// Initial rollout: 0% (off for everyone)
// Rollout groups: 10% of authenticated users

// In App.tsx or gift flow component:
const useLangGraph = posthog.isFeatureEnabled('use-langgraph-v2')
```

### Day 4: Deploy to Production

```bash
# Deploy Vercel API routes
vercel deploy --prod

# Apply remaining database migrations
supabase db push --linked

# Set VITE_USE_LANGGRAPH in Vercel env (leave as 'false' — PostHog flag controls routing)
```

### Day 5: Enable 10% Rollout

```
PostHog dashboard: set "use-langgraph-v2" flag to 10% rollout
```

Monitor for 24 hours:
- Error rate < 2%
- P95 latency < 15s (allow slightly above target for initial burst)
- No SSE connection failures in Vercel logs

---

## Week 5: A/B Testing + Gate Check

### Day 1-3: Data Collection

With 10% of traffic on v2 for ~72 hours:
- Collect ~300 v2 sessions (assuming ~1,000 sessions/day across all users at this scale)
- Human review of 50 randomly sampled v2 recommendations against 50 v1 recommendations
- Personalization score distribution comparison
- Budget compliance check (should be 100% for v2, ~70% for v1)
- Latency comparison (PostHog: filter by `engine_version`)

Increase v2 rollout to 50% on Day 3 if no issues found.

### Day 4: Gate Check Against Primary Metrics

| Metric | v2 Target | v2 Actual | Pass? |
|--------|-----------|-----------|-------|
| Personalization Rate ≥ 90% | ≥ 90% | TBD | |
| Budget Compliance 100% | 100% | TBD | |
| Cultural Appropriateness ≥ 90% | ≥ 90% | TBD | |
| P95 Latency < 12s | < 12s | TBD | |
| Session error rate < 2% | < 2% | TBD | |

**Gate decision:**
- All metrics pass → proceed to 100% rollout in Week 6
- Any metric fails → investigate, fix, and re-test for 48 hours before re-checking gate

### Day 5: Preparation for Full Rollout

- Write runbook for v1 deprecation
- Prepare rollback procedure
- Brief customer support team on new features (streaming progress, cultural notes)

---

## Week 6: 100% Rollout + v1 Deprecation

### Day 1: Full Rollout

```
PostHog dashboard: set "use-langgraph-v2" flag to 100% rollout
```

Monitor continuously for 24 hours.

### Day 2-3: Observation Period

No code changes. Watch:
- Error rate dashboard
- Latency dashboard
- Cost dashboard (AI spend per session)
- User feedback ratings (PostHog events)

### Day 4: v1 Deprecation Steps

1. Add deprecation comment to `generate-gifts/index.ts`:
   ```typescript
   // DEPRECATED as of [date]. Use /api/recommend/start (Vercel) instead.
   // Keep this file for emergency rollback. Remove after 30-day observation period.
   ```

2. Set `VITE_USE_LANGGRAPH=true` permanently in `.env.production` (PostHog flag no longer needed as primary control)

3. Update monitoring dashboards to filter exclusively on `engine_version = 'v2'`

4. Schedule v1 removal for 30 days after this date

### Day 5+: Post-Launch Tasks

- Backfill `recipient_embeddings` for all existing recipients (background script)
- Backfill `gift_embeddings` for all historical selected gifts (background script)
- Begin growing `cultural_rules` seed to 100+ entries

---

## Rollback Procedure

If v2 shows critical failures at any point:

### Immediate Rollback (< 5 minutes)

```
PostHog dashboard: set "use-langgraph-v2" flag to 0% rollout
```

This instantly routes all traffic back to v1 (`generate-gifts` Edge Function). No deployment needed. No code change needed. Vercel API routes remain deployed but receive no traffic.

### After Rollback

1. Capture the error state (Vercel logs, PostHog events, Supabase error rates)
2. Investigate root cause
3. Fix in a branch
4. Re-test on 5% traffic before re-attempting rollout
5. Report back to team with post-mortem

### What Can't Be Rolled Back

- pgvector extension installation (non-destructive — does not affect v1)
- New tables (`recipient_embeddings`, `gift_embeddings`, `cultural_rules`) (non-destructive — empty tables)
- New columns on `gift_sessions` (non-destructive — default values, v1 ignores them)

All database changes are forward-compatible and additive. v1 continues to work exactly as before even after all migrations are applied.

---

## Feature Flag Configuration

```typescript
// PostHog flag: "use-langgraph-v2"
// Type: Boolean
// Rollout:
//   Week 1: 0% (not deployed yet)
//   Week 4: 10%
//   Week 5: 50%
//   Week 6: 100%
//   After stabilization: flag removed, VITE_USE_LANGGRAPH=true hard-coded

// Frontend usage:
const FEATURE_FLAG = 'use-langgraph-v2'

function useWhichGiftHook() {
  const useLangGraph = useFeatureFlag(FEATURE_FLAG)
  return useLangGraph ? useGiftSessionV2 : useGiftSession
}
```

---

## Backward Compatibility Matrix

| Component | v1 Behavior | v2 Behavior | Compatible? |
|----------|-------------|-------------|-------------|
| `gift_sessions` table | Written by Edge Function | Written by Vercel + Node 9 | Yes — same schema |
| `recipients` table | Read by Edge Function | Read by Vercel (Node 1, 4) | Yes — no changes |
| `product_clicks` table | Written by frontend | Unchanged | Yes |
| `signal_checks` | Calls `signal-check` Edge Function | Unchanged | Yes |
| Credit deduction | `deduct-credit` Edge Function | Unchanged (called before pipeline) | Yes |
| Product search | `search-products` Edge Function | Unchanged | Yes |
| Gift selection | Frontend → `selectGift()` → Supabase | Frontend → `/api/recommend/select` → Supabase | Yes |
| PostHog events | Existing events unchanged | New v2 events added (different names) | Yes |
