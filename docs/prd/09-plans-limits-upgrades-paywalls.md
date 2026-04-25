# PRD 09 — Plans, Limits, Upgrades, and Paywalls

**Feature Name:** Plans, Limits, Upgrades, and Paywalls  
**Document Status:** Draft · v1.0  
**Author:** Engineering (staff product-engineer + senior designer)  
**Date:** 2026-04-25  
**Owner:** @pratikbrahmapurkar  
**Depends On:** PRD 08 (Credits Wallet & Deduction Rules)  

---

## 1. Overview

### 1.1 What This Document Covers

This is the **foundational system PRD** for GiftMind (soon-renamed Kinfold) that defines exactly two plan tiers, how limits are enforced across every layer of the application (UI → Edge Function → Database), how upgrade flows and paywalls are presented throughout the app, and how plan state influences the entire product experience — from the first signup to the moment a user hits a limit and decides what to do next.

Every feature in GiftMind touches plan state. The gift flow checks credit balance before generating recommendations. The Signal Check feature checks plan entitlements. The recipient list enforces a count cap. The product affiliate links gate store access by plan. Occasion reminders require plan-level unlocking. This PRD is the **single source of truth** for all of those interactions — not the individual feature PRDs, which should reference this document for plan-gating logic.

### 1.2 The Plan Philosophy — Why ONE Free Plan + ONE Coming-Soon Paid Plan

GiftMind is **pre-product-market-fit**. At this stage, optimising for conversion is premature and actively harmful. The primary goals for the next 3–6 months are:

1. **Retention** — users who come back every time they need a gift
2. **Word-of-mouth growth** — users who tell a friend because the product helped them
3. **Signal collection** — learning which features are valued enough that people would pay

Hard paywalls kill virality. If a user hits a wall after their second gift and can't continue without paying, they leave — and they don't tell a friend. Multiple tiers (the old Spark / Thoughtful / Confident / Gifting Pro structure) create decision paralysis at signup and complicate messaging ("which plan do I need for Signal Check?"). Credits-per-purchase bundles feel transactional, not relational.

**The new model is radically simpler:**

| | Free Plan — "Spark ✨" | Paid Plan — "Pro 🎯" |
|---|---|---|
| Status | **Active** — available at launch | **Coming Soon** — waitlist only |
| Price | $0 forever | $5.99/month flat subscription |
| Credits | 15 credits/month (auto-refresh) | Unlimited |
| Features | ALL features available | ALL features + no limits |
| Hard blocks | None — soft limits only | None |
| Model | Generous free tier | "Remove all friction" tier |

**Why "Coming Soon" instead of launching Pro immediately:**

- Collecting waitlist sign-ups lets us **measure willingness-to-pay** before building payment infrastructure (Stripe subscriptions, billing portal, invoice PDFs, tax compliance).
- 100+ waitlisters is the threshold to greenlight the Payments PRD.
- "Coming Soon" creates anticipation and validates the $5.99 price point via the waitlist form ("Would you pay $5.99/month? Yes/No/Maybe at $X").
- One free plan = simpler engineering, simpler onboarding copy, simpler support.

**Why subscription (not credit packs):**

The legacy system sold credit bundles (Thoughtful = 25 sessions for $2.99, Confident = 75 for $5.99). This is being replaced with a flat monthly subscription because:
- Predictable monthly revenue is easier to forecast
- Users don't have to calculate "how many credits do I need?"
- "Unlimited" is a stronger psychological motivator than "75 sessions"
- Subscription churn metrics are industry-standard; credit-pack LTV is harder to benchmark

### 1.3 Where This Feature Fits

This is **infrastructure, not a feature users see as a "feature"**. It is the invisible skeleton that every visible feature leans on. It touches:
- Auth/signup (plan assignment on user creation)
- Dashboard (credit display, plan badge, upgrade prompts)
- Gift flow (credit deduction, limit checks)
- Signal Check (plan entitlement, credit deduction)
- My People / Recipients (count limits)
- Product links (store access gating)
- Occasion reminders (plan-based unlocking)
- Credits page (balance, history, upgrade CTA)
- Settings / Profile (plan badge, manage subscription placeholder)
- Admin hub (plan management, user plan overrides)

### 1.4 Scope — What's IN

- Plan definitions: Free (Spark) + Pro (Coming Soon)
- Credit allocation rules: 15 credits/month auto-refresh for free tier
- Limit enforcement at 3 layers: UI, Edge Function (API), Database
- "Coming Soon" upgrade flow with email waitlist
- Paywall UI patterns across the entire app
- Plan badges and visual hierarchy throughout the product
- Rate limiting: graceful degradation, not hard blocks
- Upgrade prompts, locked-feature indicators, and contextual nudges
- Legacy plan migration logic: collapsing 4 tiers → 2
- Refer-to-earn-credits as an alternative to paying
- `plan_waitlist` database table for Pro interest tracking
- Analytics events for every plan interaction

### 1.5 Non-Goals (NOT in This PRD)

- Payment processing / Stripe integration (separate Payments PRD — triggered when waitlist hits 100+)
- Credit deduction mechanics (PRD 08: Credits Wallet & Deduction Rules)
- Specific feature paywall details (e.g., Signal Check internals → PRD 06)
- Multi-currency support (locked to USD)
- Tax / billing / invoicing (V2 when Pro launches)
- Team / family plans (V2)
- Gift-a-subscription (V2)
- Lifetime deals (V2)
- Affiliate revenue sharing (separate PRD)
- Annual plans / discount (V2)
- Promo codes / discounts (V2)

