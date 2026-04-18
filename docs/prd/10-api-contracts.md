# 10 — API Contracts

> All v2 endpoints are hosted on Vercel at `/api/recommend/`. They use the same Supabase JWT authentication as the existing Edge Functions.

---

## Authentication

All endpoints require a `Bearer` JWT token issued by Supabase Auth.

```
Authorization: Bearer <supabase_access_token>
```

The token is the user's session access token, obtained via `supabase.auth.getSession()`. This is identical to how the existing Edge Functions authenticate.

---

## `POST /api/recommend/start`

Initiates a recommendation generation session. This endpoint:
1. Validates the JWT
2. Verifies the session exists and belongs to the user
3. Fetches recipient data
4. Queues the LangGraph pipeline
5. Returns a stream ID immediately (non-blocking)

The actual recommendations arrive via the SSE stream endpoint.

### Request

```typescript
interface StartRecommendationRequest {
  session_id: string          // UUID — must already exist in gift_sessions
  recipient_id: string        // UUID — must exist in recipients for this user
  occasion: string            // e.g. "diwali", "birthday", "anniversary"
  occasion_date: string | null // ISO 8601 date: "2026-11-12"
  budget_min: number          // USD, integer
  budget_max: number          // USD, integer, must be >= budget_min
  special_context: string     // Free text, max 500 chars, can be empty string
  context_tags: string[]      // e.g. ["first_time", "long_distance"], max 10
  // Note: recipient details are fetched server-side from recipients table
  // Note: user_plan is fetched server-side from users table
}
```

**Example:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "recipient_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "occasion": "diwali",
  "occasion_date": "2026-11-12",
  "budget_min": 30,
  "budget_max": 60,
  "special_context": "She's recently moved to London and misses home cooking ingredients",
  "context_tags": ["long_distance", "indian_diaspora"]
}
```

### Response (200 OK)

```typescript
interface StartRecommendationResponse {
  stream_id: string     // Same as session_id — used to connect to SSE stream
  status: 'started'
  engine_version: 'v2'
}
```

```json
{
  "stream_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started",
  "engine_version": "v2"
}
```

### Errors

| Status | Code | Message |
|--------|------|---------|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 402 | `INSUFFICIENT_CREDITS` | User has no credits (checked before AI call) |
| 403 | `FORBIDDEN` | Session belongs to a different user |
| 404 | `SESSION_NOT_FOUND` | session_id does not exist |
| 404 | `RECIPIENT_NOT_FOUND` | recipient_id does not exist |
| 422 | `VALIDATION_ERROR` | Invalid budget range, missing required field, etc. |
| 429 | `RATE_LIMITED` | Too many sessions in last hour |
| 500 | `INTERNAL_ERROR` | Unexpected error |

**Error response shape:**
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many gift sessions in the last hour. Please wait.",
  "retry_after": 3600
}
```

---

## `GET /api/recommend/stream?session_id={uuid}`

SSE (Server-Sent Events) endpoint. Returns a stream of events as the pipeline progresses.

### Request

```
GET /api/recommend/stream?session_id=550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
Accept: text/event-stream
```

### Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

### SSE Events

#### `node_start`
Fired when a node begins execution.

```
event: node_start
data: {"node": "recipient_analyzer", "timestamp": 1713600000000}
```

Valid `node` values: `recipient_analyzer`, `cultural_context_retriever`, `occasion_interpreter`, `past_gift_retriever`, `gift_generator`, `budget_enforcer`, `personalization_validator`, `response_formatter`, `telemetry`

#### `node_complete`
Fired when a node finishes.

```
event: node_complete
data: {"node": "recipient_analyzer", "duration_ms": 1420, "success": true}
```

#### `status`
Human-readable status message for display in the UI progress indicator.

```
event: status
data: {"message": "Understanding your recipient profile..."}
```

Progress messages sequence:
1. "Analyzing your recipient..."
2. "Checking cultural gift traditions..."
3. "Looking at past gifts..."
4. "Interpreting the occasion..."
5. "Generating personalized recommendations..."
6. "Ensuring budget compliance..."
7. "Validating personalization quality..."
8. "Almost done..."

