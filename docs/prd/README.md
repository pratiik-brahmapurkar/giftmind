# GiftMind Gift Recommendation Engine v2 — PRD

> **Version:** 1.0  
> **Status:** Draft  
> **Owner:** Pratik Brahmapurkar  
> **Target Launch:** 6 weeks from kickoff  
> **Last Updated:** 2026-04-18

---

## What This Is

This PRD defines the complete technical and product specification for GiftMind's Gift Recommendation Engine v2 — a multi-agent LangGraph pipeline that replaces the current single-call LLM architecture with a nine-node system backed by pgvector memory, deterministic budget enforcement, and systematic cultural intelligence.

The v2 engine is an **additive deployment** — it runs alongside v1 (the existing Supabase Edge Function `generate-gifts`) and is promoted to 100% traffic over 6 weeks via a PostHog feature flag.

---

## Documents in This PRD

### Foundation

| Document | Contents |
|----------|---------|
| [00-codebase-audit.md](./00-codebase-audit.md) | Inventory of all existing Edge Functions, full database schema, LLM routing logic, identified gaps |
| [01-executive-summary.md](./01-executive-summary.md) | One-page summary: what v2 is, why now, key principles, success definition |
| [02-problem-statement.md](./02-problem-statement.md) | Six specific problems with v1: generic output, cultural mismatches, budget overshoot, no memory, monolithic prompt, no streaming |
| [03-success-metrics.md](./03-success-metrics.md) | Primary metrics (gate conditions), secondary metrics, counter-metrics, measurement infrastructure |

### Architecture

| Document | Contents |
|----------|---------|
| [04-system-architecture.md](./04-system-architecture.md) | Full system diagram, component responsibilities, data flow, Vercel vs Supabase rationale |
| [05-agent-design-langgraph.md](./05-agent-design-langgraph.md) | All 9 nodes: inputs, processing, outputs, fallbacks, latency budgets, parallel execution design, SSE event timeline |
| [06-vector-memory-design.md](./06-vector-memory-design.md) | pgvector setup, 3 new tables, retrieval functions, embedding generation, seed data, backfill strategy |
| [07-cultural-intelligence.md](./07-cultural-intelligence.md) | Cultural rule taxonomy, complete initial rule set (~30 rules), retrieval flow, measurement, rule management process |
| [08-budget-enforcement.md](./08-budget-enforcement.md) | Node 6 implementation, retry logic, pure function code, edge cases, unit test suite, monitoring |
| [09-personalization-engine.md](./09-personalization-engine.md) | Node 7 implementation, scoring rubric, rewrite logic, failure patterns and fixes, cost impact |

### Implementation

| Document | Contents |
|----------|---------|
| [10-api-contracts.md](./10-api-contracts.md) | All Vercel API endpoints with full request/response specs, SSE event types, error codes, frontend integration hook |
| [11-database-schema-changes.md](./11-database-schema-changes.md) | Complete executable SQL: 3 new tables, 5 new columns, 3 new functions, IVFFlat indexes, RLS policies, migration order |
| [12-migration-plan.md](./12-migration-plan.md) | 6-week parallel-run strategy, rollback procedure, feature flag config, backward compatibility matrix |
| [13-cost-analysis.md](./13-cost-analysis.md) | Per-node LLM costs, total cost per session by plan, monthly projections at 3 scales, v1 vs v2 cost comparison, guardrails |

### Quality & Delivery

| Document | Contents |
|----------|---------|
| [14-testing-strategy.md](./14-testing-strategy.md) | 100-case golden set (with all test cases listed), unit/node/integration test specs, human evaluation rubric, CI config |
| [15-rollout-plan.md](./15-rollout-plan.md) | Week-by-week plan with concrete deliverables, go/no-go criteria, communication plan, rollback procedures by severity |
| [16-risks-and-mitigations.md](./16-risks-and-mitigations.md) | 16 identified risks with likelihood/impact ratings and specific mitigations |

---

## Quick Links

