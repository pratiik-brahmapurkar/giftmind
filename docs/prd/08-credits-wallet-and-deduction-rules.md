# PRD 08 — Credits Wallet & Credit Deduction Rules

**Document Status:** Draft · v1.0  
**Author:** Engineering (senior full-stack)  
**Date:** 2026-04-24

---

## 1. Purpose & Background

GiftMind currently ships with a simple one-time credit model: new users get 3 credits on signup via a DB trigger, credits are batched in `credit_batches`, deducted via `deduct_user_credit()`, and refunded via `refund_user_credit()`. The AI provider chain is already abstracted in `_shared/ai-providers.ts` with `getProviderChain(plan, operation)`.

**The problem:** The current model does not have a recurring free credit cycle, a clear freemium tier experience, or cost-optimised provider routing for free-tier users. Users who exhaust their 3 signup credits hit a dead end with no reset expectation.

**Goal:** Ship a low-cost freemium system that gives free users 15 credits/month, resets them monthly, routes all free-tier AI traffic to Groq (free) → Gemini Flash (cheap) → Claude Haiku (cost backstop), enforces limits at all 3 layers (UI, edge function, DB), and surfaces a soft paywall — not a hard wall — when credits run out.

---

## 2. Existing Infrastructure Audit

### 2.1 Database Layer (What Exists)

| Table / Function | Status | Notes |
|---|---|---|
| `public.users` | ✅ Exists | Has `credits_balance` (numeric), `active_plan` (spark/thoughtful/confident/gifting-pro) |
| `public.credit_batches` | ✅ Exists | Has `user_id`, `package_name`, `credits_purchased`, `credits_remaining`, `expires_at`, `is_expired`, `price_paid`, `currency`, `payment_provider` |
| `public.credit_transactions` | ✅ Exists | Has `user_id`, `type`, `amount`, `batch_id`, `session_id`, `metadata`, `payment_id`, `provider` |
| `public.deduct_user_credit(p_user_id, p_session_id, p_amount)` | ✅ Exists | FIFO by `expires_at ASC`, uses `FOR UPDATE`, idempotent on insufficient balance |
| `public.refund_user_credit(p_user_id, p_session_id, p_amount, p_reason)` | ✅ Exists | Traces back `usage` transactions per batch, prevents double-refund |
| `public.run_credit_expiry()` | ✅ Exists | Marks expired batches, recalculates user balances. Runs daily at 18:30 UTC via cron |
| `public.platform_settings` | ✅ Exists | Runtime config key/value table used for `signal_check_cost`, `feature_signal_check`, etc. |
| `public.rate_limit_events` | ✅ Exists | Used for signal-check and referral rate limiting |
| `public.referrals` | ✅ Exists | `referrer_id`, `referred_id`, `status`, `credits_awarded` |
| `public.gift_sessions` | ✅ Exists | Session-scoped credit deduction anchor |

### 2.2 Edge Function Layer (What Exists)

| Function | Status | Notes |
|---|---|---|
| `deduct-credit` | ✅ Exists | Thin wrapper over `deduct_user_credit()` RPC. Returns 402 on insufficient credits |
| `refund-credit` | ✅ Exists | Thin wrapper over `refund_user_credit()` RPC |
| `signal-check` | ✅ Exists | Pre-flight balance check, deduct, AI call, refund on failure, idempotent via rate_limit_events |
| `generate-gifts` | ✅ Exists | Calls AI but **does NOT deduct credits** — uses GiftFlow Step 5 to deduct separately |
| `award-referral-credits` | ✅ Exists | Awards 3 credits to **referrer** when referred user completes first session |
| `process-referral` | ✅ Exists | Records referral + gives 2 **bonus** credits to **new user** on signup |
| `send-expiry-warnings` | ✅ Exists | Email warnings when credits near expiry |

### 2.3 AI Provider Routing (What Exists)

`getProviderChain(plan, operation)` in `_shared/ai-providers.ts`:

