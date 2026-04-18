# 00 — Codebase Audit

> **Purpose:** Baseline snapshot of GiftMind's existing implementation before the v2 Gift Recommendation Engine is built.
> **Date:** 2026-04-18

---

## 1. Edge Functions Inventory

All functions live in `supabase/functions/` and run on Deno. They are deployed as Supabase Edge Functions.

### 1.1 Core Gift-Flow Functions

#### `generate-gifts/index.ts` — Main Recommendation Engine

**Responsibility:** Accepts a recipient profile, occasion, and budget range; calls a single LLM; returns exactly 3 gift recommendations.

**How it works (single-pass, no decomposition):**
1. Validates JWT via `supabase.auth.getUser(token)`.
2. Looks up `users.active_plan` to determine the provider chain.
3. Calls `getProviderChain(plan, "gift-generation")` → ordered array of providers.
4. Calls `callAIWithFallback(chain, { systemPrompt, userMessage })`.
5. Parses the JSON response with `parseAIJson()`.
6. Validates structure with `validateAIResponse()` — must have exactly 3 recommendations.
7. Persists AI output to `gift_sessions.ai_response` (jsonb).
8. Returns the full recommendations JSON plus `_meta` (provider, latency, attempt).

**Key observations:**
- Budget is communicated in the `userMessage` as a string range (`"USD 30 - 60"`). The LLM is **asked** to stay within budget, but there is no post-call enforcement.
- Cultural awareness is a single line in the system prompt: `"Consider cultural context (Diwali, Eid, etc.) if recipient's country implies it"`. There is no retrieval of cultural rules from a database.
- The `why_it_works` field references recipient details only as much as the LLM chooses to — there is no validation that personalization happened.
- Regeneration limits are enforced by plan (spark: 1, thoughtful: 2, confident: 3, gifting-pro: unlimited).
- Rate limit: max 10 sessions per user per hour.

**Provider chain by plan:**
| Plan | Primary | Fallback 1 | Fallback 2 |
|------|---------|-----------|-----------|
| spark | groq-llama | gemini-flash | claude-haiku |
| thoughtful | gemini-flash | claude-haiku | groq-llama |
| confident | claude-haiku | gemini-flash | groq-llama |
| gifting-pro | claude-sonnet | claude-haiku | gemini-pro |

**LLM Models in use:**
- `claude-sonnet-4-20250514` (gifting-pro primary)
- `claude-haiku-4-5-20251001` (confident primary, fallback for others)
- `gemini-2.5-flash-preview-04-17` (thoughtful primary)
- `gemini-3-1-pro` (fallback, signal-check)
- `llama-3.3-70b-versatile` via Groq (spark primary, free tier)

#### `signal-check/index.ts` — Gift Signal Analyzer

**Responsibility:** Analyzes what a chosen gift communicates about the relationship. Available to Confident and Gifting Pro plans only (costs 0.5 credits).

**How it works:**
1. Validates plan (`confident` or `gifting-pro` required).
2. Checks `credits_balance >= 0.5`.
3. Looks up existing signal checks for this session + gift name (caching: if no follow-up prompt and result exists, returns cached).
4. Calls `callAIWithFallback(["claude-sonnet", "gemini-pro", "claude-haiku"], ...)`.
5. Stores result in `signal_checks` table with revision tracking (supports follow-up prompts).
6. Deducts 0.5 credits via `deduct_user_credit` RPC.

**Key observations:**
- Uses best available AI (claude-sonnet first) regardless of plan — signal check is premium.
- Supports iterative refinement via `follow_up_prompt` and `parent_signal_check_id` (revision threading).
- Rate limit: 30 signal checks per user per day.

#### `search-products/index.ts` — Product Link Generator

**Responsibility:** Converts AI-generated gift concepts into real product links. No AI call — pure database lookup and scoring.

**How it works:**
1. Takes `gift_concepts` array (name, search_keywords, product_category, price_anchor).
2. Determines `targetCountry` (recipient_country > user_country > "US").
3. Fetches stores from `marketplace_config` for that country; falls back to GLOBAL.
4. Applies plan-based store limits (spark: 1, thoughtful: 2, confident/pro: all).
5. For each gift concept × accessible store: matches `marketplace_products` by keyword scoring, category, price, stock status.
6. Returns `ProductLink` for top match or falls back to a search URL.
7. Locked stores are returned as placeholders to incentivize upgrades.

**Scoring factors for product matching:**
- Phrase match in product title (+14), keyword tags (+10)
- Token match in title (+4), tags (+3)
- Category match (+10)
- Country match (+4)
- Price within budget (+12), proximity to price_anchor (+8)
- Stock status: in_stock (+6), low_stock (+3), out_of_stock (-20)

### 1.2 Supporting Functions