---

## 2. Existing Implementation Audit

### 2.1 Database Layer — Current State

| Entity | File / Object | Status | Relevance |
|---|---|---|---|
| `public.users.active_plan` | Column (text) | ✅ Exists | Stores `'spark'`, `'thoughtful'`, `'confident'`, `'gifting-pro'` |
| `public.users.credits_balance` | Column (numeric) | ✅ Exists | Cached balance in units |
| `public.credit_batches` | Table | ✅ Exists | Has `batch_type`, `credit_month` (from PRD 08 migration) |
| `public.credit_transactions` | Table | ✅ Exists | Full transaction ledger |
| `public.credit_action_ledger` | Table | ✅ Exists | Idempotency for deductions (from PRD 08) |
| `public.platform_settings` | Table | ✅ Exists | Runtime config (`free_monthly_units`, `gift_generation_units`, etc.) |
| `public.referrals` | Table | ✅ Exists | Referral tracking with `credits_awarded` flag |
| `public.recipients` | Table | ✅ Exists | User's saved people |
| `check_recipient_limit()` | Trigger function | ✅ Exists | Enforces plan-based count limits via CASE on `active_plan` |
| `handle_new_user()` | Trigger function | ✅ Exists | Sets `credits_balance = 3` and `active_plan` defaults to `'spark'` |
| `deduct_user_credit()` | RPC | ✅ Exists | FIFO deduction with action_id idempotency |
| `refund_user_credit()` | RPC | ✅ Exists | Batch-level refund with ledger |
| `issue_free_monthly_credits()` | RPC | ✅ Exists | Monthly 30-unit issuance for spark users |
| `run_credit_expiry()` | Cron function | ✅ Exists | Daily expiry sweep |

**Key gaps:**
- `active_plan` accepts any text — no CHECK constraint limiting to valid slugs
- `handle_new_user()` still sets `credits_balance = 3` (should be 0; monthly credits handle the grant now)
- `check_recipient_limit()` references all 4 old tiers in its CASE statement
- No `plan_waitlist` table for Pro interest tracking
- No `plan_history` table for tracking plan changes over time

### 2.2 Frontend Layer — Current State

| File | Status | Issue |
|---|---|---|
| `src/lib/plans.ts` | ✅ Exists | Defines `PlanKey = "spark" \| "thoughtful" \| "confident" \| "gifting-pro"` with 4-tier `PLAN_CONFIG` |
| `src/lib/geoConfig.ts` | ✅ Exists | Has full 4-plan `PLANS` object with pricing, features, locked features |
| `src/lib/planLimits.ts` | ✅ Exists | Maps all 4 plans to recipient limits |
| `src/hooks/useUserPlan.ts` | ✅ Exists | Returns plan + limits from `PLAN_CONFIG` |
| `src/hooks/usePlanLimits.ts` | ✅ Exists | Returns plan from `PLANS` (geoConfig) — **duplicate of useUserPlan** |
| `src/hooks/useCredits.ts` | ✅ Exists | Credit balance, monthly batch, reset logic |
| `src/components/pricing/PricingCards.tsx` | ✅ Exists | Renders 4 plan cards with PayPal buy buttons |
| `src/components/pricing/UpgradeModal.tsx` | ✅ Exists | Modal wrapping PricingCards + PaymentMethodModal |
| `src/components/pricing/PaymentMethodModal.tsx` | ✅ Exists | PayPal checkout flow tied to `credit_packages` table |
| `src/components/credits/SoftPaywall.tsx` | ✅ Exists | Shows "out of credits" message with reset date |
| `src/components/credits/BuyCreditsTab.tsx` | ✅ Exists | Plan purchase cards on /credits page |
| `src/pages/Credits.tsx` | ✅ Exists | Full credits page with balance, batches, buy/history tabs |

**Key gaps / issues:**
- **Two competing plan config sources:** `plans.ts` and `geoConfig.ts` both define plan configurations — need to consolidate into one
- **4 tiers everywhere** — all plan configs, UI components, and upgrade logic reference Thoughtful and Gifting Pro
- **PricingCards** shows PayPal buy buttons — needs to become "Coming Soon" + waitlist for Pro
- **UpgradeModal** triggers PayPal checkout — needs to become waitlist capture
- **No plan badge component** — plan identity is not surfaced in navigation or profile
- **usePlanLimits** and **useUserPlan** are near-duplicates with different data sources
- **SoftPaywall** copy says "Get unlimited sessions" and links to /credits (buy tab) — wrong for new model
- **No waitlist UI** — no form, no confirmation, no admin view

### 2.3 Edge Function Layer — Current State

| Function | Plan Awareness | Notes |
|---|---|---|
| `generate-gifts` | Reads `active_plan` for provider routing | Does not enforce plan-based feature limits |
| `signal-check` | Has `ALLOWED_PLANS` gate | Currently blocks spark/thoughtful users entirely |
| `deduct-credit` | None — deducts for any plan | Thin RPC wrapper |
| `ensure-monthly-credits` | Calls `issue_free_monthly_credits` | Only issues for spark plan |
| `award-referral-credits` | None | Awards regardless of plan |
| `paypal-checkout` | Reads `credit_packages` table | Tied to old bundle model |

**Key gaps:**
- `signal-check` hard-blocks free users — should be credit-gated, not plan-gated (per PRD 08 decision)
- No edge function for waitlist submission
- `paypal-checkout` is tied to credit bundles — will need replacement when Pro launches (out of scope for this PRD)