#### `budget_retry`
Fired when Node 6 triggers a generator retry.

```
event: budget_retry
data: {"attempt": 2, "reason": "2 of 5 suggestions were outside budget range"}
```

#### `recommendations`
The final recommendations. This is the payload the frontend waits for.

```
event: recommendations
data: {
  "recommendations": [
    {
      "name": "Single-Origin South Indian Spice Subscription",
      "description": "Monthly delivery of 4-6 regional spices from Kerala, Tamil Nadu, and Karnataka, with recipe cards",
      "why_it_works": "Priya's love of home cooking and her recent move to London makes this spice subscription particularly meaningful — she can recreate regional South Indian dishes she grew up with, using the same single-origin spices she'd find back home.",
      "confidence_score": 91,
      "signal_interpretation": "Shows you understand both her cultural roots and her current situation as an expat",
      "search_keywords": ["Indian spice subscription box", "South Indian cooking spices", "regional spice kit"],
      "product_category": "food",
      "price_anchor": 45,
      "what_not_to_do": "Avoid generic 'Indian spice' blends that aren't regionally specific",
      "personalization_score": 88
    },
    { ... },
    { ... }
  ],
  "occasion_insight": "Diwali is a time for light, prosperity, and connection — gifts that bridge home and new life abroad carry extra meaning.",
  "budget_assessment": "A $30-60 budget is appropriate for a family member — meaningful without being excessive.",
  "cultural_note": "As a Jain Hindu recipient, all recommendations have been verified to avoid leather, silk, and animal-derived products. Sweets and natural items are especially auspicious."
}
```

#### `done`
Signals the stream is complete.

```
event: done
data: {
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_duration_ms": 9130,
  "engine_version": "v2",
  "warnings": []
}
```

#### `error`
Fired if the pipeline fails.

```
event: error
data: {
  "code": "GENERATOR_FAILED",
  "message": "AI providers temporarily unavailable. Please try again.",
  "retry_suggested": true
}
```

| Error Code | Meaning |
|-----------|---------|
| `GENERATOR_FAILED` | All AI providers failed (LLM unavailable) |
| `BUDGET_FILTER_EXHAUSTED` | Cannot find 3+ recommendations within budget after 2 retries |
| `GRAPH_TIMEOUT` | Pipeline exceeded 5-minute Vercel timeout |
| `SESSION_EXPIRED` | Session no longer valid for generation |
| `RATE_LIMITED` | Concurrent pipeline limit reached |

### Reconnection

If the SSE connection drops, the client reconnects using the standard `EventSource` retry mechanism:

```typescript
// Frontend
const source = new EventSource(`/api/recommend/stream?session_id=${sessionId}`, {
  withCredentials: true  // Sends cookies for auth, or use Authorization header
})
source.onerror = () => {
  // EventSource auto-reconnects with Last-Event-ID
}
```

The Vercel function caches node completion states for 60 seconds so a reconnecting client can receive a "catch-up" stream of already-completed events.

---

## `POST /api/recommend/select`

Records a gift selection and triggers background embedding generation.