| Function | Purpose |
|----------|---------|
| `deduct-credit/index.ts` | Deducts 1 credit per new gift session; calls `deduct_user_credit` RPC |
| `award-referral-credits/index.ts` | Awards referral credits when a gift is selected |
| `process-referral/index.ts` | Tracks referral completion |
| `admin-grant-credits/index.ts` | Superadmin tool to manually grant credits |
| `send-expiry-warnings/index.ts` | Cron job: emails users when credits are expiring |
| `send-occasion-reminders/index.ts` | Cron job: emails users before saved occasions |
| `paypal-checkout/index.ts` | PayPal payment processing for credit purchases |
| `delete-account/index.ts` | GDPR-compliant account deletion |
| `export-user-data/index.ts` | GDPR data export |
| `blog-ai-assistant/index.ts` | AI assistant for blog content |
| `generate-blog-draft/index.ts` | Auto-generate blog post drafts |
| `generate-sitemap/index.ts` | SEO sitemap generation |
| `generate-rss/index.ts` | RSS feed generation |
| `check-secrets/index.ts` | Diagnostic: checks if API keys are configured |
| `send-test-email/index.ts` | Email test utility |

### 1.3 Shared Modules

- `_shared/ai-providers.ts` — Provider abstraction with fallback chain, error classification
- `_shared/validate.ts` — Input sanitization (sanitizeString, sanitizeArray, validateBudget, validateOccasion, validateCurrency, validateCountryCode, validatePlan, validateRelationship)

---

## 2. Database Schema

### Core Tables

#### `public.profiles`
```
id uuid PK
user_id uuid → auth.users (UNIQUE)
full_name text
referral_code text
avatar_url text
has_completed_onboarding boolean DEFAULT false
country text DEFAULT 'india'
currency_preference text DEFAULT 'INR'
language text DEFAULT 'en'
notify_gift_reminders boolean
notify_credit_expiry boolean
notify_tips boolean
created_at, updated_at timestamptz
```
*Note: Legacy table. `public.users` is the primary user record.*

#### `public.users` *(primary user record)*
```
id uuid PK → auth.users
email text
full_name text
avatar_url text
referral_code text
credits_balance numeric
active_plan text CHECK ('spark', 'thoughtful', 'confident', 'gifting-pro') DEFAULT 'spark'
role text (superadmin / admin / user)
referred_by uuid
created_at, updated_at timestamptz
```

#### `public.recipients`
```
id uuid PK
user_id uuid → auth.users ON DELETE CASCADE
name text NOT NULL
relationship_type relationship_type ENUM (partner, parent, sibling, close_friend, friend, colleague, boss, acquaintance, in_law, child, mentor, new_relationship)
relationship_depth relationship_depth ENUM (very_close, close, acquaintance)
age_range age_range ENUM (under_18, 18_25, 25_35, 35_50, 50_65, 65_plus)
gender gender_option ENUM (male, female, non_binary, prefer_not_to_say)
interests text[] DEFAULT '{}'
cultural_context cultural_context ENUM (indian_hindu, indian_muslim, indian_christian, western, mixed, other)
notes text
important_dates jsonb DEFAULT '[]'
last_gift_date timestamptz
country text DEFAULT NULL
created_at, updated_at timestamptz
```

#### `public.gift_sessions`
```
id uuid PK
user_id uuid → auth.users ON DELETE CASCADE
recipient_id uuid → recipients ON DELETE SET NULL
occasion text
occasion_date date
budget_min integer
budget_max integer
currency text DEFAULT 'INR'  -- migrated to 'USD' via universal_usd_pricing
context_tags text[] DEFAULT '{}'
special_context text
recipient_country text
ai_response jsonb  -- stores full AI output including signal_checks nested
ai_model_used text
confidence_score numeric
ai_provider_used text
ai_latency_ms integer
ai_attempt_number integer
ai_tokens_input integer
ai_tokens_output integer
regeneration_count integer DEFAULT 0
selected_gift_index integer
selected_gift_name text
feedback_rating text
feedback_notes text
product_results jsonb  -- stored product link results
status text DEFAULT 'in_progress'  -- active, completed, abandoned
extra_notes text
results jsonb  -- legacy column
chosen_gift jsonb  -- legacy column
created_at, updated_at timestamptz
```

#### `public.signal_checks`
```
id uuid PK
user_id uuid → public.users ON DELETE CASCADE
session_id uuid → gift_sessions ON DELETE CASCADE
gift_name text NOT NULL
parent_signal_check_id uuid → signal_checks (threading)
revision_number integer DEFAULT 1 (≥1)
follow_up_prompt text
result_payload jsonb
credits_used numeric(4,1) DEFAULT 0.5
created_at timestamptz
```
*Indexes: (session_id, gift_name, revision_number) UNIQUE; (user_id, created_at DESC)*

