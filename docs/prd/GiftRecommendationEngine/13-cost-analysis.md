# 13 — Cost Analysis

---

## Cost Components Per Session

A single gift recommendation session in v2 involves costs across 5 categories: LLM API calls (nodes 1, 3, 5, 7), embedding API calls (nodes 2, 4), database queries, Vercel compute, and PostHog events.

### LLM Costs by Node

#### Node 1: Recipient Analyzer (Claude Haiku — all plans)

```
Input tokens:  ~250 (system prompt ~100 + recipient data ~150)
Output tokens: ~200 (structured JSON)
Claude Haiku: $0.25/M input, $1.25/M output
Cost: ($0.25 × 0.00025) + ($1.25 × 0.0002) = $0.000063 + $0.00025 = ~$0.00031
```

#### Node 3: Occasion Interpreter (Claude Haiku — all plans)

```
Input tokens:  ~180 (system prompt ~80 + occasion context ~100)
Output tokens: ~150 (OccasionContext JSON)
Cost: ($0.25 × 0.00018) + ($1.25 × 0.00015) = $0.000045 + $0.000188 = ~$0.00023
```

#### Node 5: Gift Generator (varies by plan)

This is the most expensive node — the primary generation call.

**Spark plan (Groq Llama 3.3 70B):**
```
Input tokens:  ~1,200 (system prompt + all context from nodes 1-4)
Output tokens: ~800 (5-6 recommendations)
Groq pricing: ~$0.59/M input, $0.79/M output (llama-3.3-70b-versatile)
Cost: ($0.59 × 0.0012) + ($0.79 × 0.0008) = $0.000708 + $0.000632 = ~$0.0013
```

**Thoughtful plan (Gemini Flash):**
```
Input tokens:  ~1,200
Output tokens: ~800
Gemini 2.5 Flash: ~$0.15/M input, $0.60/M output (estimated)
Cost: ($0.15 × 0.0012) + ($0.60 × 0.0008) = $0.00018 + $0.00048 = ~$0.00066
```

**Confident plan (Claude Haiku):**
```
Input tokens:  ~1,200
Output tokens: ~800
Claude Haiku: $0.25/M input, $1.25/M output
Cost: ($0.25 × 0.0012) + ($1.25 × 0.0008) = $0.0003 + $0.001 = ~$0.0013
```

**Gifting Pro plan (Claude Sonnet):**
```
Input tokens:  ~1,200
Output tokens: ~800
Claude Sonnet 4.6: $3.00/M input, $15.00/M output
Cost: ($3.00 × 0.0012) + ($15.00 × 0.0008) = $0.0036 + $0.012 = ~$0.0156
```

#### Node 7: Personalization Validator (Claude Haiku — all plans)

```
Input tokens:  ~800 (system prompt + recipient profile + 3 recommendations)
Output tokens: ~400 (validation JSON with optional rewrites)
Cost: ($0.25 × 0.0008) + ($1.25 × 0.0004) = $0.0002 + $0.0005 = ~$0.0007
```

#### Budget Retry (if triggered — ~30% of sessions)

If Node 6 triggers a retry, Node 5 runs again. Add 30% × Node 5 cost as expected retry cost:
- Spark: +$0.0004
- Thoughtful: +$0.0002
- Confident: +$0.0004
- Gifting Pro: +$0.0047

---

### Embedding Costs

#### Node 2: Cultural Context Retriever

```
Query text: ~50 tokens ("gift for diwali, india, jain vegetarian")
OpenAI text-embedding-3-small: $0.02/M tokens
Cost: $0.02 × 0.00005 = ~$0.000001 (virtually zero)
```

#### Node 4: Past Gift Retriever

```
Query text: ~80 tokens (top interests + context)
Cost: $0.02 × 0.00008 = ~$0.0000016 (virtually zero)
```

#### Post-session: Gift Embedding (after selection)

```
Gift text to embed: ~120 tokens
Cost: $0.02 × 0.00012 = ~$0.0000024
```

#### Post-session: Recipient Embedding (updated on selection)

```
Recipient profile text: ~100 tokens
Cost: $0.02 × 0.0001 = ~$0.000002
```

**Total embedding cost per session: ~$0.000005 (< $0.01 per 1,000 sessions)**

If using Gemini `embedding-001` (free tier): **$0.00**

---

### Database Costs

Supabase Pro plan: $25/month flat, includes 8 GB database. At current scale (<10,000 users), database query costs are included in the flat fee.

pgvector queries (IVFFlat ANN search) are CPU-bound, not billed separately. They add negligible compute overhead.

---

### Vercel Compute Costs