```typescript
// Current behaviour:
if (operation === "signal-check") {
  return ["claude-sonnet", "gemini-pro", "claude-haiku"]; // expensive regardless of plan
}

switch (plan) {
  case "gifting-pro": return ["claude-sonnet", "claude-haiku", "gemini-pro"];
  case "confident":   return ["claude-haiku", "gemini-flash", "groq-llama"];
  case "thoughtful":  return ["gemini-flash", "claude-haiku", "groq-llama"];
  case "spark":
  default:            return ["groq-llama", "gemini-flash", "claude-haiku"]; // already correct for gift-gen
}
```

**Gap identified:** `signal-check` always routes to expensive providers regardless of plan. Needs a free-tier path for `spark` and `thoughtful` users.

### 2.4 Frontend Layer (What Exists)

| Component | Status | Notes |
|---|---|---|
| `useCredits` hook | ✅ Exists | Fetches balance, batches, transactions; real-time via Supabase channel |
| `useUserPlan` hook | ✅ Exists | Returns current plan string |
| `Credits.tsx` page | ✅ Exists | Shows balance, batches, expiry, buy tab |
| `CreditHistoryTab.tsx` | ✅ Exists | Shows transaction history |
| `BuyCreditsTab.tsx` | ✅ Exists | PayPal checkout for paid plans |

**Gaps identified:** No monthly-reset awareness in UI. No credit cost labelling per action. No soft paywall state.

---

## 3. What Needs to Be Built

### 3.1 Gaps Summary

| Area | Gap |
|---|---|
| DB | No `batch_type` column on `credit_batches` to distinguish `free_monthly` from `paid` / `referral_bonus` |
| DB | No `credit_month` column to enforce one free batch per user per calendar month |
| DB | No `issue_free_monthly_credits()` RPC for on-demand monthly issuance |
| DB | `deduct_user_credit` uses `numeric` — will accept 0.5 increments, but business wants integer units |
| DB | No `credit_action_ledger` for idempotent action-level deduction tracking |
| Edge function | `signal-check` routes to expensive providers for all plans |
| Edge function | No `issue-monthly-credits` function or on-demand monthly top-up logic |
| Edge function | `generate-gifts` does not deduct credits inline — relies on separate client call |
| Edge function | `award-referral-credits` awards 3 credits (should be 1 credit = 1 Signal Check equivalent) |
| Frontend | No monthly credit UI with reset date countdown |
| Frontend | No per-action cost labels |
| Frontend | No soft paywall inline state |
| Frontend | No "credits remaining" progress bar in the gift flow |

---

## 4. Credit Representation

> **Design decision:** Credits are stored and transacted as **integer "units"** to avoid float rounding bugs. All existing RPCs already use `numeric`; we will add a `CHECK` constraint and convert all business rules to unit arithmetic.

| Concept | Public-facing | Internal Units | Notes |
|---|---|---|---|
| 1 credit | 1 credit | 2 units | Display layer divides by 2 |
| Gift recommendation | 1 credit | 2 units | `p_amount = 2` |
| AI message draft | 0.5 credits | 1 unit | `p_amount = 1` |
| Signal Check | 0.5 credits | 1 unit | `p_amount = 1` |
| Relationship insight | FREE | 0 units | Always free; uses Groq |
| Add recipient / memory | FREE | 0 units | No AI call |
| Monthly free allocation | 15 credits | 30 units | Issued as one `free_monthly` batch |
| Referral Signal Check bonus | 1 credit | 2 units | Awarded as `referral_bonus` batch |

> **Why not 0.5?** PostgreSQL `numeric` can express 0.5 but cascading float comparisons across the application layer (TypeScript, JS) introduce risk. Using integer units means all arithmetic is safe integer math. The display layer multiplies/divides by 2 to show "0.5 credits" where needed.

**Migration path for existing data:** Existing batches have `credits_remaining` in "credits" (1 credit = 1 unit historically). The migration must double all existing `credits_remaining` and `credits_purchased` values and update both RPCs to expect units. This PRD recommends the **doubling approach** for correctness with a single migration.

---

## 5. Data Model Changes

### 5.1 `credit_batches` — New Columns