### Request

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "gift_index": 1,
  "gift_name": "Single-Origin South Indian Spice Subscription"
}
```

### Response (200 OK)

```json
{
  "success": true,
  "embedding_queued": true,
  "session_updated": true
}
```

### What this endpoint does

1. Updates `gift_sessions` with `selected_gift_index`, `selected_gift_name`, `status = 'completed'`
2. Updates `recipients.last_gift_date` to `now()`
3. Queues a background job to generate and store `gift_embeddings` entry for this selection
4. Queues a background job to update `recipient_embeddings` (profile may have been enriched by Node 1)
5. Triggers the referral credit check (same as existing `award-referral-credits` Edge Function)

**Note:** For v2, this endpoint replaces the `selectGift()` function in `useGiftSession.ts`. The frontend hook calls this Vercel endpoint instead of directly updating Supabase.

---

## `GET /api/recommend/status?session_id={uuid}`

Polling endpoint for clients that can't use SSE (fallback for older browsers or proxy issues).

### Response

```json
{
  "session_id": "uuid",
  "status": "in_progress" | "completed" | "failed",
  "current_node": "gift_generator",
  "nodes_completed": ["recipient_analyzer", "cultural_context_retriever", "occasion_interpreter", "past_gift_retriever"],
  "recommendations": null | [...],  // null while in_progress
  "total_duration_ms": null | 9130,
  "error": null | { "code": "...", "message": "..." }
}
```

Polling interval: 2 seconds. This endpoint is a fallback only — SSE is the primary delivery mechanism.

---

## Frontend Integration

### v2 Hook: `useGiftSessionV2.ts`

```typescript
export function useGiftSessionV2() {
  const [state, setState] = useState<GiftSessionV2State>(initialState)

  const generateGifts = useCallback(async (params: GenerateGiftParams) => {
    // 1. Create session + deduct credit (unchanged from v1)
    const sessionId = await createSession(params)
    await deductCredit(sessionId)

    // 2. Start the LangGraph pipeline
    const { data: startData } = await fetch('/api/recommend/start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        recipient_id: params.recipient.id,
        occasion: params.occasion,
        occasion_date: params.occasionDate,
        budget_min: params.budgetMin,
        budget_max: params.budgetMax,
        special_context: params.specialContext,
        context_tags: params.contextTags,
      })
    }).then(r => r.json())

    // 3. Connect to SSE stream
    const source = new EventSource(
      `/api/recommend/stream?session_id=${sessionId}`,
      { withCredentials: false }
    )

    // Use authorization header (EventSource doesn't support custom headers natively)
    // Solution: use a polyfill (fetchEventSource from @microsoft/fetch-event-source)
    // OR pass token as URL param (less secure): ?token=${token}
    // OR proxy through Vercel with cookie auth

    source.addEventListener('node_complete', (e) => {
      const data = JSON.parse(e.data)
      setState(prev => ({
        ...prev,
        nodeProgress: { ...prev.nodeProgress, [data.node]: 'complete' }
      }))
    })

    source.addEventListener('status', (e) => {
      const data = JSON.parse(e.data)
      setState(prev => ({ ...prev, statusMessage: data.message }))
    })

    source.addEventListener('recommendations', (e) => {
      const data = JSON.parse(e.data)
      setState(prev => ({
        ...prev,
        recommendations: data.recommendations,
        occasionInsight: data.occasion_insight,
        budgetAssessment: data.budget_assessment,
        culturalNote: data.cultural_note,
      }))
    })

    source.addEventListener('done', (e) => {
      source.close()
      setState(prev => ({ ...prev, isGenerating: false }))
    })

    source.addEventListener('error', (e) => {
      source.close()
      const data = JSON.parse(e.data)
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: data.message,
        errorType: mapErrorCode(data.code),
      }))
    })
  }, [])

  // ...rest of hook identical to v1
}
```

---

## API Versioning

| Version | Endpoint | Status |
|---------|---------|--------|
| v1 | Supabase Edge Function: `generate-gifts` | Active (keep as fallback) |
| v2 | Vercel: `/api/recommend/start` + `/api/recommend/stream` | New — feature-flagged |

**Feature flag:** `VITE_USE_LANGGRAPH=true` in `.env.production` switches the frontend to use v2 hooks.

During A/B testing (Week 5), the flag is enabled for 10-50% of users via PostHog feature flags:
```typescript
// In useGiftSession or the router component
const useLangGraph = posthog.isFeatureEnabled('use-langgraph-v2')
const HookComponent = useLangGraph ? useGiftSessionV2 : useGiftSession
```

---

## Rate Limits (v2 endpoints)

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/recommend/start` | 10 requests | Per user per hour |
| `/api/recommend/stream` | 50 connections | Per user per hour |
| `/api/recommend/select` | 20 requests | Per user per hour |

Rate limiting is enforced using the existing `rate_limit_events` table in Supabase (same pattern as `signal-check`). Vercel's built-in rate limiting (via Edge Config) can be used as a secondary layer.