### 2.4 Summary: What Must Change

| Area | Change Required |
|---|---|
| `src/lib/plans.ts` | Remove `thoughtful` and `gifting-pro`. Add `pro` as coming-soon. Consolidate with geoConfig |
| `src/lib/geoConfig.ts` | Remove `thoughtful` and `gifting-pro` plan entries. Simplify upgrade helpers |
| `src/lib/planLimits.ts` | Simplify to 2 plans |
| `src/hooks/usePlanLimits.ts` | Merge into `useUserPlan.ts` — single hook for plan state |
| `src/hooks/useUserPlan.ts` | Add `isPro`, `isComingSoon`, `canUpgrade` flags |
| `src/components/pricing/*` | Replace 4-tier pricing cards with 2-plan comparison + waitlist |
| `src/components/credits/SoftPaywall.tsx` | Update copy for new model |
| `check_recipient_limit()` | Simplify CASE to spark/pro only |
| `handle_new_user()` | Set `credits_balance = 0` (monthly issuance handles the rest) |
| `signal-check` | Remove `ALLOWED_PLANS` gate, use credit-only enforcement |
| **New:** `plan_waitlist` table | Track Pro interest |
| **New:** `PlanBadge` component | Show plan identity in nav/profile |
| **New:** `UpgradeModal` (rewrite) | Coming Soon waitlist capture |
| **New:** `/api/join-waitlist` edge function | Waitlist submission endpoint |

---

## 3. Plan Definitions

### 3.1 Free Plan — Spark ✨

The generous free tier designed for retention, not conversion.

| Attribute | Value |
|---|---|
| Slug | `spark` |
| Display name | Spark ✨ |
| Price | $0 forever |
| Monthly credits | 15 (30 internal units) |
| Credit reset | 1st of each month, UTC midnight |
| Rollover | No — unused credits expire |
| Recipients (saved profiles) | 5 |
| Regenerations per session | 2 |
| Signal Check | ✅ Available (costs 0.5 credits) |
| AI Message Draft | ✅ Available (costs 0.5 credits) |
| Relationship Insight | ✅ Free (always) |
| Occasion Reminders | 2 active reminders |
| Store Access | All stores (Amazon, Flipkart, Etsy, etc.) |
| Batch Mode | ❌ Not available |
| Priority AI (Claude Sonnet) | ❌ Not available |
| History Export | ❌ Not available |
| AI Provider Chain | Groq → Gemini Flash → Claude Haiku |

> **Design philosophy:** Free users should be able to complete the full gift-giving workflow — find a gift, check confidence, draft a message, buy through an affiliate link — without ever hitting a hard wall. Limits exist to encourage return visits (monthly reset) and create upgrade desire (higher limits on Pro), but never to frustrate or block.

### 3.2 Pro Plan — Confident 🎯 (Coming Soon)

The "remove all friction" tier for power gifters.

| Attribute | Value |
|---|---|
| Slug | `pro` |
| Display name | Pro 🎯 |
| Price | $5.99/month (subscription) |
| Credits | Unlimited |
| Recipients | Unlimited |
| Regenerations per session | Unlimited |
| Signal Check | ✅ Unlimited |
| AI Message Draft | ✅ Unlimited |
| Relationship Insight | ✅ Free |
| Occasion Reminders | Unlimited |
| Store Access | All stores |
| Batch Mode | ✅ Available |
| Priority AI (Claude Sonnet) | ✅ Available |
| History Export | ✅ Available |
| AI Provider Chain | Claude Sonnet → Claude Haiku → Gemini Flash |
| Launch status | **Coming Soon — waitlist only** |

> **Note:** The slug `pro` is new. The old `confident` slug in the database will be migrated. Any user with `active_plan = 'confident'` will be mapped to `spark` (temporarily) via `normalizePlan()`, and then to `pro` when Pro launches.

### 3.3 Legacy Plan Mapping

All existing users on retired plans will be mapped to Spark:

| Old `active_plan` value | New mapping | Rationale |
|---|---|---|
| `spark` | `spark` | No change |
| `thoughtful` | `spark` | Tier removed; any purchased credits remain valid |
| `confident` | `spark` (for now) | Mapped as future pro candidates |
| `gifting-pro` | `spark` (for now) | Same |
| `NULL` / empty / unknown | `spark` | Default |

**Migration strategy:** A database migration will update `active_plan` for all users to `spark`. Their **purchased credit batches remain valid** and usable — only the plan label changes, not their credit balance.

### 3.4 Canonical Plan Configuration (Single Source of Truth)

Replace both `src/lib/plans.ts` and the plan section of `src/lib/geoConfig.ts` with a single unified config:

```typescript
// src/lib/plans.ts — SINGLE SOURCE OF TRUTH

export type PlanKey = "spark" | "pro";

export interface PlanConfig {
  slug: PlanKey;
  name: string;
  emoji: string;
  tagline: string;
  price: number;                    // USD per month, 0 for free
  isComingSoon: boolean;
  credits: number | "unlimited";    // monthly credits (display value, not units)
  recipients: number;               // -1 = unlimited
  regenerations: number;            // -1 = unlimited
  reminders: number;                // -1 = unlimited
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasPriorityAi: boolean;
  hasHistoryExport: boolean;
  storeAccess: "all";               // Both plans get all stores
  aiProviderTier: "free" | "priority";
  features: string[];               // Displayed in plan card
  proOnlyFeatures: string[];        // Shown with lock icon for spark
  badgeVariant: "default" | "pro";
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  spark: {
    slug: "spark",
    name: "Spark",
    emoji: "✨",
    tagline: "Everything you need to find the perfect gift",
    price: 0,
    isComingSoon: false,
    credits: 15,
    recipients: 5,
    regenerations: 2,
    reminders: 2,
    hasSignalCheck: true,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: "all",
    aiProviderTier: "free",
    features: [
      "15 credits/month (auto-refresh)",
      "5 saved profiles",
      "2 redos per gift",
      "Signal Check",
      "AI message drafts",
      "All stores",
      "Confidence scores",
    ],
    proOnlyFeatures: [
      "Unlimited credits",
      "Batch mode",
      "Priority AI",
      "History export",
    ],
    badgeVariant: "default",
  },
  pro: {
    slug: "pro",
    name: "Pro",
    emoji: "🎯",
    tagline: "Unlimited gifting for people who care deeply",
    price: 5.99,
    isComingSoon: true,
    credits: "unlimited",
    recipients: -1,
    regenerations: -1,
    reminders: -1,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: true,
    hasHistoryExport: true,
    storeAccess: "all",
    aiProviderTier: "priority",
    features: [
      "Unlimited credits",
      "Unlimited profiles",
      "Unlimited redos",
      "Signal Check",
      "AI message drafts",
      "Batch mode",
      "Priority AI (Claude Sonnet)",
      "Gift history export",
      "All stores",
    ],
    proOnlyFeatures: [],
    badgeVariant: "pro",
  },
};

export function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "spark") return "spark";
  if (plan === "pro") return "pro";
  // Legacy mappings — all collapse to spark for now
  return "spark";
}
```

---

## 4. Limit Enforcement — 3-Layer Model

Every limit is enforced at **three layers** to prevent bypass. The UI layer provides instant feedback. The Edge Function layer is the trust boundary. The Database layer is the final gate that cannot be bypassed even by direct API calls.

### 4.1 Layer 1 — UI (Optimistic Check)

**Purpose:** Instant user feedback. Prevent wasted API calls.

| Limit | Check | Behaviour When Hit |
|---|---|---|
| Credit balance | `balance < requiredUnits` | Disable action button + show inline SoftPaywall |
| Recipient count | `recipientCount >= plan.recipients` | Disable "Add person" button + show upgrade nudge |
| Regeneration count | `regenCount >= plan.regenerations` | Disable "Try again" button + show upgrade nudge |
| Reminder count | `reminderCount >= plan.reminders` | Disable "Set reminder" + show upgrade nudge |
| Batch mode | `!plan.hasBatchMode` | Show "Pro" lock badge on batch toggle |
| History export | `!plan.hasHistoryExport` | Show "Pro" lock badge on export button |

**Rules:**
- **Never hide a feature.** Always show it with a lock/badge/disabled state so users know it exists.
- **Always show cost.** Buttons that cost credits show the cost: `"Generate (1 credit)"`, `"Signal Check (½ credit)"`.
- **Free actions are always fully interactive** — Relationship Insight, adding memories, viewing history.

### 4.2 Layer 2 — Edge Function (Trust Boundary)

**Purpose:** Server-side enforcement. Returns structured error responses.

Every credit-consuming edge function follows this sequence:

```
1. Auth check → 401 if no valid JWT
2. Load user: active_plan, credits_balance
3. (spark only) Call issue_free_monthly_credits → ensure monthly batch exists
4. Preflight balance check → 402 if insufficient
5. Feature entitlement check → 403 if plan-restricted
6. Deduct credits via RPC (with action_id for idempotency)
7. Execute AI call
8. On success → return result + remaining balance
9. On failure → refund via RPC → return error
```

**402 Response Shape (NO_CREDITS):**

```json
{
  "error": "NO_CREDITS",
  "message": "You've used all your credits for this month.",
  "credits_required": 2,
  "credits_available": 0,
  "next_reset": "2026-05-01T00:00:00Z",
  "reset_in_days": 7,
  "upgrade_available": true,
  "upgrade_plan": "pro",
  "upgrade_status": "coming_soon"
}
```

**403 Response Shape (PLAN_RESTRICTED):**

```json
{
  "error": "PLAN_RESTRICTED",
  "message": "Batch mode is available on the Pro plan.",
  "feature": "batch_mode",
  "current_plan": "spark",
  "required_plan": "pro",
  "upgrade_status": "coming_soon"
}
```

### 4.3 Layer 3 — Database (Final Gate)

**Purpose:** Unbypassable enforcement via PostgreSQL constraints, triggers, and SECURITY DEFINER functions.

| Enforcement | Mechanism |
|---|---|
| Credit deduction | `deduct_user_credit()` — row locks prevent overdraft |
| Recipient count | `check_recipient_limit()` trigger — raises exception on INSERT |
| Credit balance integrity | `users.credits_balance` updated only by SECURITY DEFINER RPCs; RLS prevents direct writes |
| Monthly credit issuance | Unique index `credit_batches_one_free_monthly_per_month` prevents duplicates |
| Plan validity | (NEW) CHECK constraint on `users.active_plan` limits to `'spark'`, `'pro'` |

### 4.4 Updated `check_recipient_limit()` Trigger