#### `public.credit_packages`
```
id uuid PK
name text
slug text
credits integer
price_usd numeric  -- All plans now USD only
validity_days integer
badge text
max_recipients integer (-1 = unlimited)
max_regenerations integer (-1 = unlimited)
max_reminders integer (-1 = unlimited)
stores_level text (basic / all)
has_signal_check boolean
has_batch_mode boolean
has_priority_ai boolean
has_history_export boolean
features text[]
sort_order integer
is_active boolean
```

*Current active packages:*
- Thoughtful: 25 credits, $2.99, 30 days
- Confident: 75 credits, $5.99, 60 days
- Gifting Pro: 200 credits, $14.99, 90 days
- Spark: Free (3 credits on signup, 7 day expiry)

#### `public.credit_batches`
```
id uuid PK
user_id uuid
package_name text
credits_purchased integer
credits_remaining integer
price_paid numeric
currency text
payment_provider text
expires_at timestamptz
created_at timestamptz
```

#### `public.credit_transactions`
```
id uuid PK
user_id uuid → auth.users
type text CHECK ('purchase', 'used', 'bonus', 'expired', 'referral')
amount integer
balance_after integer
details text
payment_id text
provider text
created_at timestamptz
```

#### `public.product_clicks`
```
id uuid PK
user_id uuid NOT NULL
session_id uuid → gift_sessions ON DELETE SET NULL
gift_concept_name text
product_title text
product_url text
store text
country text
is_search_link boolean DEFAULT true
clicked_at timestamptz
```

#### `public.marketplace_config`
```
id uuid PK
store_id text
store_name text
domain text
country_code text  -- migrated from 'country text' ('india' → 'IN', 'GLOBAL')
search_url text    -- migrated from search_url_pattern
affiliate_param text
brand_color text
categories text[]
priority integer
is_active boolean
created_at, updated_at timestamptz
```

#### `public.marketplace_products`
```
id uuid PK
store_id text NOT NULL
country_code text DEFAULT 'GLOBAL'
product_title text NOT NULL
product_url text NOT NULL
affiliate_url text
image_url text
price_amount numeric(10,2)
price_currency text
original_price_amount numeric(10,2)
stock_status text CHECK ('in_stock', 'low_stock', 'out_of_stock', 'preorder', 'unknown')
delivery_eta_text text
coupon_code text
coupon_text text
product_category text
keyword_tags text[] DEFAULT '{}'
affiliate_source text
attribution_label text
is_affiliate boolean DEFAULT true
priority integer DEFAULT 0
is_active boolean DEFAULT true
metadata jsonb
created_at, updated_at timestamptz
```

#### `public.rate_limit_events`
```
id uuid PK
action text
identifier text
metadata jsonb
created_at timestamptz
```
*Index: (action, identifier, created_at DESC)*

#### `public.user_roles` / `public.referrals` / `public.blog_*`
(Standard RBAC, referral tracking, blog CMS — not modified by this PRD)

---

## 3. Frontend Architecture

### `src/hooks/useGiftSession.ts`
The primary client-side hook managing the end-to-end gift flow:

**State managed:**
- `sessionId` — created in Supabase before AI call
- `isGenerating`, `isSearchingProducts` — UI loading states
- `recommendations` — array of 3 GiftRecommendation objects
- `productResults` — matched product links per recommendation
- `occasionInsight`, `budgetAssessment`, `culturalNote` — AI-generated metadata
- `aiProviderUsed`, `aiLatencyMs`, `aiAttempt` — telemetry
- `errorType` — typed errors: NO_CREDITS, RATE_LIMITED, AI_ERROR, AI_PARSE_ERROR, AUTH_REQUIRED, GENERIC
- `regenerationCount`, `selectedGiftIndex`, `isComplete`

**Flow sequence:**
1. `generateGifts()` → `runGeneration()` with `isRegeneration: false`
2. `createSession()` → inserts to `gift_sessions` (RLS: user must own)
3. `deductCredit()` → calls `deduct-credit` Edge Function (1 credit)
4. `callAI()` → calls `generate-gifts` Edge Function
5. `searchProducts()` → calls `search-products` Edge Function
6. `selectGift()` → updates `gift_sessions` with selected gift, triggers referral check
7. `trackProductClick()` → inserts to `product_clicks`

**Session reuse logic:** If `sessionId` exists but `recommendations` is null and status is not `NO_CREDITS` or `isComplete`, the session is reused (avoids double-charging credits on retry after parse error).

---

## 4. LLM Routing Logic Summary

From `_shared/ai-providers.ts`:

```
gift-generation:
  gifting-pro  → [claude-sonnet, claude-haiku, gemini-pro]
  confident    → [claude-haiku, gemini-flash, groq-llama]
  thoughtful   → [gemini-flash, claude-haiku, groq-llama]
  spark        → [groq-llama, gemini-flash, claude-haiku]

signal-check (always) → [claude-sonnet, gemini-pro, claude-haiku]
```

Fallback is automatic: if provider N fails (rate limit, timeout, parse error), provider N+1 is tried. `AIFallbackError` is thrown after all providers fail.

---

## 5. Gaps in Current Implementation

### Critical Gaps (blockers for v2)

| Gap | Location | Impact |
|-----|---------|--------|
| **No budget enforcement** | `generate-gifts/index.ts:229` — budget in prompt only | AI exceeds budget range ~30% of time |
| **No personalization validation** | No post-generation check exists | Generic outputs reach users |
| **No vector search** | No pgvector, no embeddings anywhere | Zero semantic memory |
| **No past gift memory** | `selected_gift_name` stored as text, never retrieved | Repeat suggestions across sessions |
| **Cultural rules in prompt only** | Line 229 of `buildSystemPrompt()` | Edge cases break (Jain+leather, etc.) |
| **Monolithic prompt** | `buildSystemPrompt()` + `buildUserMessage()` do everything | Quality ceiling hit |
| **No streaming** | Synchronous Edge Function response | Users wait 5-12s with no feedback |
| **No agent decomposition** | Single `callAIWithFallback()` call | Can't retry individual failed concerns |

### Moderate Gaps (improve in v2)

| Gap | Notes |
|-----|-------|
| `cultural_context` enum is too coarse | Only 6 options; misses Sikh, Jain, Buddhist, regional variations |
| No occasion-specific reasoning | AI treats "Diwali" same as "Birthday" — no occasion enrichment node |
| `feedback_rating` exists but unused | Data not flowing back to improve future recommendations |
| `confidence_score` is top-N from AI | Not a real quality metric, self-reported by model |
| No telemetry per node | Current: total latency only. Need per-node breakdown |

### Not Broken (keep as-is in v2)

- `signal-check` works well; keep as separate premium feature
- `search-products` scoring algorithm is solid; add budget enforcement there too
- `marketplace_config` / `marketplace_products` schema is good — add vector embeddings later
- Provider fallback chain in `_shared/ai-providers.ts` — reuse in v2 nodes
- Auth pattern (JWT → `supabase.auth.getUser`) — keep
- RLS policies — keep all, add new tables to same pattern
- Credit deduction flow — keep, v2 uses same 1-credit-per-session cost

---

## 6. What Migrates vs What Gets Added

### Migrate (v2 calls v1's code or replaces it)

| v1 Component | v2 Disposition |
|-------------|----------------|
| `generate-gifts/index.ts` | **Replace** with LangGraph pipeline |
| `buildSystemPrompt()` | **Extract** into Node 5 (Gift Generator) prompt |
| `getProviderChain()` | **Reuse** in LangGraph nodes |
| `callAIWithFallback()` | **Reuse** in LangGraph nodes |
| `parseAIJson()` | **Reuse** in all LangGraph nodes |
| `validateAIResponse()` | **Replace** with per-node validators |

### Add Alongside (v2 is parallel, not in-place)

| New Component | Notes |
|--------------|-------|
| `pgvector` extension | New Supabase extension |
| `recipient_embeddings` table | New |
| `gift_embeddings` table | New |
| `cultural_rules` table | New; seed with 50+ rules |
| Vercel API routes (`/api/recommend/v2`) | New backend tier |
| LangGraph orchestrator | New; Python or TypeScript |
| SSE streaming layer | New; frontend fetches from Vercel |
| `personalization_scores` column on `gift_sessions` | New column |
| Node 7 (Personalization Validator) | New LLM node |

---

## 7. Open Questions from Audit

1. **`public.users` table creation**: Not found in any migration file. Likely created directly in Supabase dashboard. Need to confirm column set before adding new columns.
2. **`gift_sessions.currency`**: Still `DEFAULT 'INR'` in original migration; `universal_usd_pricing.sql` migration aligns to USD but doesn't show altering the column default. Confirm production is all-USD.
3. **`geoConfig.ts`**: Not found in the codebase (`src/lib/geoConfig.ts` does not exist). The geo-routing logic is handled inside `search-products/index.ts` using `recipient_country` / `user_country` fields.
4. **`feedback_rating` data**: Column exists on `gift_sessions` but no feedback collection UI found. Is there a form somewhere? This data would be valuable for evaluating v2.
5. **Vercel deployment**: Currently all backend is Supabase Edge Functions (Deno). Vercel API routes for LangGraph means a second deployment target. Need to decide: Node.js or Python for LangGraph agent?