```sql
ALTER TABLE public.credit_batches
  ADD COLUMN IF NOT EXISTS batch_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (batch_type IN ('free_monthly', 'paid', 'referral_bonus', 'free_signup', 'admin_grant')),
  ADD COLUMN IF NOT EXISTS credit_month TEXT;  -- 'YYYY-MM', only set for free_monthly batches

-- Unique constraint: only one active free_monthly batch per user per month
CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_one_free_monthly_per_month
  ON public.credit_batches (user_id, credit_month)
  WHERE batch_type = 'free_monthly';
```

This index is the single enforcement point that prevents duplicate free-credit issuance for the same month.

### 5.2 `credit_action_ledger` — New Table (idempotency)

```sql
CREATE TABLE IF NOT EXISTS public.credit_action_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id    TEXT NOT NULL,           -- caller-supplied idempotency key
  action_type  TEXT NOT NULL,           -- 'gift_generation', 'signal_check', 'message_draft'
  units        INTEGER NOT NULL,        -- how many units were deducted
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'committed', 'refunded')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_id)
);
```

This table makes every deduct/refund pair idempotent: if `action_id` already exists with `status = 'committed'`, a duplicate deduction request is a no-op returning the cached result.

### 5.3 Modify `deduct_user_credit` RPC

**Additions:**
- Accept `p_action_id TEXT` (optional) for idempotency
- Accept `p_action_type TEXT` for ledger logging
- Check `credit_action_ledger` first; if already committed, return cached result
- Enforce FIFO and expiry (unchanged)

### 5.4 Modify `refund_user_credit` RPC

**Additions:**
- Accept `p_action_id TEXT` to reference `credit_action_ledger`
- Update ledger status to `'refunded'` atomically
- Guard against double-refund via ledger (in addition to existing transaction-level guard)

### 5.5 New RPC: `issue_free_monthly_credits(p_user_id UUID)`

```sql
-- Returns: { issued: boolean, units: integer, batch_id: uuid, credit_month: text }
-- Idempotent: if a free_monthly batch for this month already exists, returns it without inserting
```

Algorithm:
1. Compute `credit_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`.
2. Check for existing batch with `batch_type = 'free_monthly' AND credit_month = credit_month AND user_id = p_user_id`.
3. If found → return `{ issued: false }` (already issued this month).
4. If not found → insert new batch: `credits_purchased = 30, credits_remaining = 30, batch_type = 'free_monthly', credit_month = credit_month, expires_at = first day of next month at 00:00 UTC`.
5. Mark any old `free_monthly` batches for this user as `is_expired = true` (leftover non-rollover enforcement).
6. Update `users.credits_balance`.
7. Return `{ issued: true, units: 30, ... }`.

> **Timezone:** All monthly resets use **UTC midnight on the 1st of the month**. Document this clearly in developer notes; the cron uses IST (18:30 UTC) for expiry warnings but UTC is canonical for billing resets.

### 5.6 `platform_settings` — New Keys

| Key | Default | Description |
|---|---|---|
| `free_monthly_units` | `30` | Monthly free allocation in units (= 15 credits) |
| `gift_generation_units` | `2` | Cost in units per gift recommendation |
| `message_draft_units` | `1` | Cost in units per AI message draft |
| `signal_check_units` | `1` | Cost in units per Signal Check |
| `relationship_insight_units` | `0` | Always free |
| `free_tier_provider_chain` | `["groq-llama","gemini-flash","claude-haiku"]` | JSON array |
| `referral_reward_units` | `2` | Units awarded per successful referral |

This extends the existing `platform_settings` pattern used in `signal-check/index.ts`.

---

## 6. Monthly Free Credit Issuance

### 6.1 Issuance Strategy: On-Demand

Use **on-demand issuance** triggered by user activity, not a scheduled batch job.

**Rationale:**
- A daily cron that issues credits for every user would be expensive and fragile.
- On-demand is simpler, cheaper, and self-healing: if a user is inactive for a month, they get fresh credits the next time they open the app.
- The unique index on `(user_id, credit_month)` makes it safe to call multiple times.