```sql
CREATE OR REPLACE FUNCTION public.check_recipient_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  SELECT active_plan INTO v_plan
  FROM public.users
  WHERE id = NEW.user_id;

  SELECT count(*) INTO v_count
  FROM public.recipients
  WHERE user_id = NEW.user_id;

  v_max := CASE v_plan
    WHEN 'pro' THEN -1      -- unlimited
    ELSE 5                   -- spark (default)
  END;

  IF v_max != -1 AND v_count >= v_max THEN
    RAISE EXCEPTION 'Recipient limit reached for plan "%". Max: % people.', v_plan, v_max;
  END IF;

  RETURN NEW;
END;
$$;
```

---

## 5. Paywall UX Patterns

### 5.1 Design Principles

1. **Soft, never hard.** No blocking modals that prevent navigation. No "you must upgrade to continue" gates.
2. **Contextual, not interruptive.** Paywalls appear inline, near the action that triggered them — not as a separate page or full-screen takeover.
3. **Value-first copy.** Lead with what the user gets, not what they lack. "Get unlimited credits" > "You've run out".
4. **Free actions stay alive.** Even at zero credits, relationship insights, memory notes, viewing history, and managing profiles remain fully functional. Reinforce this.
5. **Coming Soon creates anticipation.** The Pro upgrade CTA leads to a waitlist — frame it as exclusive ("Be first in line"), not apologetic ("Sorry, not available yet").

### 5.2 Pattern A — Inline Credit Gate (SoftPaywall)

**Trigger:** `balance === 0` when user attempts a credit-consuming action.

**Placement:** Below the disabled action button, as an inline card — NOT as a modal.

**Component:** `SoftPaywall.tsx` (rewrite of existing)

```
┌────────────────────────────────────────────────────┐
│  ⏳ You've used all your credits this month        │
│                                                    │
│  Your 15 free credits reset on May 1st (7 days).   │
│  Insights and saved memories are still free.       │
│                                                    │
│  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ Join Pro Waitlist │  │ Invite a friend (+1) │    │
│  └──────────────────┘  └──────────────────────┘    │
└────────────────────────────────────────────────────┘
```

**Props:**
- `resetDate: string` — next credit reset
- `daysUntilReset: number`
- `referralCreditsAvailable: boolean`

### 5.3 Pattern B — Feature Lock Badge

**Trigger:** Feature requires Pro plan (batch mode, history export, priority AI).

**Placement:** Inline on the feature's toggle/button.

```
┌──────────────────────────────────────┐
│  Batch Mode  [🎯 Pro · Coming Soon]  │
│  ─────────────────────────────────── │
│  Generate gifts for multiple people  │
│  at once.                            │
│                                      │
│  ┌───────────────────────────┐       │
│  │  Join waitlist to unlock  │       │
│  └───────────────────────────┘       │
└──────────────────────────────────────┘
```

### 5.4 Pattern C — Low Credit Nudge (Non-blocking)

**Trigger:** `balance > 0 && balance < 4` (less than 2 credits) for spark users.

**Placement:** Dismissible banner at top of Dashboard, above the fold.

```
┌────────────────────────────────────────────────────────┐
│ 💡 1 credit left · Resets in 5 days                [✕] │
│    Invite a friend to earn +1 credit instantly         │
└────────────────────────────────────────────────────────┘
```

### 5.5 Pattern D — Plan Comparison (Upgrade Page)

**Trigger:** User clicks any "Join Pro Waitlist" or "See plans" link.

**Placement:** Full page at `/plans` (new route, replaces the pricing section of `/credits`).

```
┌───────────────────────────────────────────────────────────────┐
│                    Choose Your Plan                            │
│                                                               │
│  ┌─────────────────────┐    ┌─────────────────────────────┐   │
│  │  Spark ✨            │    │  Pro 🎯                     │   │
│  │  Free forever        │    │  $5.99/month                │   │
│  │                      │    │  ┌─────────────────────┐    │   │
│  │  ✓ 15 credits/month  │    │  │  COMING SOON         │    │   │
│  │  ✓ 5 saved profiles  │    │  └─────────────────────┘    │   │
│  │  ✓ Signal Check      │    │                             │   │
│  │  ✓ All stores        │    │  ✓ Unlimited credits        │   │
│  │  ✓ AI messages       │    │  ✓ Unlimited profiles       │   │
│  │                      │    │  ✓ Batch mode               │   │
│  │  [Current Plan]      │    │  ✓ Priority AI              │   │
│  │                      │    │  ✓ History export            │   │
│  └─────────────────────┘    │                             │   │
│                              │  [Join Waitlist]            │   │
│                              │  245 people ahead of you    │   │
│                              └─────────────────────────────┘   │
│                                                               │
│  🎁 Refer a friend → earn 1 free credit instantly             │
└───────────────────────────────────────────────────────────────┘
```

### 5.6 Pattern E — Upgrade Modal (Contextual)

**Trigger:** User clicks a Pro-locked feature (batch mode toggle, export button).

**Placement:** Dialog/modal, compact, dismissible.

```
┌──────────────────────────────────────────────┐
│  🎯 Batch Mode is a Pro feature              │
│                                              │
│  Generate gifts for multiple people at once  │
│  with a single click.                        │
│                                              │
│  Pro is coming soon at $5.99/month.          │
│                                              │
│  ┌─────────────────────┐                     │
│  │  Join Pro Waitlist   │ ← primary CTA      │
│  └─────────────────────┘                     │
│  Not now                  ← dismiss          │
└──────────────────────────────────────────────┘
```

---

## 6. Waitlist System — "Coming Soon" Pro

### 6.1 `plan_waitlist` Table