| Audience | Start Here |
|---------|-----------|
| **Engineers building this** | [05-agent-design-langgraph.md](./05-agent-design-langgraph.md) → [11-database-schema-changes.md](./11-database-schema-changes.md) → [10-api-contracts.md](./10-api-contracts.md) |
| **Product managers / founders** | [01-executive-summary.md](./01-executive-summary.md) → [02-problem-statement.md](./02-problem-statement.md) → [03-success-metrics.md](./03-success-metrics.md) |
| **Engineering leads reviewing scope** | [04-system-architecture.md](./04-system-architecture.md) → [12-migration-plan.md](./12-migration-plan.md) → [16-risks-and-mitigations.md](./16-risks-and-mitigations.md) |
| **QA / testing** | [14-testing-strategy.md](./14-testing-strategy.md) → [03-success-metrics.md](./03-success-metrics.md) |
| **Finance / investors** | [03-success-metrics.md](./03-success-metrics.md) → [13-cost-analysis.md](./13-cost-analysis.md) |
| **New team members** | [00-codebase-audit.md](./00-codebase-audit.md) → [01-executive-summary.md](./01-executive-summary.md) |

---

## Architecture Summary (TL;DR)

```
User clicks "Find a Gift"
        ↓
React frontend (useGiftSessionV2 hook)
        ↓
Vercel API: POST /api/recommend/start
        ↓
LangGraph pipeline (9 nodes):
  [1] Recipient Analyzer (Claude Haiku)
  [2+3+4] Cultural Retriever + Occasion Interpreter + Past Gifts (parallel)
  [5] Gift Generator (Groq/Gemini/Claude by plan)
  [6] Budget Enforcer (pure code — 100% compliance)
  [7] Personalization Validator (Claude Haiku — scores + rewrites)
  [8] Response Formatter
  [9] Telemetry → PostHog + Supabase
        ↓
SSE stream → frontend renders recommendations
```

**What's new:** pgvector memory (past gifts + cultural rules), deterministic budget filter, personalization scoring, SSE streaming, Vercel serverless runtime.

**What's unchanged:** Auth, credits, product search, signal check, all existing tables/RLS.

---

## The 5 Problems v2 Solves

| Problem | v1 State | v2 Fix |
|---------|---------|--------|
| Generic recommendations | ~40% of outputs lack specific recipient references | Node 7 validates personalization score ≥ 70; rewrites or rejects below threshold |
| Cultural mismatches | 1 prompt line for all cultural intelligence | pgvector retrieval of 30+ explicit rules; hard constraints injected as system blocks |
| Budget overshoot | ~30% of sessions have ≥1 out-of-budget recommendation | Node 6: pure code filter, retry loop, 100% compliance guarantee |
| No memory | Past gifts stored but never read | Node 4: semantic past-gift retrieval prevents conceptual repeats |
| Monolithic prompt | 1 LLM call does everything | 9 focused nodes, each independently testable and retryable |

---

## Key Numbers

| Metric | Target |
|--------|--------|
| Personalization Rate | ≥ 90% |
| Budget Compliance | 100% |
| Cultural Appropriateness | ≥ 90% |
| P95 E2E Latency | < 12 seconds |
| Cost per session (Thoughtful plan) | ~$0.0022 |
| Cost per session (Gifting Pro plan) | ~$0.021 |
| Rollout timeline | 6 weeks |
| Cultural rules at launch | ~30 |
| Cultural rules target (Year 1) | 300+ |

---

## Open Questions (Requiring Decisions)

These questions were identified during the codebase audit and PRD authoring. They require your input before implementation begins.

### Q1 — Vercel Deployment Model
**Question:** Is GiftMind's frontend already deployed on Vercel? If not, is Vercel the right choice for the LangGraph API routes?

**Context:** The LangGraph agent runs in Vercel Serverless Functions (Node.js). If the frontend is on Netlify/Cloudflare, we can still add Vercel for the API tier only — but it adds complexity. If already on Vercel, this is seamless.

**Impact:** Architecture. Affects Weeks 1 and 3.

---

### Q2 — Embedding Model Choice
**Question:** OpenAI (`text-embedding-3-small`) or Gemini (`embedding-001`) for vector embeddings?

**Context:** Both work. OpenAI is more standard ($0.02/1M tokens). Gemini is free up to 1,500 req/day. **You cannot mix models in the same table** — once chosen, changing requires re-embedding everything.

**Recommendation:** Start with Gemini (free). If you hit the 1,500 req/day limit, switch to OpenAI. Note: this requires changing all `vector(1536)` in the schema to `vector(768)` for Gemini's 768-dimension output.