**Trigger points:** Call `issue_free_monthly_credits(user_id)` inside:
1. `generate-gifts` — before the preflight balance check (spark plan only).
2. `signal-check` — before the preflight balance check (spark/thoughtful plan only).
3. New endpoint `ensure-monthly-credits` — called from Dashboard on mount.

### 6.2 Rules

- **Only for free-tier (`spark`) users.** Paid plan users get credits via purchase flow.
- **Only once per calendar month per user.** Enforced by the unique index.
- **Non-rollover.** When a new monthly batch is issued, prior `free_monthly` batches are immediately marked `is_expired = true`.
- **Race condition protection:** The unique index + `ON CONFLICT DO NOTHING` in the RPC prevents concurrent double-issuance.

### 6.3 Expiry Semantics

| Batch type | Expiry logic |
|---|---|
| `free_monthly` | Expires on the 1st of next month at 00:00 UTC |
| `paid` — Thoughtful | 30 days from purchase |
| `paid` — Confident | 60 days from purchase |
| `paid` — Gifting Pro | 90 days from purchase |
| `referral_bonus` | 14 days from award |
| `free_signup` | 7 days from signup |

The existing `run_credit_expiry()` cron handles marking batches expired and recalculating `users.credits_balance`. No change needed — it will handle `free_monthly` batches automatically.

---

## 7. Action Pricing & Provider Routing

### 7.1 Credit Cost per Action

| Action | Units Deducted | Display (credits) | AI Call? |
|---|---|---|---|
| Gift recommendation | 2 | 1 credit | Yes |
| AI message draft | 1 | 0.5 credits | Yes |
| Signal Check | 1 | 0.5 credits | Yes |
| Relationship insight | 0 | Free | Yes (Groq always) |
| Add recipient | 0 | Free | No |
| Add memory note | 0 | Free | No |

### 7.2 Updated `getProviderChain` Logic

```typescript
export function getProviderChain(
  plan: string,
  operation: "gift-generation" | "signal-check" | "message-draft" | "relationship-insight"
): Provider[] {
  const FREE_TIER_CHAIN: Provider[] = ["groq-llama", "gemini-flash", "claude-haiku"];

  // Relationship insight is always free to user, always cheapest route
  if (operation === "relationship-insight") {
    return FREE_TIER_CHAIN;
  }

  // Signal Check: route by plan instead of hardcoding expensive providers
  if (operation === "signal-check") {
    if (plan === "gifting-pro") return ["claude-sonnet", "claude-haiku", "gemini-flash"];
    if (plan === "confident")   return ["claude-haiku", "gemini-flash", "groq-llama"];
    return FREE_TIER_CHAIN; // spark + thoughtful
  }

  // Gift generation and message draft: plan-based routing (unchanged for paid)
  switch (plan) {
    case "gifting-pro": return ["claude-sonnet", "claude-haiku", "gemini-pro"];
    case "confident":   return ["claude-haiku", "gemini-flash", "groq-llama"];
    case "thoughtful":  return ["gemini-flash", "claude-haiku", "groq-llama"];
    case "spark":
    default:            return FREE_TIER_CHAIN;
  }
}
```

**"Fail" definition (already implemented in `callAIWithFallback`):**
- HTTP 429 → rate_limit (triggers fallback)
- HTTP 408, 504 → timeout (triggers fallback)
- HTTP 5xx → api_error (triggers fallback)
- Network failure (AbortSignal) → network_error (triggers fallback)
- Empty/unparseable response → invalid_response (triggers fallback)
- HTTP 401, 403 on key config → config error (triggers fallback)

No changes needed to `callAIWithFallback` itself.

### 7.3 Deduction Flow for Each Paid Action

```
1. Preflight: Check users.credits_balance >= required_units
   → If insufficient, return 402 with:
     { error: "NO_CREDITS", next_reset: <date>, show_upgrade: true, upgrade_to: "thoughtful" }

2. (spark plan only) Call issue_free_monthly_credits(user_id)
   → Issues 30 units if new month; no-op if already issued

3. Deduct via deduct_user_credit(user_id, session_id, units, action_id, action_type)
   → FIFO from oldest eligible batch
   → Idempotent: same action_id → returns cached result

4. Call AI via callAIWithFallback(getProviderChain(plan, operation), params)
   → Log: provider chosen, fallback path, latency, attempt number

5a. On success → persist result, return 200 with { credits_remaining, provider, latency_ms }

5b. On failure → refund_user_credit(user_id, session_id, units, action_id)
      → Idempotent refund (ledger prevents double-refund)
      → Return structured error code
```

