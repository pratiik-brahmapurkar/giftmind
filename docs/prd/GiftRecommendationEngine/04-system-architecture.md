# 04 — System Architecture

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│              React Frontend (Vite + TypeScript)                  │
│   useGiftSessionV2 hook → SSE stream reader → UI state          │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS (SSE for streaming)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              Vercel Serverless API Routes                        │
│   POST /api/recommend/start    — Invokes LangGraph, returns      │
│                                  stream ID                       │
│   GET  /api/recommend/stream   — SSE endpoint, streams events    │
│   POST /api/recommend/select   — Records gift selection          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
         ┌─────────────────┼───────────────────┐
         ▼                 ▼                   ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  LangGraph   │  │  Supabase        │  │  AI Providers        │
│  Orchestrator│◄►│  Postgres        │  │  Claude / Gemini /   │
│  (9 nodes)   │  │  + pgvector      │  │  Groq (by plan)      │
└──────┬───────┘  └──────────────────┘  └──────────────────────┘
       │
       ├──► Node 1: Recipient Analyzer     [Claude Haiku]
       ├──► Node 2: Cultural Context Retriever [pgvector query]
       ├──► Node 3: Occasion Interpreter   [Claude Haiku]
       ├──► Node 4: Past Gift Retriever    [pgvector + SQL]
       ├──► Node 5: Gift Generator         [tiered by plan]
       ├──► Node 6: Budget Enforcer        [deterministic code]
       ├──► Node 7: Personalization Validator [Claude Haiku]
       ├──► Node 8: Response Formatter     [deterministic code]
       └──► Node 9: Telemetry              [PostHog]

┌──────────────────────────────────────────────────────────────────┐
│  Supabase (existing — unchanged)                                 │
│  ├── Auth (JWT + Google OAuth)                                   │
│  ├── gift_sessions table  (v1 + v2 both write here)             │
│  ├── recipients table                                            │
│  ├── recipient_embeddings table (NEW)                            │
│  ├── gift_embeddings table (NEW)                                 │
│  ├── cultural_rules table (NEW)                                  │
│  └── All existing tables unchanged                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### 1. React Frontend

**What changes in v2:**
- `useGiftSession.ts` gets a companion hook `useGiftSessionV2.ts`
- v2 hook uses `EventSource` (SSE) instead of `functions.invoke()`
- Feature flag: `VITE_USE_LANGGRAPH=true` switches the hook
- Node progress events update a new `nodeProgress` state (drives the progress UI)
- Everything else (session creation, credit deduction, product search, gift selection) remains unchanged

**What stays the same:**
- All React components
- Gift flow steps (Step 1: Recipient, Step 2: Occasion, Step 3: Budget, Step 4: Context, Step 5: Results)
- Credit deduction (still calls `deduct-credit` Edge Function before the AI call)
- Product search (still calls `search-products` Edge Function after AI recommendations)
- Gift selection + referral award (still calls `selectGift` + `award-referral-credits`)

### 2. Vercel API Routes

**Why Vercel instead of Supabase Edge Functions for LangGraph:**
- Supabase Edge Functions run on Deno with a 60-second timeout. LangGraph needs Node.js (or Python) runtime.
- LangGraph's TypeScript/JavaScript SDK (`@langchain/langgraph`) requires Node.js.
- Vercel supports native SSE with `Response` + `ReadableStream`.
- Vercel functions have a 5-minute timeout on Pro plan — sufficient for the 9-node pipeline.

**Endpoints:**

