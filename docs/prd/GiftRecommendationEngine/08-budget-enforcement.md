# 08 — Budget Enforcement

---

## The Problem in Detail

Budget overshoot is a trust-destroying failure. When a user tells GiftMind "my budget is $30–$50" and receives a recommendation with `price_anchor: 75`, two bad things happen simultaneously:

1. **The product link fails the user.** `search-products` tries to find a product near price_anchor $75 within the $30–$50 budget. The scoring system penalizes out-of-budget products (-10 points) but doesn't eliminate them — an out-of-budget product with great keyword matches can still win. The user sees a link to a $68 item when they budgeted $45.

2. **The AI's credibility is damaged.** The user came to GiftMind to make a decision with confidence. Seeing a price mismatch signals that the AI doesn't understand their constraints, which calls into question everything else it suggested.

Current state: budget compliance is approximately 70% (estimated), meaning roughly 1 in 3 sessions has at least one out-of-budget recommendation.

---

## The Root Cause

In `supabase/functions/generate-gifts/index.ts:282–285`, budget is passed as text:
```typescript
`BUDGET: ${sanitizeString(body.currency, 10)} ${body.budget_min} - ${body.budget_max}`
```

And in the system prompt:
```typescript
"- Price anchors must fit within the user's budget range"
```

These are suggestions. The LLM processes them as soft instructions competing with personalization, cultural fit, and occasion appropriateness. Under token pressure, numeric constraints are the first to drift — especially with smaller models (Groq Llama, Gemini Flash).

There is no post-generation filter. Whatever price_anchor the model chooses arrives at the user unchanged.

---

## The Solution: Node 6 (Budget Enforcer)

Node 6 is a **deterministic code function** — no LLM, no embeddings, no database calls. It receives the array from Node 5, applies two rules, and either passes recommendations to Node 7 or loops back to Node 5.

### Core Filter

```typescript
// packages/langgraph-agent/src/nodes/budget-enforcer.ts

export interface BudgetEnforcerResult {
  filtered: GiftRecommendation[]
  filteredOut: GiftRecommendation[]
  retryRequired: boolean
  retryReason?: string
}

export function enforceBudget(
  recommendations: GiftRecommendation[],
  budgetMin: number,
  budgetMax: number,
  minRequired: number = 3
): BudgetEnforcerResult {
  const filtered: GiftRecommendation[] = []
  const filteredOut: GiftRecommendation[] = []

  for (const rec of recommendations) {
    const price = normalizePrice(rec.price_anchor)
    
    if (price === null) {
      // Missing or unparseable price — reject
      filteredOut.push({ ...rec, _reject_reason: 'INVALID_PRICE' })
      continue
    }
    
    if (price < budgetMin || price > budgetMax) {
      filteredOut.push({ ...rec, _reject_reason: `OUT_OF_BUDGET: ${price} not in [${budgetMin}, ${budgetMax}]` })
      continue
    }
    
    filtered.push(rec)
  }

  return {
    filtered,
    filteredOut,
    retryRequired: filtered.length < minRequired,
    retryReason: filtered.length < minRequired
      ? `Only ${filtered.length}/${minRequired} recommendations within budget. Filtered out: ${filteredOut.map(r => `${r.name} ($${(r as any)._reject_reason})`).join(', ')}`
      : undefined
  }
}

function normalizePrice(raw: unknown): number | null {
  if (typeof raw === 'number' && isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ''))
    return isFinite(parsed) ? parsed : null
  }
  return null
}
```

### LangGraph Node Implementation

```typescript
// In the LangGraph node:
export async function budgetEnforcerNode(
  state: RecommendationState
): Promise<Partial<RecommendationState>> {
  const startMs = Date.now()

  const result = enforceBudget(
    state.rawRecommendations,
    state.budgetMin,
    state.budgetMax,
    3  // Minimum 3 recommendations required
  )

  const warnings = [...state.metadata.warnings]
  
  if (result.filteredOut.length > 0) {
    warnings.push(`BUDGET_FILTER: Removed ${result.filteredOut.length} recommendation(s) outside $${state.budgetMin}–$${state.budgetMax}`)
  }

  if (result.retryRequired && state.budgetRetryCount >= 2) {
    // Exhausted retries — proceed with partial results
    warnings.push('BUDGET_FILTER_PARTIAL: Proceeding with < 3 recommendations after 2 retry attempts')
  }

  return {
    budgetFilteredRecommendations: result.filtered,
    budgetRetryCount: result.retryRequired && state.budgetRetryCount < 2
      ? state.budgetRetryCount + 1
      : state.budgetRetryCount,
    metadata: {
      ...state.metadata,
      nodeTimings: {
        ...state.metadata.nodeTimings,
        budget_enforcer: Date.now() - startMs,
      },
      warnings,
    },
  }
}
```