### 7.4 Relationship Insight — Always Free

- Never calls `deduct_user_credit`.
- Always uses `getProviderChain(plan, "relationship-insight")` → free tier chain.
- Available even when `users.credits_balance === 0`.
- No plan restriction.

---

## 8. Three-Layer Enforcement

### 8.1 UI Layer

**Credit balance display:**
- Show credits: `Math.floor(balance / 2)` whole credits; `balance % 2 === 1` → show "½ credit available."
- Progress bar: `(balance / monthlyAllocationUnits) * 100%` for free tier.
- Reset banner: "Resets on [date]" from nearest `free_monthly` batch `expires_at`.

**Per-action cost labels on buttons:**
- Gift Recommend: badge showing "1 credit"
- Message Draft: badge showing "0.5 credits"
- Signal Check: badge showing "0.5 credits"
- Relationship Insight: badge showing "Free ✨"

**Button gating:**
```typescript
const canAfford = (requiredUnits: number) => balance >= requiredUnits;

disabled={!canAfford(2)}  // gift recommendation
disabled={!canAfford(1)}  // signal check, message draft
// Relationship insight button: never disabled
```

Do **not** hide buttons — disable them and show cost so users understand.

**Soft paywall inline state (when `balance === 0`):**
- Show below disabled buttons: *"You're out of credits until May 1st. Resets in 7 days."*
- Upgrade nudge: *"Get unlimited credits for $5/month →"*
- Free actions remain fully enabled and visually distinct.

### 8.2 Edge Function Layer

For every paid AI edge function, enforce in order:
1. Auth check (401 if no valid JWT).
2. Load `users.active_plan` and `credits_balance`.
3. (spark only) Call `issue_free_monthly_credits`.
4. Preflight balance check → 402 if insufficient:

```json
{
  "error": "NO_CREDITS",
  "message": "You're out of credits for this month.",
  "next_reset": "2026-05-01T00:00:00Z",
  "show_upgrade": true,
  "upgrade_to": "thoughtful"
}
```

5. Deduct → AI → refund on failure.

**HTTP status codes by situation:**

| Situation | Status | Error code |
|---|---|---|
| Insufficient credits | 402 | `NO_CREDITS` |
| Plan restricted | 403 | `PLAN_RESTRICTED` |
| Rate limited | 429 | `RATE_LIMITED` |
| AI timeout | 504 | `AI_TIMEOUT` |
| AI invalid response | 502 | `AI_INVALID_RESPONSE` |
| AI unavailable (5xx) | 502 | `AI_UNAVAILABLE` |
| AI busy (429 from provider) | 429 | `AI_BUSY` |

### 8.3 Database Layer (Final Gate)

`deduct_user_credit()` is unbypassable:
- Holds row lock on `users` (`FOR UPDATE`) — prevents concurrent race.
- Holds row locks on each `credit_batch` (`FOR UPDATE`) — prevents overdraft.
- Returns `{ success: false, error: "Insufficient credits" }` after lock — cannot be bypassed.
- Checks `expires_at > now()` AND `is_expired = false` — expired credits cannot be spent.
- Checks `credit_action_ledger` for duplicate `action_id`.

RLS on `credit_batches` prevents direct UPDATE by authenticated users — `credits_remaining` updates go through the SECURITY DEFINER RPC only.

---

## 9. Soft Paywall Behaviour

When `balance === 0` for a free-tier (`spark`) user:

| Action | Behaviour |
|---|---|
| Gift recommendation | Button disabled. Inline: "You're out of credits until [date]. Resets in X days." + upgrade CTA. |
| Signal Check | Same as above. |
| AI message draft | Same as above. |
| Relationship insight | ✅ Fully available. |
| Add recipient | ✅ Fully available. |
| Add memories | ✅ Fully available. |
| Dashboard | Loads normally. Credit banner shows reset date. |
| Past gift history | ✅ Fully available. |