```
POST /api/recommend/start
  Body: { session_id, recipient_id, occasion, budget_min, budget_max, ... }
  Auth: Bearer token (same Supabase JWT)
  Response: { stream_id: "uuid", status: "started" }
  — Validates auth, fetches recipient + user data, enqueues LangGraph run
  — Immediately returns stream_id (non-blocking)

GET /api/recommend/stream?session_id={uuid}
  Auth: Bearer token
  Response: SSE stream
  Events:
    event: node_start    data: {"node": "recipient_analyzer", "timestamp": 1234567890}
    event: node_complete data: {"node": "recipient_analyzer", "duration_ms": 1420}
    event: status        data: {"message": "Analyzing recipient profile..."}
    event: recommendations data: {"recommendations": [...], "occasion_insight": "..."}
    event: done          data: {"session_id": "uuid", "total_duration_ms": 8750}
    event: error         data: {"code": "BUDGET_FILTER_EXHAUSTED", "message": "..."}

POST /api/recommend/select
  Body: { session_id, gift_index, gift_name }
  — Records selection, updates gift_sessions, triggers embedding generation
  — Returns: { success: true, embedding_queued: true }
```

**Authentication on Vercel routes:**
```typescript
// Every route validates the Supabase JWT
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function validateToken(authHeader: string) {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new UnauthorizedError()
  return user
}
```

### 3. LangGraph Orchestrator

**Runtime:** TypeScript on Node.js 20 (Vercel Runtime)
**SDK:** `@langchain/langgraph` + `@langchain/anthropic` + `@langchain/google-genai` + custom Groq client

**Why LangGraph:**
- Provides the `StateGraph` abstraction — nodes declare input/output shape, the graph manages state passing.
- Built-in conditional edges (Budget Enforcer can loop back to Gift Generator).
- Observable: every node's execution is traced.
- Supports parallel node execution (Nodes 2, 3, 4 run in parallel after Node 1).
- Native support for both TypeScript and Python.

**Graph topology:**
```
START
  │
  ▼
Node 1: Recipient Analyzer
  │
  ├──► Node 2: Cultural Context Retriever ◄──┐
  ├──► Node 3: Occasion Interpreter          │ (parallel)
  └──► Node 4: Past Gift Retriever           │
              │
              ▼ (join — all 3 complete)
          Node 5: Gift Generator
              │
              ▼
          Node 6: Budget Enforcer
              │
    ┌─────────┴──────────┐
    │ < 3 recs remaining │  loop back to Node 5 (max 2 retries)
    │                    │
    ▼                    ▼ (>= 3 recs)
  retry             Node 7: Personalization Validator
                        │
                        ▼
                    Node 8: Response Formatter
                        │
                        ▼
                    Node 9: Telemetry
                        │
                        ▼
                      END
```

### 4. Supabase Postgres + pgvector

**What stays the same:**
- All existing tables, RLS policies, and functions
- Auth, JWT, Row Level Security

**What's new:**
- `pgvector` extension enabled
- `recipient_embeddings` table — one row per recipient, updated on profile change
- `gift_embeddings` table — one row per selected gift, created after gift selection
- `cultural_rules` table — admin-managed, seeded with 50+ rules at launch
- 4 new columns on `gift_sessions` (personalization_scores, node_timings, cultural_rules_applied, engine_version)

See `11-database-schema-changes.md` for complete SQL.

---

## Data Flow: End-to-End

### Step 1: Session Setup (unchanged from v1)

```
User clicks "Find a Gift"
  → Frontend: createSession() → INSERT gift_sessions → returns session_id
  → Frontend: deductCredit() → Edge Function: deduct-credit → credits_balance--
```

### Step 2: AI Pipeline (v2 — new)

```
Frontend: POST /api/recommend/start { session_id, recipient_id, ... }
  → Vercel: validateToken() → fetch recipient from Supabase
  → Vercel: invoke LangGraph graph with initial state
  → Vercel: opens SSE stream, returns stream_id

Frontend: GET /api/recommend/stream?session_id={uuid}
  → SSE stream receives events as nodes complete

LangGraph:
  Node 1 → recipient analysis (Claude Haiku call)
  Nodes 2+3+4 → parallel (pgvector queries, Claude Haiku call)
  Node 5 → gift generation (tiered LLM call)
  Node 6 → budget filter (code) → loop if < 3 remain
  Node 7 → personalization validation (Claude Haiku call)
  Node 8 → format response
  Node 9 → fire telemetry to PostHog + update gift_sessions

  Each node fires SSE event: node_start, node_complete
  Final: fires SSE event: recommendations + done
```