Vercel Pro: $20/month
- Included: 1 TB bandwidth, 1M function invocations
- 9-node pipeline = 1 invocation per session (it's one serverless function call, not 9)
- Duration: ~10s average × 1 invocation = 10s per session
- Vercel pricing: $0.0001/GB-second at standard 128MB memory = $0.0000128/s = $0.000128 per session

**At 1,000 sessions/month:** $0.13 compute (within Pro plan)
**At 10,000 sessions/month:** $1.28 compute (still within Pro plan)
**At 100,000 sessions/month:** $12.80 compute (approaching Pro plan limit for invocations)

---

## Total Cost Per Session By Plan

| Component | Spark | Thoughtful | Confident | Gifting Pro |
|-----------|-------|-----------|-----------|-------------|
| Node 1 (Recipient Analyzer) | $0.00031 | $0.00031 | $0.00031 | $0.00031 |
| Node 3 (Occasion Interpreter) | $0.00023 | $0.00023 | $0.00023 | $0.00023 |
| Node 5 (Gift Generator) | $0.0013 | $0.00066 | $0.0013 | $0.0156 |
| Node 5 retry (30% probability) | $0.00040 | $0.00020 | $0.00040 | $0.00470 |
| Node 7 (Personalization Validator) | $0.0007 | $0.0007 | $0.0007 | $0.0007 |
| Embeddings (all nodes) | $0.000005 | $0.000005 | $0.000005 | $0.000005 |
| Vercel compute | $0.000128 | $0.000128 | $0.000128 | $0.000128 |
| **Total per session** | **~$0.0046** | **~$0.0022** | **~$0.0046** | **~$0.021** |

### Notes on These Estimates

- Spark costs more per session than Thoughtful because Groq Llama 3.3 70B (Groq pricing) is slightly more expensive per token than Gemini Flash.
- Gifting Pro is significantly more expensive (~5× vs Confident) due to Claude Sonnet.
- All estimates assume **no signal check** (signal check is a separate 0.5-credit purchase priced at ~$0.003 per call using Claude Sonnet, but that's unchanged from v1).
- Budget retry adds expected cost of ~30% × base Node 5 cost. This will decrease as the prompts improve.

---

## Monthly Cost Projections

### Scenario A: Early Stage (100 paying users)

Assumptions:
- 100 paid users (mix of plans: 50% Thoughtful, 35% Confident, 15% Pro)
- Average 3 sessions/user/month = 300 sessions
- Spark users (free): 500 free users × 0.5 sessions/month = 250 sessions

| Plan | Sessions | Cost/Session | Monthly AI Cost |
|------|---------|-------------|----------------|
| Spark (free) | 250 | $0.0046 | $1.15 |
| Thoughtful | 150 | $0.0022 | $0.33 |
| Confident | 105 | $0.0046 | $0.48 |
| Gifting Pro | 45 | $0.021 | $0.95 |
| **Total** | **550** | | **$2.91** |

+ Vercel Pro: $20/month
+ Supabase Pro: $25/month

**Total infrastructure: ~$48/month**
**Revenue from 100 users (avg $5.99/pack): ~$599/month**
**Gross margin: ~92%**

### Scenario B: Growth Stage (1,000 paying users)

| Plan | Sessions | Cost/Session | Monthly AI Cost |
|------|---------|-------------|----------------|
| Spark (free) | 2,500 | $0.0046 | $11.50 |
| Thoughtful | 1,500 | $0.0022 | $3.30 |
| Confident | 1,050 | $0.0046 | $4.83 |
| Gifting Pro | 450 | $0.021 | $9.45 |
| **Total** | **5,500** | | **$29.08** |

+ Vercel Pro: $20/month
+ Supabase Pro: $25/month

**Total infrastructure: ~$74/month**
**Revenue from 1,000 paying users (avg $5.99): ~$5,990/month**
**Gross margin: ~98.8%** (AI cost is a tiny fraction of revenue)

### Scenario C: Scale Stage (10,000 paying users)

| Plan | Sessions | Cost/Session | Monthly AI Cost |
|------|---------|-------------|----------------|
| Spark (free) | 25,000 | $0.0046 | $115.00 |
| Thoughtful | 15,000 | $0.0022 | $33.00 |
| Confident | 10,500 | $0.0046 | $48.30 |
| Gifting Pro | 4,500 | $0.021 | $94.50 |
| **Total** | **55,000** | | **$290.80** |

+ Vercel Pro + overages: ~$100/month (1M function invocations limit hit; upgrade to Enterprise or pay per invocation)
+ Supabase Pro (or Team): ~$25–$100/month
+ PostHog: ~$0 (free tier up to 1M events/month)

**Total infrastructure: ~$520/month**
**Revenue from 10,000 paying users (avg $5.99): ~$59,900/month**
**Gross margin: ~99.1%**

---

## v2 vs v1 Cost Comparison

| Metric | v1 | v2 |
|--------|----|----|
| LLM calls per session | 1 | 3 (nodes 1, 3, 5) + 1 (node 7) = 4 |
| Most expensive call | Node 5 (generator) | Node 5 (generator) — same |
| Embedding calls | 0 | 2 (nodes 2, 4) |
| Total estimated cost (Thoughtful) | ~$0.0010 | ~$0.0022 |
| Total estimated cost (Pro) | ~$0.010 | ~$0.021 |
| Cost increase | — | ~2× |

**The ~2× cost increase is justified because:**
1. Budget compliance improves from ~70% to 100% → fewer abandoned sessions → better conversion
2. Personalization improves → lower regeneration rate (~25% target vs current unknown) → fewer LLM calls per completed session
3. Cultural appropriateness improves �� better NPS → more referrals → lower CAC

**Break-even on cost increase:** If v2 reduces regeneration rate by 5 percentage points (e.g., 30% → 25%), that saves 0.05 LLM calls per session. At $0.0013 per generator call, that saves $0.000065 per session — not enough to offset the $0.0012 cost increase. The cost increase is carried as a quality investment.

---

## Cost Guardrails

To prevent unexpected AI spend spikes:

### Per-Session Cost Cap
If any single session accrues more than $0.10 in LLM costs (e.g., multiple retries + all nodes), abort and return partial results. This is an extreme edge case but protects against infinite retry loops.

### Monthly Budget Alerts
Set up Vercel and Anthropic spending alerts:
- Anthropic: Alert at $50/month, hard cap at $200/month
- Vercel: Alert at $50/month
- OpenAI (embeddings): Alert at $10/month

### Model Downgrade on Budget Pressure
If monthly spend exceeds 80% of budget threshold with >15 days left in month:
- Automatically downgrade Gifting Pro from Claude Sonnet → Claude Haiku for new sessions
- PostHog event fired: `cost_guardrail_triggered`
- Restore at start of next month

This guardrail is a last resort — it would require spending $160+ in a month at current scale, which is only possible at 10,000+ active users.