**Copy guidelines:**
- Say "You're out of credits until [date]" — not "Your account is blocked."
- Say "Insights and saving memories are still free." — reinforce value.
- Upgrade CTA: subtle link/button, not a blocking modal.

**Progress bar:**
```
Credits this month:
▓▓▓▓▓░░░░░  5 / 15 credits used
Resets in 7 days
```
Display: `Math.floor(balance / 2)` credits remaining out of 15.

---

## 10. Referral Bonus

### 10.1 Current State

- **`process-referral`**: New user gets 2 bonus credits (+3 from signup = 5 total) on signup.
- **`award-referral-credits`**: Referrer gets 3 credits when referred user completes first session.

Both use `credits_awarded` flag for idempotency.

### 10.2 New Requirement: 1 Signal Check Bonus for Referrer

When a **referrer** successfully refers a friend (referred user completes first gift session):
- Award the referrer **1 credit = 2 units** (= 1 free Signal Check).
- Store as `referral_bonus` batch, 14-day expiry.
- Display: *"🎉 Referral bonus — 1 free Signal Check earned."*

**Change in `award-referral-credits`:**
```typescript
// Read from platform_settings instead of hardcoding:
const referralRewardUnits = await loadSetting("referral_reward_units", 2);
```

**Idempotency:** Existing `credits_awarded = false` gate prevents double-award. No change needed.

### 10.3 UI Display for Referral Bonus

- **Credit History tab:** *"🎉 Referral bonus — 1 free Signal Check earned from referring [friend]."*
- **Dashboard:** One-time toast after referral completes: *"Your referral rewarded you 1 free Signal Check!"*

---

## 11. Observability

### 11.1 Structured Log Events (Edge Functions)

| Event | Fields |
|---|---|
| `ai_provider_selected` | `{ provider, plan, operation, session_id }` |
| `ai_fallback_taken` | `{ primary_provider, fallback_provider, failure_reason, attempt_number }` |
| `ai_provider_failed` | `{ provider, error_type, http_status, session_id }` |
| `credit_deducted` | `{ user_id, units, action_type, batch_id, remaining_balance }` |
| `credit_refunded` | `{ user_id, units, reason, action_id, new_balance }` |
| `credit_deduction_failed` | `{ user_id, required_units, available_units, reason }` |
| `monthly_credits_issued` | `{ user_id, units, credit_month, expires_at }` |
| `monthly_credits_already_exist` | `{ user_id, credit_month }` |
| `no_credits_gate_hit` | `{ user_id, action_type, balance }` |

Wire into PostHog analytics where the project already uses it. Otherwise use structured console logs compatible with Supabase log drains.

---

## 12. UX Requirements

### 12.1 Gift Flow

In `GiftFlow.tsx`, Step 5 (AI trigger):
- Before triggering AI: *"This will use 1 credit."*
- After success: *"✅ 1 credit used. X credits remaining."*
- On AI failure: *"Credit refunded. Please try again."*

### 12.2 Credits Page

Update `Credits.tsx`:
- Balance: `Math.floor(balance / 2)` credits (not raw units).
- Progress bar: % of monthly allocation used.
- Monthly reset date from `free_monthly` batch `expires_at`.
- Per-action cost table: Gift Recommendation / Signal Check / Message Draft / Free actions.
- Referral bonus transactions with friendly copy.

### 12.3 Dashboard Banner

Persistent-but-dismissible banner (spark users only):
- *"X credits left this month — resets in Y days"*
- Disappears when dismissed, reappears next session. Hidden for paid plan users.

### 12.4 Low-Credit Upgrade Nudge

When `balance < 4` units for spark users:
- *"Running low on credits. Get unlimited sessions for $5/month →"*
- Not a modal. Links to Credits page.

---

## 13. Implementation Plan

### Phase 1 — Database

**Migration file:** `20260425000000_credit_units_freemium_monthly.sql`