---

## Retry Logic

When fewer than 3 recommendations survive budget filtering, the graph loops back to Node 5 with an escalating instruction:

### Retry 1 (budgetRetryCount = 1)

```
⚠️ BUDGET RETRY (Attempt 1):
Your previous suggestions included prices outside the budget.
ALL price_anchor values MUST be between $${budgetMin} and $${budgetMax}.

Previous out-of-budget suggestions to NOT repeat:
${filteredOut.map(r => `• "${r.name}" (price: $${r.price_anchor})`).join('\n')}

If a gift concept genuinely cannot fit this budget, suggest a different tier or version 
that CAN fit (e.g., instead of "Dyson V15", suggest "Dyson V8 or V10").
```

### Retry 2 (budgetRetryCount = 2)

```
⚠️ BUDGET RETRY (Attempt 2 — FINAL):
This is the last attempt. Budget range is $${budgetMin}–$${budgetMax}.
DO NOT suggest any item that cannot realistically be found at this price point.
If in doubt, suggest the lower end of your estimate.
Prioritize accuracy over ambition.
```

### After 2 Retries: Partial Results

If after 2 retries there are still fewer than 3 recommendations:

```typescript
// Frontend receives:
{
  recommendations: [/* 1 or 2 items */],
  occasion_insight: "...",
  budget_assessment: "...",
  cultural_note: "...",
  _warning: "LIMITED_RESULTS",
  _warning_message: "We found fewer personalized matches within your exact $30-$50 budget. These are our best picks. Consider widening the range slightly for more options."
}
```

The frontend renders the available recommendations with a soft banner: *"Fewer results at this budget range — showing our best ${n} picks."*

---

## Why Budget Enforcement Must Be in Code, Not LLM

### The LLM argument (wrong)

One might argue: "If we just prompt the LLM more strongly, it will comply." This is wrong for three reasons:

1. **Non-determinism:** LLMs are stochastic. A prompt that achieves 99% compliance on one session achieves 85% on another. Code achieves 100%.

2. **Model variation:** The provider chain means different models (Groq, Gemini, Claude) execute for different plans. Each model has a different instruction-following profile on numeric constraints. Groq Llama is notably worse than Claude Sonnet at adhering to numeric bounds. Code is model-agnostic.

3. **No feedback loop:** If the LLM violates the budget, there is currently no mechanism to detect and correct it before the user sees the result. Code enforcement makes the violation impossible to reach the user.

### The "AI should handle everything" argument (wrong)

The product's value is personalization and cultural intelligence — things that require language understanding and reasoning. Budget filtering is arithmetic. Using a $0.02 LLM call to do arithmetic that a 5-line function handles with 100% accuracy is wasteful, slower, and less reliable.

The design principle: **AI for what AI is good at (reasoning, creativity, personalization), code for what code is good at (arithmetic, enforcement, validation).**

---

## Budget in the Product Search Layer

Node 6 fixes budget enforcement at the recommendation level. There is also a complementary fix needed in `search-products`:

**Current behavior:** `scoreProduct()` applies -10 penalty for out-of-budget products but does not eliminate them. An out-of-budget product with strong keyword matches can still be returned.

**v2 change (add alongside, does not break v1):**

```typescript
// search-products/index.ts — add hard filter before scoring
function filterProductsByBudget(
  products: MarketplaceProduct[],
  budgetMin: number,
  budgetMax: number
): MarketplaceProduct[] {
  return products.filter(p => {
    if (p.price_amount === null) return true  // Include if no price (unknown)
    return p.price_amount >= budgetMin && p.price_amount <= budgetMax
  })
}

// Apply before scoring in the main map:
const candidateProducts = catalogProducts
  .filter(p => p.store_id === store.store_id)
  .pipe(filterProductsByBudget(budgetMin, budgetMax))  // NEW
  // ...existing scoring...
```

This ensures that even if a search link is generated (fallback when no catalog product matches), the search URL is constructed with price range parameters:

```typescript
function buildSearchUrl(store: MarketplaceStore, keyword: string, budgetMin: number, budgetMax: number): string {
  // For Amazon: &price_range=30-50 or &low-price=30&high-price=50
  // Existing implementation doesn't pass price ranges to search URLs
  // v2: add price range where supported
}
```

---

## Budget Edge Cases

### Edge Case 1: Zero-lower-bound budget

User sets budget min to $0 (free gifts, IOU, experiences they'll plan themselves). Rule: any `price_anchor` ≤ $0 that is 0 or a small non-negative number passes. Budget enforcer treats 0 as no lower bound.

### Edge Case 2: Very narrow budget range ($25–$30)

Node 5 is asked to generate 5–6 candidates within a $5 window. Enforcer may filter all of them. Retry instruction explicitly handles this:
```
Budget range: $25–$30 (only $5 spread)
Focus on a SINGLE specific category with known pricing at this level.
Consider: books ($15-28), candles ($20-30), desk plants ($18-28), artisan food items ($20-28).
```

### Edge Case 3: Very high budget ($500+)

No special handling needed — the model performs better with luxury budgets. Budget enforcer still applies but rarely needs to filter.

### Edge Case 4: Experience gifts with variable pricing

Some experience gifts (cooking classes, spa days) have price ranges, not fixed prices. Current approach: the `price_anchor` is the midpoint. If a cooking class is $45–$55, `price_anchor: 50`. Budget enforcer checks this midpoint against the budget range. If midpoint is within range, the experience passes; the `what_not_to_do` field should note the variable pricing.

### Edge Case 5: Currency conversion

All budgets and price_anchors are in USD as of the `universal_usd_pricing` migration. No conversion needed. If a recipient is in India and the user has set a USD budget, the search-products layer finds INR-priced products and converts for display. The budget enforcer only operates in USD.

---

## Testing the Budget Enforcer

Budget enforcement is a pure function — easily unit tested:

```typescript
// __tests__/budget-enforcer.test.ts
describe('enforceBudget', () => {
  it('passes all recs within budget', () => {
    const recs = [
      { name: 'A', price_anchor: 35 },
      { name: 'B', price_anchor: 45 },
      { name: 'C', price_anchor: 50 },
    ]
    const result = enforceBudget(recs, 30, 60, 3)
    expect(result.filtered).toHaveLength(3)
    expect(result.retryRequired).toBe(false)
  })

  it('filters out-of-budget recs and flags retry', () => {
    const recs = [
      { name: 'A', price_anchor: 75 },  // too high
      { name: 'B', price_anchor: 45 },  // ok
      { name: 'C', price_anchor: 15 },  // too low
    ]
    const result = enforceBudget(recs, 30, 60, 3)
    expect(result.filtered).toHaveLength(1)
    expect(result.retryRequired).toBe(true)
    expect(result.filteredOut).toHaveLength(2)
  })

  it('handles string price_anchors', () => {
    const recs = [{ name: 'A', price_anchor: '45.00' as any }]
    const result = enforceBudget(recs, 30, 60, 1)
    expect(result.filtered).toHaveLength(1)
  })

  it('handles null/undefined price_anchor', () => {
    const recs = [{ name: 'A', price_anchor: null as any }]
    const result = enforceBudget(recs, 30, 60, 1)
    expect(result.filteredOut).toHaveLength(1)
  })

  it('triggers retry after 2 attempts and returns partial', () => {
    // Simulate state where budgetRetryCount = 2
    const recs = [{ name: 'A', price_anchor: 45 }]
    const result = enforceBudget(recs, 30, 60, 3)
    expect(result.retryRequired).toBe(true)
    // But since retryCount = 2, node should return partial without retrying
    // (retry count logic is in the node, not the pure function)
  })
})
```

All 10 budget test cases in the golden set (see `14-testing-strategy.md`) are run against this function as unit tests, with no LLM involvement.

---

## Monitoring Budget Enforcement in Production

PostHog events:
```typescript
posthog.capture('budget_enforcer_ran', {
  session_id,
  input_count: rawRecommendations.length,
  output_count: filteredRecommendations.length,
  filtered_count: rawRecommendations.length - filteredRecommendations.length,
  retry_triggered: retryRequired && budgetRetryCount < 2,
  retry_count: budgetRetryCount,
  budget_min: budgetMin,
  budget_max: budgetMax,
  provider_used: providerUsed,
})
```

Alert: If `filtered_count > 0` for more than 5% of sessions in a rolling 24-hour window, investigate the generator prompt for budget drift. A sudden increase in filtering may indicate a model API change.