### Step 3: Product Search (unchanged from v1)

```
Frontend receives recommendations
  → calls search-products Edge Function (unchanged)
  → displays product links
```

### Step 4: Gift Selection (v2 addition)

```
User selects a gift
  → Frontend: POST /api/recommend/select { session_id, gift_index, gift_name }
  → Vercel: update gift_sessions.selected_gift_name, status='completed'
  → Vercel: queue background job: generate_gift_embedding(session_id, gift_name, recipient_id)
  → Background: embed gift text → INSERT gift_embeddings
  → Background: update recipient_embeddings (re-embed recipient with latest profile)
```

---

## Why Vercel + LangGraph vs. Alternatives Considered

### Alternative 1: LangGraph on Supabase Edge Functions
**Rejected because:**
- Deno runtime, not Node.js — LangGraph TypeScript SDK requires Node.js
- 60s timeout — insufficient for 9-node pipeline with retries
- No native SSE support (would need a hack with `TransformStream`)

### Alternative 2: AWS Lambda + API Gateway
**Rejected because:**
- Higher operational complexity (IAM, VPC, API Gateway config)
- GiftMind is already Vercel-deployed on the frontend — co-location is simpler
- Cold start on Lambda can be 2-4s; Vercel Pro is faster

### Alternative 3: Python FastAPI on Railway/Fly.io
**Rejected because:**
- Adds a third deployment platform (Supabase + Vercel + Railway)
- Python LangGraph is more mature but TypeScript is preferred for type safety shared with frontend

### Alternative 4: Keep all logic in Supabase Edge Functions, no LangGraph
**Rejected because:**
- Can't implement parallel nodes (Deno `Promise.all` works but no graph state management)
- Can't implement conditional retry loops
- Can't get per-node observability
- Budget retry loop requires state between calls

### Chosen: Vercel Serverless (Node.js) + LangGraph TypeScript
**Rationale:**
- Single additional deployment platform (frontend is already Vercel)
- Node.js 20 runtime supports all required SDKs
- 5-minute timeout on Vercel Pro is more than sufficient
- SSE is first-class in Node.js Response/ReadableStream
- TypeScript types are shared between frontend hooks and API routes

---

## Environment Variables

### Existing (keep)
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY
GROQ_API_KEY
VITE_POSTHOG_KEY
```

### New (for Vercel)
```
# Vercel env vars
LANGCHAIN_TRACING_V2=true            # Optional: LangSmith tracing
LANGCHAIN_API_KEY=...                # Optional: LangSmith
OPENAI_API_KEY=...                   # For text-embedding-3-small (embeddings)
VITE_USE_LANGGRAPH=true              # Feature flag: route traffic to v2

# Or use Gemini for embeddings (free)
# GOOGLE_AI_API_KEY already set above — reuse for embedding-001
```

---

## Failure Modes and Fallbacks

| Failure | Behavior |
|---------|---------|
| Vercel function timeout (>5min) | SSE sends `event: error` with code `GRAPH_TIMEOUT`, frontend falls back to v1 Edge Function |
| LangGraph node fails after 3 retries | Graph aborts, SSE sends `event: error`, credits refunded |
| pgvector query fails | Node 2/4 return empty arrays (soft failure); generation proceeds without cultural rules / past gifts |
| Budget Enforcer exhausts retries | Returns partial results (≥1 rec) with user-facing message |
| Personalization Validator fails | Node 8 proceeds with unvalidated recommendations + warning in metadata |
| SSE connection drops | Client reconnects to `/api/recommend/stream?session_id=X` — Vercel route replays from cache if within 60s |
| Entire Vercel function unavailable | Feature flag `VITE_USE_LANGGRAPH` automatically falls back to v1 if Vercel health check fails |