1. Add `batch_type` column to `credit_batches` with CHECK + backfill existing rows.
2. Add `credit_month` column to `credit_batches`.
3. Create unique index `credit_batches_one_free_monthly_per_month`.
4. Create `credit_action_ledger` table.
5. Double all existing `credits_purchased` and `credits_remaining` in `credit_batches`.
6. Double `users.credits_balance` for all users.
7. Update `deduct_user_credit` RPC (add `p_action_id`, `p_action_type`, ledger check).
8. Update `refund_user_credit` RPC (add `p_action_id`, update ledger).
9. Create `issue_free_monthly_credits` RPC.
10. Insert new `platform_settings` keys with defaults.

### Phase 2 — Edge Functions

1. **`_shared/ai-providers.ts`** — Update `getProviderChain`. Add `message-draft` and `relationship-insight` operation types.
2. **`signal-check/index.ts`** — Use `signal_check_units` from settings. Free-tier routing via updated `getProviderChain`.
3. **`generate-gifts/index.ts`** — Add inline credit deduction before AI call. Add `issue_free_monthly_credits` for spark. Add refund on AI failure.
4. **`award-referral-credits/index.ts`** — Use `referral_reward_units` from `platform_settings`.
5. **New: `ensure-monthly-credits/index.ts`** — Thin authenticated endpoint calling `issue_free_monthly_credits`. Called from Dashboard on mount.

### Phase 3 — Frontend

1. **`useCredits.ts`** — Add `creditsDisplay`, `monthlyBatch`, `resetDate`, `isFreeTier`. Call `ensure-monthly-credits` on mount for spark users.
2. **`Credits.tsx`** — Update balance display, add progress bar, per-action cost table.
3. **`GiftFlow.tsx`** — Add credit cost indicators, refund notification on failure.
4. **`Dashboard.tsx`** — Add dismissible credit status banner.
5. **New: `SoftPaywall.tsx`** — Reusable inline component showing reset date and upgrade CTA.
6. **Action buttons** — Wrap with `canAfford(requiredUnits)` guard.

### Phase 4 — Tests

| Test | Coverage |
|---|---|
| `issue_free_monthly_credits` first call | Issues 30 units |
| `issue_free_monthly_credits` same month | Returns `{ issued: false }`, no duplicate |
| `issue_free_monthly_credits` new month | Issues new batch, marks old free_monthly expired |
| `deduct_user_credit` FIFO | Oldest batch deducted first |
| `deduct_user_credit` expired batch skip | Does not use expired batch |
| `deduct_user_credit` insufficient balance | Returns `{ success: false }` |
| `deduct_user_credit` 2 units for gift | Correct deduction |
| `deduct_user_credit` 1 unit for signal check | Correct deduction |
| `deduct_user_credit` 0 units for relationship insight | No deduction |
| `refund_user_credit` after AI failure | Restores units to correct batch |
| `refund_user_credit` double refund | Returns `{ already_refunded: true }` |
| `deduct_user_credit` same action_id | Returns cached result, no double-charge |
| `getProviderChain` spark gift-generation | `["groq-llama", "gemini-flash", "claude-haiku"]` |
| `getProviderChain` spark signal-check | `["groq-llama", "gemini-flash", "claude-haiku"]` |
| `getProviderChain` relationship-insight any plan | Always returns free chain |
| `callAIWithFallback` primary fails | Uses second provider |
| `callAIWithFallback` all fail | Throws `AIFallbackError` |
| `generate-gifts` zero balance | Returns 402 `NO_CREDITS` |
| `signal-check` zero balance | Returns 402 `NO_CREDITS` |
| `award-referral-credits` idempotent | Second call does not double-award |
| `SoftPaywall.tsx` zero balance | Shows reset date, upgrade CTA |
| `SoftPaywall.tsx` free actions | Relationship insight button not disabled |

---

## 14. Developer Notes

### Credit Unit System

```
1 credit (user-facing) = 2 units (database)

Gift Recommendation: p_amount = 2
Signal Check:        p_amount = 1
AI Message Draft:    p_amount = 1
Relationship Insight: p_amount = 0 (no deduction)
Monthly free grant:  30 units issued (= 15 credits displayed)

Display conversion:
  credits_display = Math.floor(units / 2)
  has_half_credit = units % 2 === 1
```