```sql
CREATE TABLE IF NOT EXISTS public.plan_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  plan_slug   TEXT NOT NULL DEFAULT 'pro',
  source      TEXT NOT NULL DEFAULT 'upgrade_modal',
    -- Values: 'upgrade_modal', 'plans_page', 'soft_paywall',
    --         'feature_lock', 'dashboard_nudge', 'settings'
  price_feedback TEXT,
    -- 'yes_599', 'maybe_different_price', 'no'
  preferred_price NUMERIC,
    -- Only set if price_feedback = 'maybe_different_price'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_slug)
);

ALTER TABLE public.plan_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own waitlist entries"
  ON public.plan_waitlist FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own waitlist entries"
  ON public.plan_waitlist FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### 6.2 `join-waitlist` Edge Function

```typescript
// POST /functions/v1/join-waitlist
// Body: { source: string, price_feedback?: string, preferred_price?: number }
// Returns: { success: true, position: number, already_joined: boolean }
```

The function:
1. Authenticates the user
2. Upserts into `plan_waitlist` (idempotent — if already joined, returns position)
3. Counts total waitlist entries to return position
4. Fires PostHog event: `pro_waitlist_joined`

### 6.3 Waitlist Confirmation UX

After joining:

```
┌────────────────────────────────────────────────┐
│  🎯 You're on the list!                        │
│                                                │
│  #247 in line for Pro                          │
│                                                │
│  We'll email you at you@example.com when       │
│  Pro is ready. Meanwhile, enjoy your 15 free   │
│  credits every month.                          │
│                                                │
│  ┌────────────────────────────┐                │
│  │ Share & skip the line (+1) │                │
│  └────────────────────────────┘                │
└────────────────────────────────────────────────┘
```

### 6.4 Admin Waitlist Dashboard

New admin view at `/admin/waitlist`:
- Total waitlist count
- Waitlist by source (which CTA drives the most signups)
- Price feedback breakdown (yes / maybe / no)
- CSV export of waitlist emails

---

## 7. Plan Badges & Visual Hierarchy

### 7.1 PlanBadge Component

A consistent badge shown in navigation, profile, and settings.

```typescript
// src/components/common/PlanBadge.tsx
interface PlanBadgeProps {
  plan: PlanKey;
  size?: "sm" | "md";
  showName?: boolean;
}
```

| Plan | Badge Appearance |
|---|---|
| Spark | `✨ Spark` — neutral pill, subtle border, muted text |
| Pro (if active) | `🎯 Pro` — gradient pill (amber → warm orange), bold text |
| Pro (coming soon) | Not shown as badge — user is on Spark |

**Placement:** Navigation sidebar (below user name), Profile page header, Settings page.

### 7.2 Credit Display in Navigation

In the sidebar/nav, below the plan badge:

```
✨ Spark
🪙 12 credits · Resets May 1
```

If at zero:
```
✨ Spark
🪙 0 credits · Resets in 3 days
```

---

## 8. Upgrade Prompt Placement Map

Every screen where plan state affects the experience:

| Screen | Prompt Type | Trigger | CTA |
|---|---|---|---|
| Dashboard | Pattern C (low credit nudge) | `balance < 4 && isFreeTier` | "Invite a friend" + "See Pro" |
| Gift Flow — Step 5 | Pattern A (credit gate) | `balance < requiredUnits` | "Join Pro Waitlist" |
| Signal Check trigger | Pattern A (credit gate) | `balance < 1` | "Join Pro Waitlist" |
| My People — add person | Pattern E (upgrade modal) | `recipientCount >= 5` | "Join Pro Waitlist" |
| Batch mode toggle | Pattern B (feature lock) | `!hasBatchMode` | "Join Pro Waitlist" |
| History export button | Pattern B (feature lock) | `!hasHistoryExport` | "Join Pro Waitlist" |
| Reminder — add reminder | Pattern E (upgrade modal) | `reminderCount >= 2` | "Join Pro Waitlist" |
| Credits page | Pattern D (plan comparison) | Always visible | "Join Pro Waitlist" |
| Settings page | Plan section | Always visible | "See plans" → `/plans` |

---

## 9. Rate Limiting — Graceful Degradation

Rate limits exist to prevent abuse, not to monetize. They apply equally to all plans.

| Action | Rate Limit | Enforcement | On Limit Hit |
|---|---|---|---|
| Gift sessions | 10/hour | `rate_limit_events` + edge function | "You're gifting fast! Try again in X minutes." |
| Signal Checks | 30/day | `rate_limit_events` + edge function | "Daily limit reached. Resets tomorrow." |
| Product clicks | 100/hour | Client-side + edge function | Silent throttle (no user message) |
| Referral submissions | 3/hour | IP-based in edge function | "Slow down — try again shortly." |
| Waitlist joins | 1 per user per plan | Unique constraint | Idempotent — returns existing position |

---

## 10. Credit Allocation Rules (Summary from PRD 08)

| Event | Units Granted | Batch Type | Expiry |
|---|---|---|---|
| Monthly auto-refresh (spark) | 30 units (15 credits) | `free_monthly` | 1st of next month UTC |
| Successful referral | 2 units (1 credit) | `referral_bonus` | 14 days |
| Admin grant | Variable | `admin_grant` | Set by admin |

**Sign-up credit change:** The `handle_new_user()` trigger should be updated to set `credits_balance = 0` instead of `3`. The user's first credits come from `issue_free_monthly_credits()` called on first dashboard visit (via `ensure-monthly-credits` edge function). This simplifies the model: **all free credits flow through the monthly issuance system**.

---

## 11. Plan Migration Strategy

### 11.1 Database Migration

```sql
-- Step 1: Migrate all legacy plan users to spark
UPDATE public.users
SET active_plan = 'spark'
WHERE active_plan IN ('thoughtful', 'confident', 'gifting-pro');