**Impact:** Schema. Affects migrations in Week 1.

---

### Q3 — LangGraph Language: TypeScript or Python?
**Question:** Should the LangGraph agent be written in TypeScript (Node.js on Vercel) or Python (FastAPI on Railway/Fly.io)?

**Context:** TypeScript LangGraph (`@langchain/langgraph`) shares types with the frontend and runs natively on Vercel. Python LangGraph is more mature and has better documentation. Adding Python adds a third deployment platform.

**Recommendation:** TypeScript on Vercel — fewer moving parts.

**Impact:** Week 1 setup and all of Week 2-3 implementation.

---

### Q4 — Feedback UI
**Question:** The `feedback_rating` and new `feedback_cultural_fit` columns exist on `gift_sessions`, but there is no feedback collection UI in the current codebase. Do you want to build this as part of v2, or measure cultural appropriateness via sampling only?

**Context:** Without a feedback UI, the "Cultural Appropriateness ≥ 90%" metric cannot be measured automatically. It would need manual sampling (reviewing 50 sessions/week).

**Recommendation:** Build a minimal 2-question feedback form (budget compliance: 1-5 stars, cultural fit: 1-5 stars) that appears after gift selection. This is a small frontend change (~1 day) with high measurement value.

**Impact:** Metrics. Affects `03-success-metrics.md` gate conditions.

---

### Q5 — Supabase Plan Confirmation
**Question:** Is GiftMind on Supabase Pro plan? pgvector requires Pro (it is not available on the Free tier).

**Context:** The codebase uses `SUPABASE_SERVICE_ROLE_KEY` which implies Pro, but not definitively.

**Impact:** Blocking for Week 1. Cannot proceed with migrations until confirmed.

---

### Q6 — Signal Check v2
**Question:** The PRD leaves `signal-check` unchanged from v1. Should Signal Check also be migrated to use the v2 recipient analysis (Node 1 output) for better context?

**Context:** Signal Check currently does a standalone LLM call without the enriched recipient context from Node 1. It could benefit from passing `recipientAnalysis` to the signal check prompt.

**Recommendation:** Out of scope for v2, but document as v2.1 enhancement.

**Impact:** Scope. Affects Week 2-3 if in scope.

---

### Q7 — `geoConfig.ts` Replacement
**Question:** The audit notes that `src/lib/geoConfig.ts` does not exist. Was it planned, removed, or is the geo logic fully handled by `search-products`?

**Context:** The v2 Cultural Context Retriever (Node 2) uses `recipientCountry` to build queries. If there's a more sophisticated geo config planned, it should inform Node 2's query construction.

**Impact:** Minor. Affects Node 2 implementation in Week 2.

---

## Decisions Made in This PRD (Validate These)

These decisions were made by the PRD author during research. Please confirm or override:

1. **Vercel for LangGraph** — not Supabase Edge Functions or AWS Lambda. Rationale: shared deployment with frontend, Node.js runtime, native SSE support.

2. **9 nodes, not more/fewer** — Nodes 2, 3, 4 could theoretically be merged into one "context enrichment" node. Kept separate for testability and independent retry.

3. **Maximum 2 budget retries** — After 2 retries, return partial results with a user-facing note rather than failing the session entirely. Tradeoff: user gets 1-2 recommendations instead of an error.

4. **Personalization threshold of 70/100** — Chosen to be achievable for competent personalization without being so strict it triggers excessive rewrites. Adjust if calibration shows it's wrong.

5. **Cultural rules as vector embeddings** — Alternative was storing rules as structured tags only (no embeddings, pure tag matching). Chosen approach: both vector similarity AND tag matching (OR query) for best coverage.

6. **IVFFlat over HNSW for initial deployment** — IVFFlat is simpler to set up and appropriate for the expected table size at launch. Switch to HNSW when tables exceed 500K rows.

7. **All 4 LLM nodes use Claude Haiku for nodes 1, 3, 7** regardless of plan — these are enrichment/validation calls, not the main generation call. Using the cheapest capable model here maximizes quality/cost.

8. **Embedding backfill is background, not blocking** — Historical sessions get embeddings via a background script run post-deployment, not during the migration window. v2 improves over time; sessions before launch have fewer past gifts available.