### Monthly Reset Semantics

- **Timezone:** UTC. Reset at `date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month'`.
- **Credit month key format:** `'YYYY-MM'` (e.g. `'2026-05'`).
- **On-demand issuance:** `issue_free_monthly_credits` is called at start of first credit-consuming action each month — not via scheduled job.
- **Leftover credits do not roll over:** Prior `free_monthly` batches are expired when new batch is issued.
- **Paid credits are unaffected by monthly reset.**

### Provider Fallback Order (Free Tier)

```
Primary:    Groq Llama 70B    (groq-llama)
Fallback 1: Gemini 2.5 Flash  (gemini-flash)
Fallback 2: Claude Haiku      (claude-haiku)
```

"Fail" = quota exceeded, timeout, network failure, 5xx, empty/invalid response, model unavailable.

### Refund / Idempotency

- Every credit-consuming AI action must be initiated with a unique `action_id` (format: `"${session_id}:${operation}:${timestamp_ms}"`).
- `credit_action_ledger.action_id` unique constraint prevents duplicate deductions.
- `refund_user_credit` checks ledger status — if `status = 'refunded'` already, returns `{ already_refunded: true }`.
- **Client retries must reuse the same `action_id`** to avoid double-charging.

---

## 15. Open Questions for Product Review

> [!IMPORTANT]
> These decisions need sign-off before implementation begins.

1. **Unit migration for existing users:** Double existing `credits_remaining` (recommended) or keep a compatibility column?

2. **Referral reward change:** `award-referral-credits` currently gives 3 credits to referrer. PRD proposes 2 units (1 credit). Does the product agree to reduce the referral reward?

3. **Signal Check plan gating:** `signal-check/index.ts` currently blocks `spark` users entirely (`ALLOWED_PLANS = ["confident", "gifting-pro"]`). The PRD removes this gate and replaces it with credit-only enforcement. Confirm this is the intent.

4. **`generate-gifts` inline deduction:** Currently the client calls `deduct-credit` after `generate-gifts` succeeds, creating a window for credit loss on client crash. Move deduction inside `generate-gifts`? (Recommended: yes.)

5. **Upgrade CTA target:** Soft paywall says "$5/month." Which plan? Thoughtful ($2.99/30-day) or Confident ($5.99/60-day)?

---

## 16. Acceptance Criteria

- [ ] Free-tier (`spark`) users receive 30 units (15 credits) at start of each calendar month.
- [ ] No user can receive two free monthly batches in the same calendar month.
- [ ] Prior month's leftover free credits are unusable after new batch is issued.
- [ ] Gift recommendation deducts exactly 2 units; UI shows "1 credit used."
- [ ] Signal Check deducts exactly 1 unit; UI shows "0.5 credits used."
- [ ] AI message draft deducts exactly 1 unit; UI shows "0.5 credits used."
- [ ] Relationship insight deducts 0 units and is available even when balance is 0.
- [ ] Adding a recipient or memory deducts 0 units.
- [ ] Failed AI call (any error type) triggers automatic refund.
- [ ] Retrying a failed action with the same `action_id` does not double-charge.
- [ ] `deduct_user_credit` rejects when balance is insufficient even if called directly via RPC.
- [ ] Free-tier AI actions route to Groq → Gemini Flash → Claude Haiku.
- [ ] Signal Check on `spark` plan routes to free-tier chain.
- [ ] Relationship insight always uses free-tier chain regardless of plan.
- [ ] 402 responses include `next_reset`, `show_upgrade`, and user-friendly `message`.
- [ ] UI shows remaining credits and reset date clearly.
- [ ] Paid action buttons are disabled (not hidden) when balance < required units.
- [ ] Soft paywall shows reset date and upgrade CTA without blocking navigation or free actions.
- [ ] Referral bonus awards 2 units (1 credit) idempotently per completed referral.
- [ ] All credit events (deduction, refund, issuance, gate hits) are logged with structured fields.