-- Step 2: Add CHECK constraint for valid plan slugs
ALTER TABLE public.users
ADD CONSTRAINT valid_plan_slug
CHECK (active_plan IN ('spark', 'pro'));

-- Step 3: Update handle_new_user to set credits_balance = 0
-- (monthly issuance handles initial credits)

-- Step 4: Update check_recipient_limit for 2-plan model
```

### 11.2 Frontend Migration

1. Update `normalizePlan()` to map all legacy slugs → `spark`
2. Remove all references to `thoughtful` and `gifting-pro` from component code
3. Replace `PricingCards` with 2-plan comparison + waitlist
4. Delete `usePlanLimits.ts` — merge into `useUserPlan.ts`
5. Update all upgrade CTAs from "Buy" → "Join Waitlist"

---

## 12. Analytics Events

| Event | Trigger | Properties |
|---|---|---|
| `plan_comparison_viewed` | User opens `/plans` or upgrade modal | `source`, `current_plan` |
| `pro_waitlist_joined` | User submits waitlist form | `source`, `price_feedback`, `position` |
| `pro_waitlist_already_joined` | User tries to join again | `source` |
| `credit_gate_shown` | SoftPaywall rendered (balance = 0) | `action_attempted`, `days_until_reset` |
| `feature_lock_shown` | Pro lock badge viewed | `feature`, `source` |
| `upgrade_nudge_shown` | Low credit banner shown | `balance`, `days_until_reset` |
| `upgrade_nudge_dismissed` | User closes low credit banner | `balance` |
| `referral_cta_clicked` | User clicks "Invite friend" from paywall | `source` |

---

## 13. Implementation Plan

### Phase 1 — Database Migration

**File:** `20260426000000_simplify_plans_and_waitlist.sql`

1. Migrate `active_plan` values: `thoughtful` → `spark`, `confident` → `spark`, `gifting-pro` → `spark`
2. Add CHECK constraint: `active_plan IN ('spark', 'pro')`
3. Update `check_recipient_limit()` to simplified 2-plan CASE
4. Update `handle_new_user()` to set `credits_balance = 0`
5. Create `plan_waitlist` table with RLS
6. Insert/update `platform_settings` keys for new plan config

### Phase 2 — Edge Functions

1. **New: `join-waitlist/index.ts`** — Waitlist submission, idempotent, returns position
2. **Modify: `signal-check/index.ts`** — Remove `ALLOWED_PLANS` gate; use credit-only enforcement
3. **Modify: `ensure-monthly-credits/index.ts`** — No changes needed (already spark-only)
4. **Deprecate: `paypal-checkout/index.ts`** — No credit bundles to sell right now

### Phase 3 — Frontend (Config & Hooks)

1. **Rewrite: `src/lib/plans.ts`** — 2-plan config as specified in Section 3.4
2. **Simplify: `src/lib/geoConfig.ts`** — Remove all plan definitions; import from `plans.ts`
3. **Simplify: `src/lib/planLimits.ts`** — 2-plan recipient limits
4. **Delete: `src/hooks/usePlanLimits.ts`** — Merge into `useUserPlan.ts`
5. **Update: `src/hooks/useUserPlan.ts`** — Add `isPro`, `isComingSoon`, `isOnWaitlist`, `canUpgrade`

### Phase 4 — Frontend (Components)

1. **New: `src/components/common/PlanBadge.tsx`** — Plan badge component
2. **Rewrite: `src/components/pricing/PricingCards.tsx`** — 2-plan comparison card
3. **Rewrite: `src/components/pricing/UpgradeModal.tsx`** — Waitlist capture modal
4. **Rewrite: `src/components/credits/SoftPaywall.tsx`** — Updated copy + waitlist CTA
5. **New: `src/components/pricing/WaitlistForm.tsx`** — Email + price feedback capture
6. **New: `src/components/pricing/WaitlistConfirmation.tsx`** — Post-join confirmation
7. **New: `src/components/common/FeatureLockBadge.tsx`** — Pro lock badge
8. **New: `src/components/common/LowCreditBanner.tsx`** — Dashboard dismissible nudge

### Phase 5 — Frontend (Pages)

1. **New: `src/pages/Plans.tsx`** — Plan comparison page (Pattern D)
2. **Update: `src/pages/Credits.tsx`** — Remove BuyCreditsTab, simplify to balance + history
3. **Update: `src/pages/Dashboard.tsx`** — Add LowCreditBanner, PlanBadge in sidebar
4. **Update: `src/App.tsx`** — Add `/plans` route
5. **Update: navigation** — Add plan badge to sidebar

### Phase 6 — Cleanup

1. Remove `src/components/pricing/PaymentMethodModal.tsx`
2. Remove `src/components/credits/BuyCreditsTab.tsx`
3. Remove `src/components/credits/PayPalCheckoutButton.tsx`
4. Remove all references to `thoughtful`, `gifting-pro` plan slugs in codebase
5. Update admin panels to show simplified plan data

---

## 14. Verification Plan

### 14.1 Automated Tests

| Test | Expected Result |
|---|---|
| `normalizePlan("spark")` | Returns `"spark"` |
| `normalizePlan("thoughtful")` | Returns `"spark"` |
| `normalizePlan("confident")` | Returns `"spark"` |
| `normalizePlan("gifting-pro")` | Returns `"spark"` |
| `normalizePlan("pro")` | Returns `"pro"` |
| `normalizePlan(null)` | Returns `"spark"` |
| Recipient insert at limit (spark, 5 existing) | Trigger raises exception |
| Recipient insert below limit (spark, 3 existing) | Succeeds |
| Waitlist insert (first time) | Returns `position > 0` |
| Waitlist insert (duplicate) | Returns same position, `already_joined: true` |
| Signal Check with 0 balance | Returns 402 `NO_CREDITS` |
| Signal Check with 1 unit balance | Succeeds (no plan gate) |
| `handle_new_user()` new signup | `credits_balance = 0` |
| `ensure-monthly-credits` first call for new user | Issues 30 units |
| `check_recipient_limit` with `active_plan = 'pro'` | Always allows (unlimited) |

### 14.2 Manual / Visual Verification

- [ ] Sign up as new user → lands on Spark plan, 0 credits initially
- [ ] Dashboard mount triggers `ensure-monthly-credits` → 15 credits appear
- [ ] Plan badge shows "✨ Spark" in navigation
- [ ] `/plans` page shows 2-plan comparison with Pro as "Coming Soon"
- [ ] Clicking "Join Waitlist" opens form, submits, shows confirmation with position
- [ ] Attempting to join waitlist again shows "already on list"
- [ ] Using all credits shows inline SoftPaywall (not a modal)
- [ ] SoftPaywall shows correct reset date and "Join Pro Waitlist" CTA
- [ ] Low credit banner appears on Dashboard when ≤ 1 credit left
- [ ] Banner is dismissible and reappears next session
- [ ] Pro-locked features (batch mode, export) show lock badge
- [ ] Clicking lock badge opens upgrade modal with waitlist
- [ ] Adding 6th recipient (spark) shows upgrade modal
- [ ] Signal Check works for spark users when they have credits
- [ ] All free actions work at 0 credits (insights, memories, viewing history)
- [ ] Admin can view waitlist count and export

---

## 15. Acceptance Criteria

- [ ] Only two plan slugs exist in the database: `spark` and `pro`
- [ ] All legacy plan users (`thoughtful`, `confident`, `gifting-pro`) are migrated to `spark`
- [ ] `handle_new_user()` sets `credits_balance = 0` (monthly issuance handles grants)
- [ ] Free users receive 15 credits/month via `issue_free_monthly_credits`
- [ ] Pro plan shows as "Coming Soon" everywhere — no purchase flow
- [ ] Waitlist captures user interest with source tracking and price feedback
- [ ] Waitlist is idempotent — duplicate joins return existing position
- [ ] Plan badge is visible in navigation and profile
- [ ] Feature locks show "Pro · Coming Soon" badge (never hidden)
- [ ] SoftPaywall appears inline when credits are exhausted — never as a blocking modal
- [ ] Free actions (insights, memories, history) work at 0 credits
- [ ] Signal Check is available to spark users (credit-gated, not plan-gated)
- [ ] Recipient limit is 5 for spark, unlimited for pro
- [ ] `check_recipient_limit()` trigger enforces the new 2-plan limits
- [ ] All 4 old plan references are removed from frontend code
- [ ] Single source of truth for plan config in `src/lib/plans.ts`
- [ ] `usePlanLimits.ts` is deleted; `useUserPlan.ts` is the single hook
- [ ] Analytics events fire for all plan interactions
- [ ] PayPal checkout components are removed or deprecated
- [ ] `/plans` page is the canonical upgrade destination
- [ ] Upgrade CTA copy uses "Join Waitlist" (not "Buy" or "Upgrade")

---

## 16. Open Questions

> [!IMPORTANT]
> These need sign-off before implementation.

1. **Purchased credits for legacy paid users:** Users on `confident` or `gifting-pro` who purchased credit bundles — their batches remain valid. But should we send them a notification email about the plan change? **Recommend:** yes, a one-time email explaining the simplification.

2. **Signal Check plan gating removal:** PRD 08 proposed removing the `ALLOWED_PLANS` gate from Signal Check and using credit-only enforcement. This PRD assumes that decision is confirmed. Please verify.

3. **Waitlist threshold for Pro launch:** This PRD proposes 100+ waitlisters as the trigger to begin the Payments PRD. Is that the right threshold?

4. **Referral credit copy:** The "Invite a friend to earn +1 credit" CTA appears in the SoftPaywall and low credit banner. Should we also add it to the waitlist confirmation ("Share & skip the line")?

5. **Credits page vs Plans page:** Should `/credits` redirect to `/plans`? Or should `/credits` remain as a balance-focused page and `/plans` be the comparison page? **Recommendation:** Keep both — `/credits` shows balance/history, `/plans` shows comparison + waitlist.

---

## 17. Future Considerations (V2 — When Pro Launches)

When the waitlist hits threshold and the Payments PRD is approved:

- Replace waitlist CTA with Stripe Checkout
- Add `subscription_status` column to `users` (active / cancelled / past_due)
- Add billing portal link in Settings
- Monthly credit issuance for pro users: skip (unlimited)
- Annual plan option at $49.99/year (save 30%)
- Promo codes / early-bird pricing for waitlist members
- Migrate `plan_waitlist` entries to subscribers with priority access
