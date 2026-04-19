# PRD 03 — Gift Flow Orchestration

**Feature name (internal):** Gift Flow Orchestration  
**Feature name (user-facing):** Find a Gift  
**Owner:** Product  
**Version:** 1.0  
**Status:** Ready for implementation  
**Date:** 2026-04-19  

---

## Section 0 — Audit of Existing Implementation

### Current Step Order

The wizard is **4 interactive input steps + 1 results step = 5 steps total**.

| Step | Component | Heading |
|------|-----------|---------|
| 1 | `StepRecipient.tsx` | "Who is this for?" |
| 2 | `StepOccasion.tsx` | "What's the occasion?" |
| 3 | `StepBudget.tsx` | "What's your budget?" |
| 4 | `StepContext.tsx` | "Anything else we should know?" |
| 5 | `StepResults.tsx` | AI Recommendations |

The orchestrator is `src/pages/GiftFlow.tsx`. Step state lives in plain `useState` in `GiftFlow.tsx`, not inside a hook — `useGiftSession` manages only the async generation/selection lifecycle.

### Current State Management Structure

**`GiftFlow.tsx` (component state — steps 1–4 data):**
- `currentStep: number` (1–5)
- `direction: number` (animation direction)
- `selectedRecipient: Recipient | null`
- `recipientCountry: string | null`
- `isCrossBorder: boolean`
- `selectedOccasion: string | null`
- `occasionDate: string | null`
- `budgetMin: number | null`, `budgetMax: number | null`
- `currency: string` (hardcoded `"USD"`)
- `specialContext: string`
- `contextTags: string[]`
- `userPlan: PlanKey`
- `creditsBalance: number`
- `userCountry: string`
- `isCheckingCredits: boolean`
- `isPreloaded: boolean`, `isFirstTime: boolean`
- `showResetWarning: boolean`, `pendingStep: number | null`
- `hasGeneratedRef: useRef<boolean>` — guards against double-generation
- `previousSnapshotRef: useRef<string>` — detects input drift vs current results

**`useGiftSession.ts` (factory, selects implementation):**
- Returns `useGiftSessionV1()` when `VITE_USE_LANGGRAPH !== "true"`
- Returns `useGiftSessionV2()` when `VITE_USE_LANGGRAPH === "true"`

**`useGiftSessionV1` state (`GiftSessionState`):**
- `sessionId: string | null`
- `isGenerating: boolean`
- `isSearchingProducts: boolean`
- `recommendations: GiftRecommendation[] | null`
- `productResults: ProductResult[] | null`
- `occasionInsight: string | null`
- `budgetAssessment: string | null`
- `culturalNote: string | null`
- `aiProviderUsed: string | null`
- `aiLatencyMs: number | null`
- `aiAttempt: number | null`
- `error: string | null`
- `errorType: string | null`
- `selectedGiftIndex: number | null`
- `isComplete: boolean`
- `regenerationCount: number`

**`useGiftSessionV2` state** — identical plus:
- `engineVersion: string | null`
- `currentNode: string | null` (LangGraph node)
- `nodesCompleted: string[]`
- `nodeTimings: Record<string, number> | null`
- `warningCode: string | null`, `warningMessage: string | null`
- `avgPersonalizationScore: number | null`

### Session Lifecycle (both V1 and V2)

```
"Find Perfect Gift" button clicked
  → createSession() — INSERT into gift_sessions (status='active')
  → deductCredit() — calls deduct-credit Edge Function → deduct_user_credit() RPC
    → if NO_CREDITS: set errorType=NO_CREDITS, session status='abandoned'
    → if success: proceed to AI call
  → callAI() / /api/recommend/start + /api/recommend/stream (V2)
    → on success: save recommendations, then searchProducts()
    → on failure: setState errorType=AI_ERROR (NO REFUND in V1 or V2 — BUG)
  → searchProducts() — calls search-products Edge Function
```

### Known Bugs

1. **Credit deduction not firing / credits_balance staying at 3 after sessions**
   - Root cause: `runGeneration()` calls `createSession()` then `deductCredit()`. Both are `try/catch`. If `deductCredit` throws a non-NO_CREDITS error the session is abandoned but no error state is set that explains why credits didn't deduct. The RPC function `deduct_user_credit` updates `users.credits_balance` but real-time subscription in `useCredits.ts` may miss the update because the channel fires on `UPDATE` but `refreshProfile()` in `GiftFlow.tsx` is called AFTER `generateGifts()` — there's a race.
   - Another path: `shouldReuseSession` logic in V1 means a second `generateGifts()` call (e.g. React StrictMode double-invoke) reuses the session ID and does NOT deduct again — so credits never dropped.

2. **Pricing gate showing at Step 5 even when credits exist**
   - `GiftFlow.tsx` shows `<NoCreditGate />` when `creditsBalance <= 0` at the TOP of the page, BEFORE rendering the step wizard. If `refreshProfile()` hasn't resolved yet or returns stale data, `creditsBalance` is 0 and the gate shows briefly even with real credits. `isCheckingCredits` guard exists but doesn't cover all paths (e.g., first render before `useEffect` fires).

3. **Sessions created but marked "No selection made" repeatedly**
   - `gift_sessions` has no `selected_gift_name` column at initial schema. The column was added by migration `20260418100000` (via `get_recent_past_gifts` referencing it). However the initial `CREATE TABLE` doesn't include it — only later `ALTER TABLE` migrations add it. Old sessions have `NULL`. The admin hub / history view may show "No selection made" for any session where `selected_gift_name IS NULL`, which is every active/abandoned session.

4. **`useCredits` realtime subscription crash (on()/subscribe() order)**
   - `useCredits.ts` (line 123): uses `.channel(...).on(...).subscribe()` — this is the correct Supabase v2 order. The bug was previously `.channel().subscribe().on()` but has since been fixed in the current codebase. The random suffix `Math.random().toString(36).substring(7)` prevents duplicate channel name collisions under React StrictMode.

5. **Regenerate function not respecting plan limits**
   - `StepResults.tsx` calls `planLimits.canRegenerate(giftSession.regenerationCount)` client-side, but `generate-gifts` Edge Function also checks via `regenerationLimit(plan)`. However, the Edge Function only enforces the limit if `is_regeneration: true` is passed AND the session's `regeneration_count` from DB is fetched and compared. Currently V1 doesn't pass session `regeneration_count` to the function — the function uses the DB value, which may not be synced (session is created fresh on first call, but `regeneration_count` column doesn't exist in the original schema per migration review — it's not in the `CREATE TABLE` statement). This means the DB column is likely not being incremented, so the server-side check is effectively disabled.

### Current gift_sessions Schema (reconstructed from migrations)

```sql
-- Initial CREATE TABLE (20260405152005)
id uuid PRIMARY KEY
user_id uuid NOT NULL → auth.users
recipient_id uuid → recipients (ON DELETE SET NULL)
occasion text
occasion_date date
budget_min integer
budget_max integer
currency text DEFAULT 'INR'  -- later overridden to USD in practice
context_tags text[] DEFAULT '{}'
extra_notes text             -- renamed to special_context in later code
results jsonb               -- renamed to ai_response in later code
chosen_gift jsonb           -- renamed to selected_gift_* in later code
status text DEFAULT 'in_progress'
feedback_rating text
feedback_notes text
created_at timestamptz
updated_at timestamptz

-- Added later:
recipient_country text (20260406142115)
credits_used numeric (create_deduct_function.sql — UPDATE via RPC)
selected_gift_name text (referenced in 20260419213000 — exists via prior ALTER)
confidence_score numeric (referenced in useGiftSession.ts selectGift())

-- Added in 20260418100000 (v2 schema):
personalization_scores jsonb
graph_state jsonb
node_timings jsonb
cultural_rules_applied integer
past_gifts_checked integer
engine_version text
feedback_cultural_fit integer
feedback_cultural_note text

-- Missing from schema but used in code:
special_context text        -- code inserts this, but schema has 'extra_notes'
product_results jsonb       -- code updates this field
ai_provider_used text       -- referenced as aiProviderUsed in state
selected_gift_index integer -- code sets this
regeneration_count integer  -- used in Edge Function, not confirmed in schema
```

**Schema gap:** The frontend inserts `special_context` but the original schema column is `extra_notes`. This is a likely silent failure — Supabase would reject the unknown column insert or ignore it depending on client version. `product_results` is set via `.update({ product_results: products })` but doesn't appear in any CREATE TABLE or ALTER TABLE migration found.

### Inconsistencies

1. `currency` defaults to `'INR'` in DB schema but is hardcoded `'USD'` in `GiftFlow.tsx` — every session writes 'USD' over the default.
2. `extra_notes` vs `special_context` — code uses `special_context`, schema has `extra_notes`.
3. `results` vs `ai_response` vs `product_results` — three overlapping jsonb columns for AI output.
4. `chosen_gift` (jsonb) vs `selected_gift_name` (text) + `selected_gift_index` (int) — old and new patterns coexist.
5. `status` uses `'in_progress'` in original schema but `'active'` in all current code.
6. No `entry_source` column or `current_step` column — resumability not implemented.
7. V2 LangGraph path calls `/api/recommend/start` + `/api/recommend/stream` — these are Vercel API routes, NOT Supabase functions. These routes are not visible in the codebase (they must be in a separate Next.js or Express layer or missing entirely).

---

## Section 1 — Overview

### Feature Name
**Gift Flow Orchestration** (internal) / **"Find a Gift"** (user-facing)

### Description

The Gift Flow is GiftMind's core product experience: a 5-step guided wizard that takes a user from "I need a gift for someone" to "Here are 3 AI-curated, confidence-ranked recommendations with buy links." Every other feature in GiftMind exists to support or extend this flow. The wizard captures four inputs — recipient, occasion, budget, context — then orchestrates credit deduction, AI generation via a provider fallback chain, budget enforcement, product link generation, and result display. When the flow works flawlessly, users experience the product's fundamental value proposition: thoughtful gifting made effortless.

### Why This Is the Heart of the Product

- **Every other feature feeds this one.** Recipient management saves people for Step 1. Occasion reminders bring users back to Step 2. Recipient Memory prevents duplicate gifts. Signal Check deepens Step 5 value.
- **Quality of this flow = perceived quality of the entire product.** A user who bounces at Step 3 or gets a generic AI result will not return. A user who gets a precise, confident recommendation with a working buy link will convert to paid.
- **First real moment of value.** Landing page → onboarding → dashboard → this flow → "wow" is the entire acquisition-to-retention loop. This is where promise meets delivery.
- **Only feature that deducts credits = only revenue event.** Every credit purchase, plan upgrade, and paywall decision in the product exists to monetize usage of this wizard. Getting the credit deduction order wrong costs real money (AI calls without billing) or breaks trust (charging without results).

### Where It Fits

Primary entry point from Dashboard ("Find a Gift" CTA) or from a recipient card ("Find a gift for [Name]"). The route is `/gift-flow`, with optional URL params for prefilling.

### Scope (IN)

- 5-step wizard with session state machine
- Plan-gated features: regeneration limits, store count, Signal Check
- Credit deduction flow with pre-check → deduct → AI → refund-on-failure guarantee
- AI provider routing integration (Groq → Gemini → Claude fallback chain)
- Results display: 3 ranked recommendations with confidence scores, why-it-works, avoid note, buy links
- Gift selection + session completion
- Feedback entry point (reminder creation after selection)
- URL param prefilling for all steps

### Non-Goals (NOT in this PRD)

- AI recommendation engine logic internals (LangGraph nodes, embeddings, prompts) — see Engine PRD
- Product search and affiliate link generation internals — separate PRD
- Signal Check feature internals — separate PRD
- Credit deduction RPC internals — see Credits PRD
- Gift history view — separate PRD
- Batch/festival mode — V2, separate PRD
- Regeneration with changed parameters (changing occasion/budget mid-session) — V2
- Collaborative gifting / group mode — V2

---

## Section 2 — User Problem & Goals

### The User Problem

"I need a gift for [person] for [occasion] in my [budget]. I don't know what to get. I'm anxious about getting it wrong. Existing tools give me 10 generic ideas and I have to pick — that's more work, not less."

The user doesn't want options. They want a recommendation — one clear answer with a reason. And they want to trust the reason because the AI actually knows something about their recipient, not just their budget.

### The Business Problem

Without this flow working well, GiftMind has no product. Every retention mechanism — occasion reminders, recipient memory, signal check, feedback loops — brings the user back to repeat this wizard. Every paywall — credits, plan tiers — exists to monetize successful completions of this wizard. A broken Step 5 or a silently failed credit deduction is not a bug; it is direct revenue leakage.

### Jobs to Be Done

1. When I'm thinking of a gift for someone, I want to select them from my saved list (not retype), so I don't waste time on context the app already has.
2. When I add the occasion, I want relevant suggestions (birthday, anniversary, festival-specific) that spark ideas and match my recipient's cultural context.
3. When I set a budget, I want to see a range that fits my relationship with this person — with a gentle signal if my range seems mismatched.
4. When I add special context (they just moved, first birthday together), I want the AI to actually USE that context in its reasoning — not ignore it.
5. When results arrive, I want to see WHY each gift will work — not just what it is — so I feel confident before buying.
6. When I need another idea, I want to regenerate without losing my selections or spending another credit.
7. When I pick a gift, I want to buy it immediately with working links to real stores.
8. When it's over, I want the app to remember my choice so next time it avoids repeats.

### Success Metrics

| Metric | Target | Baseline | How Measured |
|---|---|---|---|
| Completion rate (Step 1 → Step 5 reached) | ≥75% | Unknown | PostHog funnel |
| Result satisfaction (≥1 buy link clicked) | ≥55% | Unknown | `product_clicks` / `gift_sessions` |
| Gift selection rate (`selected_gift_name` filled) | ≥35% | Unknown | % with non-null `selected_gift_name` |
| Step 3 abandonment rate | ≤15% | Unknown | Budget step drop-off |
| Time from Step 1 entry to Step 5 render | <120s median | Unknown | Step timestamps |
| Step 5 load time (loading → results) | <12s P95 | Unknown | AI call latency |
| Regeneration usage | ≥20% of sessions | Unknown | `regeneration_count > 0` |
| Credit deduction success rate | ≥99.5% | Unknown | Successful deductions / attempts |
| Session abandonment (started, never reached Step 5) | ≤25% | Unknown | Funnel drop-off |
| AI error rate (all providers fail) | <1% | Unknown | `status='errored'` sessions |

---

## Section 3 — User Journey & UX

### 3.1 Entry Points

Every entry point starts at **Step 1** even when pre-filled — the user always confirms recipient selection before proceeding. This prevents silent errors from stale URL params or deleted recipients.

| Entry | Pre-filled | Analytics Source Tag |
|---|---|---|
| Dashboard → "Find a Gift" button | Nothing | `dashboard_cta` |
| My People → "Find a Gift" on recipient card | Step 1 recipient | `recipient_card` |
| Occasion reminder email link | Step 1 recipient + Step 2 occasion | `email_reminder` |
| Gift History → "Gift again for [Name]" | Step 1 recipient | `gift_history` |
| Direct URL `/gift-flow?recipient=UUID` | Step 1 recipient | `url_param` |
| Recipient detail panel → "Find a gift" | Step 1 recipient | `recipient_panel` |

For pre-filled entries: the `isPreloaded` banner appears at Step 1 top for 5 seconds confirming the pre-fill. "Next" button is enabled immediately when pre-fill is valid so the user can flow through with 4 clicks.

Supported URL params: `recipient` (UUID), `occasion` (slug), `budget_min` (number), `budget_max` (number), `context` (URL-encoded string).

### 3.2 Step 1 — Who Is This For? (Recipient Selection)

**Desktop wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                              Step 1/5  │
│  ●────○────○────○────○                                      │
│  Person  Occasion  Budget  Context  Results                 │
│                                                             │
│  Who is this for?                                           │
│  Pick someone you already know or add a new person.         │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │ ℹ Pre-filled from your People page          [×] │       │  ← only if isPreloaded
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ ┌V┐ ✓   │  │ ┌S┐      │  │ ┌P┐      │                  │
│  │ └─┘Vinay │  │ └─┘Shaq  │  │ └─┘Pratik│                  │
│  │ 🇮🇳Close  │  │ Friend   │  │ Close Fr.│                  │
│  │ Tech +3  │  │ Apr 2025 │  │ Overdue  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│  🔒 Locked — upgrade to use these people:                   │
│  ┌──────────┐                                               │
│  │ ┌S┐      │  Upgrade to Thoughtful 💝                     │
│  │ └─┘Shrik │  to add more people                          │
│  │ [🔒]     │                                               │
│  └──────────┘                                               │
│                                                             │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐          │
│  │  + Add Someone New                            │ (dashed) │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘          │
│                                                             │
│  ⚠ Vinay has fewer than 3 interests. Better interests →     │
│    better results. [Edit in People ↗]                       │
│                                                             │
│  Cross-border: [☑] Vinay is in India 🇮🇳                    │
│                                                             │
│                              [Continue →]                   │
└─────────────────────────────────────────────────────────────┘
```

**Mobile wireframe (375px):**
```
┌──────────────────────────────┐
│  ← Find a Gift        1/5   │
│  ●─○─○─○─○                  │
│                              │
│  Who is this for?            │
│                              │
│  ┌──────────────────────┐    │
│  │ [V] Vinay ✓          │    │
│  │ Close Friend 🇮🇳      │    │
│  │ Tech, Running +3     │    │
│  │ Last gifted: Apr 25  │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ [S] Shaqeeb          │    │
│  │ Friend               │    │
│  │ Never gifted         │    │
│  └──────────────────────┘    │
│                              │
│  🔒 Locked                   │
│  ┌──────────────────────┐    │
│  │ [S] Shrikant  🔒     │    │
│  └──────────────────────┘    │
│                              │
│  [+ Add Someone New]         │
│                              │
│  [Continue →]                │
└──────────────────────────────┘
```

**Behavior spec:**
- Progress indicator: 5 dots. Current = amber filled. Past = dim amber. Future = muted gray.
- Recipient cards render in a 2-column grid on desktop, 1-column on mobile.
- Card states:
  - **Normal:** `border-border/60`, `hover:border-primary/30`
  - **Selected:** `border-primary bg-primary/5 scale-[1.01]`, amber checkmark in top-right
  - **Locked:** `opacity-70 grayscale`, lock icon overlay, clicking opens UpgradeModal
- "Add Someone New" card: dashed border, expands to inline form (name + relationship + interests chips). Plan-gated: if `atRecipientLimit`, shows overlay with upgrade CTA instead of form.
- Interest nudge: if `selectedRecipient.interests.length < 3`, show amber callout with link to `/my-people`.
- Cross-border selector: appears below recipient grid after selection. Auto-populates from `recipient.country`. User can override.
- Loading: 3 skeleton pulse cards while fetching.
- Error: "Couldn't load your people. [Retry]"
- Empty state (0 recipients): full-card prompt "Add your first person to get started" with primary CTA.
- Keyboard: Tab through cards, Space/Enter selects. Arrow keys navigate between cards.

**Data captured:**
- `recipient_id` (UUID)
- `recipientCountry` (string | null — from `recipient.country` or cross-border override)
- `isCrossBorder` (boolean)

### 3.3 Step 2 — What's the Occasion?

**Desktop wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          Step 2/5  │
│  ●────●────○────○────○                                      │
│                                                             │
│  What's the occasion?                                       │
│  Choose the moment — shapes tone, budget, store matching.   │
│                                                             │
│  COMMON                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 🎂        │  │ 💍        │  │ 🎓        │                 │
│  │ Birthday  │  │Anniversary│  │Graduation │                 │
│  └──────────┘  └──────────┘  └──────────┘                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 🏠        │  │ 💼        │  │ 🎁        │                 │
│  │Housewarm. │  │Promotion  │  │Just Becau.│                 │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│  SEASONAL / PROFESSIONAL                                    │
│  [🎄 Christmas] [🎁 Secret Santa] [💼 Corporate]            │
│                                                             │
│  🇮🇳 COMMON IN INDIA                                        │
│  [🪔 Diwali] [🌸 Holi] [✨ Raksha Bandhan] [❤️ Valentine's] │
│  [🌙 Eid] [🐘 Ganesh Chaturthi] [🎊 Navratri]              │
│                                                             │
│  ┌─ When is it? ────────────────────────────────────────┐  │
│  │ [        Apr 25, 2026           📅 ]                 │  │
│  │ 🕒 Helps us prioritize items that can arrive in time  │  │
│  │ ☐ I'm not sure yet                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ⚡ Short on time? We'll prioritize fast delivery.          │  ← only if <3 days
│                                                             │
│  [← Back]                [Continue →]                      │
└─────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- Occasion chips: single-select. Selected = `border-primary bg-primary text-primary-foreground scale-[1.01]`.
- Three groups: Common (universal), Seasonal/Professional (universal), Regional (from `REGIONAL_OCCASIONS[recipientCountry]` in `geoConfig.ts`).
- Regional section header shows recipient's country flag + name (e.g., "🇮🇳 Common in India").
- Date picker: native `<input type="date">`. Optional — user can check "I'm not sure yet" to clear.
- Urgency banner: if `daysUntil < 3 && daysUntil >= 0`, show amber urgency callout.
- Past-date warning: if selected date is in the past, show subtle warning "This date has passed — pick a future date for reminders."
- Custom occasion: NOT in current implementation. V2 feature. Do not implement now.
- Keyboard: arrow keys navigate chips, Enter selects. Tab to date field.
- Validation: must have selected occasion to enable "Continue."

**Data captured:**
- `selectedOccasion` (string slug: `'birthday'`, `'diwali'`, etc.)
- `occasionDate` (string | null, ISO date format)

### 3.4 Step 3 — What's Your Budget?

**Desktop wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          Step 3/5  │
│  ●────●────●────○────○                                      │
│                                                             │
│  What's your budget?                                        │
│  Pick a band or set a custom range. We'll stay inside it.   │
│                                                             │
│  [$0-15] [$15-30] [$30-50] [$50-100] [$100-200] [$200+]    │
│         ← horizontal scroll on mobile →                     │
│                                                             │
│  ▼ Set a custom range                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Minimum         Maximum                              │  │
│  │ $ [____45]      $ [____75]                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  💡 This range works best if the gift feels personal or     │
│     experiential, not generic. [relationship-aware message] │
│                                                             │
│  🌐 Cross-border mode is on. Stores matched for India 🇮🇳   │
│     while keeping your budget in USD.                       │
│                                                             │
│  [← Back]                [Continue →]                      │
└─────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- Budget chips are scrollable pill row. Source: `BUDGET_CHIPS` from `geoConfig.ts`.
- All amounts in USD. No currency selector.
- Clicking a chip sets `budgetMin` + `budgetMax` and enables Continue.
- "Set a custom range" collapsible: when expanded, two number inputs. Min must be ≥ 0, Max must be > Min. "Continue" disabled if `budgetMax < budgetMin`.
- Budget insight card: relationship-aware message from `getBudgetInsight()`. Animates in/out with `AnimatePresence`. Three variants: amber (warning), sky (professional concern), default (neutral).
- Cross-border notice: appears when `isCrossBorder === true`.
- Validation: `budgetMin != null && budgetMax != null && budgetMax >= budgetMin`.

**Data captured:**
- `budgetMin` (number, USD)
- `budgetMax` (number, USD)
- `currency` (always `"USD"`)

### 3.5 Step 4 — Anything Special? (Context Capture)

**Desktop wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          Step 4/5  │
│  ●────●────●────●────○                                      │
│                                                             │
│  Anything else we should know?                              │
│  Context is optional, but it helps the AI avoid generic     │
│  ideas.                                                     │
│                                                             │
│  [✓ First time gift] [✓ Long distance] [Recent life event] │
│  [They're picky] [Sentimental occasion] [Surprise]          │
│  [Apology gift] [Professional context] [Eco-conscious]      │
│  ✨ 2 tags selected → richer results                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ He just got promoted and we haven't seen each other │   │
│  │ in 6 months. He's been training for a marathon...  │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  300 chars max                              [XXX/300]       │
│                                                             │
│  ┌─ After results, try Signal Check ───────────────────┐   │
│  │ 💬 See what your gift says about the relationship   │   │
│  │    Available on Confident plan · 1 credit per gift  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ✨ 1 credit will be used when you continue.               │
│     You have 2 remaining.                                   │
│                                                             │
│  [Add context → better results]      (primary hero button)  │
│  [Skip (use defaults)]               (outline button)       │
│  [← Back]                            (ghost button)        │
└─────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- Context tags: multi-select from `CONTEXT_TAGS` in `geoConfig.ts`. No current limit enforced in UI (code allows any number). PRD specifies soft limit: animate a gentle warning at >4 tags ("Focus helps the AI — maybe pick your top 3?"), but don't block.
- Tag chip: `whileTap={{ scale: 0.95 }}`, selected state shows animated checkmark. Live counter updates.
- Free text: `<Textarea>`, max 300 chars (current implementation), char counter bottom-right.
- Signal Check teaser: always visible. Text adapts: "1 credit per gift" if `canUseSignalCheck`, else "Available on Confident plan."
- Credit notice: shows `creditsBalance` remaining. If 0: the "Add context" button should be disabled — but this should never happen because `NoCreditGate` blocks at page level. If somehow reached, show inline "No credits — [Upgrade]."
- Both "Add context" and "Skip" navigate to Step 5 and trigger generation. The distinction is cosmetic (encourages context input).
- Back button: returns to Step 3, no data loss.

**Data captured:**
- `contextTags: string[]`
- `specialContext: string` (max 300 chars)

### 3.6 Step 5 — Results (AI Recommendations)

This is the most complex screen with five distinct visual states.

---

**State A: Loading (credit deducted, AI generating)**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          Step 5/5  │
│  ●────●────●────●────●                                      │
│                                                             │
│      ✨ (animated pulse glow)                               │
│                                                             │
│  Reading the recipient                                      │
│  Extracting relationship, interests, and useful context.    │
│                                                             │
│  [══════════════════════════] 45%  (progress bar)          │
│                                                             │
│  ┌─ recipient_analyzer     ──────────────── [⟳ spinning] ┐ │
│  │ Reading the recipient                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ cultural_context_retriever ─────────── [✓ done]    ─┐  │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ past_gift_retriever ──────────────── [ upcoming ] ──┐   │
│  └────────────────────────────────────────────────────────┘ │
│  (etc. for 7 nodes)                                         │
└─────────────────────────────────────────────────────────────┘
```

- Shows for V2 LangGraph path: live node progress from SSE stream.
- Shows for V1 path: rotating messages from `loadingMessages` array every 3s, fake progress bar.
- If loading > 20 seconds: show subtle "Taking longer than usual…" text (no Cancel button — credit already deducted).
- Back button during loading: triggers `showResetWarning` dialog (existing behavior) warning that going back will require another credit.
- Skeleton shimmer cards NOT shown (current code shows node progress which is more informative).

---

**State B: Results (3 recommendations)**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                          Step 5/5  │
│  ●────●────●────●────●                                      │
│                                                             │
│  Your AI gift recommendations                               │
│  Ranked for Pratik, tuned for birthday.                     │
│                                                             │
│  ⚠ [Budget warning if outside range]                       │
│                                                             │
│  ┌─ Best Match ─────────────────────────────────────────┐  │
│  │ 🎯 92% Confidence                                    │  │
│  │                                                      │  │
│  │ Wool Merino Running Headband                         │  │
│  │                                                      │  │
│  │ Why it works                                         │  │
│  │ Pratik's marathon training means he runs in all      │  │
│  │ weather. A Smartwool headband signals you pay        │  │
│  │ attention to his passion — priced thoughtfully.      │  │
│  │                                                      │  │
│  │ 💰 ~$45  (budget: $50–75 ✅)                         │  │
│  │                                                      │  │
│  │ ⚠ Avoid: generic running gear — he's selective      │  │
│  │                                                      │  │
│  │ 💬 Signal Check — what this gift signals            │  │
│  │    [🔒 Upgrade to Confident 🎯 to unlock]           │  │
│  │                                                      │  │
│  │ Buy from:                                           │  │
│  │ [🛒 Amazon.in $42] [🛒 Decathlon $48]               │  │
│  │ [🔒 Flipkart — Upgrade]                             │  │
│  │                                                      │  │
│  │ [I'll Pick This One]                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [similar cards × 2 more]                                   │
│                                                             │
│  ┌─ AI Insights ────────────────────────────────────────┐  │
│  │ Personalization: 87/100                              │  │
│  │ "For his 30th birthday, these gifts celebrate…"      │  │
│  │ Budget note: "Strong options at $45–60 range."       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [🔄 Regenerate ideas  2/3]                                 │
└─────────────────────────────────────────────────────────────┘
```

- Recommendations sorted by `confidence_score` descending (done in `StepResults.tsx`).
- First card gets "Best Match" label (implemented as `isBestMatch={index === 0}`).
- Confidence badge: amber background, percentage in `font-heading`.
- "Why it works" — references specific recipient details.
- "Avoid" note — in warning amber, NOT scary red.
- Signal Check: locked if `!canUseSignalCheck`. Plan-gated call to `signal-check` Edge Function, shown inline in `GiftCard.tsx` via `SignalCheck` component.
- Buy links: `BuyLinksRow` component. Store count by plan: Spark = 1 store (Amazon only), Thoughtful = basic (1-2), Confident+ = all. Locked stores show lock icon + upgrade prompt.
- "I'll Pick This One" — opens Selection & Feedback modal (Section 3.7).
- Regenerate button: shows `regenerationCount / maxRegenerations`. Disabled during generation. At limit: opens `UpgradeModal` instead.
- AI Insights card: shows `occasionInsight`, `budgetAssessment`, `culturalNote`, `avgPersonalizationScore` when available.

---

**State C: Error (AI failed)**

```
┌──────────────────────────────────────────────┐
│              🤔                              │
│                                              │
│   AI had trouble with this one              │
│                                              │
│   This sometimes happens. Your credit was   │
│   not charged — you can try again.          │
│                                              │
│   [🔄 Try Again]   [Start Over]             │
└──────────────────────────────────────────────┘
```

- Shown for `errorType === 'AI_ERROR'` or `'AI_PARSE_ERROR'`.
- "Your credit was not charged" — only true if the refund succeeded. See Section 4.3 for refund logic.
- "Try Again" calls `generateGifts(onRegenerateParams)` — creates a NEW session (does NOT reuse old session), deducts credit again. This is the correct behavior: the previous session failed.
- "Start Over" resets all state and returns to Step 1.

---

**State D: Insufficient Credits**

```
┌──────────────────────────────────────────────┐
│              🎁                              │
│                                              │
│   You've used all your credits              │
│                                              │
│   Get more to keep finding gifts:           │
│                                              │
│   [Thoughtful $2.99] [Confident $5.99]      │
│   [Gifting Pro $9.99]                        │
│                                              │
│   [ Back to Dashboard ]                     │
└──────────────────────────────────────────────┘
```

- Shown when `errorType === 'NO_CREDITS'`.
- **No AI call was made** when this state shows — credits hit 0 during deduction, session marked abandoned.
- Pricing cards are in `NoCreditGate` component (shared component also used at page top).
- Step 1–4 inputs preserved in GiftFlow.tsx state — if user pays and returns, they can retry.

---

**State E: Gift Selected (Confirmation)**

```
┌──────────────────────────────────────────────┐
│   🎉                                         │
│                                              │
│   Great choice!                             │
│   You picked the Wool Merino Running        │
│   Headband with 92% confidence.             │
│                                              │
│  ┌─ Save for next year? ─────────────────┐  │
│  │  📅 We'll remind you about birthday   │  │
│  │     for Pratik next year.             │  │
│  │  [Save reminder]  [No thanks]         │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  ┌─ Share GiftMind ──────────────────────┐  │
│  │  [WhatsApp]   [Copy link]             │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  [Back to Dashboard]  [Find Another Gift]   │
└──────────────────────────────────────────────┘
```

- Shown when `giftSession.isComplete === true`.
- "Save reminder" triggers `handleSaveReminder()` — currently shows a toast but does not persist. **Action item: implement actual `feedback_reminders` insert** (see Section 5.1).
- "Find Another Gift" navigates to `/gift-flow` (fresh session, no params).
- "Back to Dashboard" navigates to `/dashboard`.
- Share block: WhatsApp deep link + clipboard copy with referral URL.

### 3.7 Selection & Feedback Modal

Triggered by "I'll Pick This One" button in a `GiftCard`.

```
┌──────────────────────────────────────────────┐
│  Mark this as your pick?                     │
│                                              │
│  Wool Merino Running Headband                │
│  for Pratik's Birthday                       │
│                                              │
│  ── Optional — set a reminder ───────────── │
│  ☑ Ask me after the birthday how it went   │
│                                              │
│  ── Optional — add a note ──────────────── │
│  ┌──────────────────────────────────────┐   │
│  │ Going to wrap with his favorite       │   │
│  │ brown paper...                        │   │
│  └──────────────────────────────────────┘   │
│  150 chars max                              │
│                                              │
│  [Cancel]          [Yes, This One ✓]        │
└──────────────────────────────────────────────┘
```

**Implementation note:** This modal does NOT currently exist in the codebase. `GiftCard.tsx` calls `onSelect(giftIndex, giftName)` which immediately calls `giftSession.selectGift(giftIndex, giftName)` with no intermediate modal. The modal must be added. It should be a `Dialog` from shadcn, rendered inside `GiftCard.tsx` or `StepResults.tsx`.

**"Yes, This One" saves:**
- `gift_sessions.selected_gift_name = giftName`
- `gift_sessions.selected_gift_index = giftIndex`
- `gift_sessions.selected_gift_note = noteText` (new column — see Section 5.1)
- `gift_sessions.status = 'completed'`
- If reminder checked: INSERT into `feedback_reminders` (new table — see Section 5.1)
- Triggers `award-referral-credits` Edge Function call (existing behavior)

---

## Section 4 — Logic & State Management

### 4.1 Session State Machine

```
┌─────────────┐
│   ENTRY     │  (URL params parsed, credits pre-checked)
└──────┬──────┘
       │ Mount GiftFlow.tsx
       ▼
┌─────────────┐
│   STEP_1    │◄──────────────┐
└──────┬──────┘               │
       │ recipient selected    │
       ▼                      │ goBack()
┌─────────────┐               │
│   STEP_2    │◄──────────────┤
└──────┬──────┘               │
       │ occasion + date       │
       ▼                      │
┌─────────────┐               │
│   STEP_3    │◄──────────────┤
└──────┬──────┘               │
       │ budget                │
       ▼                      │
┌─────────────┐               │
│   STEP_4    │◄──────────────┘
└──────┬──────┘
       │ "Continue" or "Skip" clicked
       ▼
┌──────────────┐
│ CREDIT_CHECK │  (check creditsBalance local state)
└──────┬───────┘
       │
   ┌───┴───────┐
   │ balance>0 │  balance=0
   ▼            ▼
┌──────────┐  ┌────────────┐
│ DEDUCT   │  │  STATE_D   │  (NoCreditGate, no session created)
│ CREDIT   │  │  (Paywall) │
└────┬─────┘  └────────────┘
     │
 ┌───┴─────┐
 │ success │  error
 ▼          ▼
┌──────┐  ┌──────────────────────┐
│ AI_  │  │ NO_CREDITS → STATE_D │
│ GEN  │  │ OTHER → STATE_C      │
└──┬───┘  └──────────────────────┘
   │ generate-gifts / LangGraph
   │
 ┌─┴─────┐
 │success│  failure
 ▼        ▼
┌──────┐  ┌────────────────────────┐
│STATE │  │ refund credit          │
│  B   │  │ STATE_C (error + info  │
│Results│  │ "credit not charged")  │
└──┬───┘  └────────────────────────┘
   │
   user actions:
   ├─ regenerate → AI_GEN (no new credit, within plan limit)
   ├─ pick one → Selection Modal → STATE_E
   └─ "Start Over" → STEP_1 (resets all state)
```

**State entry conditions, valid actions, and exits:**

| State | Entry | Valid Actions | Exit to |
|-------|-------|--------------|---------|
| STEP_1 | GiftFlow mount or "Start Over" | Select recipient, Add new person | STEP_2 (Continue) |
| STEP_2 | After STEP_1 Continue | Select occasion, set date | STEP_3 (Continue), STEP_1 (Back) |
| STEP_3 | After STEP_2 Continue | Select budget chip, custom range | STEP_4 (Continue), STEP_2 (Back) |
| STEP_4 | After STEP_3 Continue | Select tags, write context | CREDIT_CHECK (Continue/Skip), STEP_3 (Back) |
| CREDIT_CHECK | After STEP_4 Continue | — (instant check) | DEDUCT if credits>0, STATE_D if credits=0 |
| DEDUCT | After credit check pass | — (async) | AI_GEN if success, STATE_C/STATE_D if fail |
| AI_GEN | After deduct success | — (async, can "Back" with warning) | STATE_B if success, STATE_C if fail |
| STATE_B | After AI success | Pick gift, Regenerate, Start Over | STATE_E (pick), AI_GEN (regen), STEP_1 (start over) |
| STATE_C | After AI fail | Try Again, Start Over | DEDUCT (try again), STEP_1 (start over) |
| STATE_D | credits=0 | Upgrade (external), Back to Dashboard | — (exits feature) |
| STATE_E | After gift selected | Back to Dashboard, Find Another | — |

### 4.2 Data Persistence Strategy

**Session creation (current: at Step 4/5 transition):**
- `INSERT` into `gift_sessions` on "Continue" at Step 4 with all collected data
- `session_id` stored in `giftSession.sessionId` state (in-memory only, NOT in URL currently)

**Required improvement — URL persistence:**
- On session create, update URL to `/gift-flow?session=UUID` using `useSearchParams` setter
- On mount, if URL has `?session=UUID`, fetch session from DB and resume at `current_step`
- This enables tab refresh recovery

**Per-step persistence (current behavior: all at once at Step 4):**
- Current: All data is held in `GiftFlow.tsx` component state until Step 4 triggers `createSession()` which inserts everything at once.
- PRD requirement: Keep current behavior for V1. For V2 (LangGraph), session is still created at Step 4 with full data.
- No per-step DB updates — only the final bulk insert + later UPDATE calls for results and selection.

**Status transitions:**
- `'active'` — session created, generation in progress or waiting
- `'abandoned'` — NO_CREDITS during deduction (explicit update), or 24h timeout cron (future)
- `'completed'` — user selected a gift (`selected_gift_name` set)
- `'errored'` — AI generation failed after all fallbacks (set during refund path — see 4.3)

### 4.3 Credit Deduction Flow (CRITICAL — fixes known bugs)

The order MUST be strictly:

```
1. User clicks "Continue" or "Skip" at Step 4
   → UI shows Step 5 with loading state immediately
   → setCurrentStep(5) triggers useEffect that calls giftSession.generateGifts()

2. Inside generateGifts() → runGeneration():
   a. createSession() — INSERT gift_sessions with all data, status='active'
      → If INSERT fails: show STATE_C, do NOT proceed
   
   b. deductCredit(sessionId) — calls deduct-credit Edge Function
      → Edge Function calls deduct_user_credit() RPC (atomic, uses FOR UPDATE lock)
      → If RPC raises exception (insufficient credits): 
         return { success: false, error: 'Insufficient credits...' }
         → frontend catches → sets errorType='NO_CREDITS' → renders STATE_D
         → session.status UPDATE to 'abandoned'
      → If network error or other failure:
         → sets errorType='AI_ERROR', shows STATE_C
         → session.status NOT updated (remains 'active')
      → If success: proceed to step (c)
   
   c. callAI() / /api/recommend/start
      → If AI fails (all providers exhausted, timeout, parse error after retry):
         → Call refund-credit Edge Function (NEW — see Section 5.3)
         → Update session status='errored'
         → Set error message: "AI had trouble — your credit was not charged"
         → Render STATE_C
      → If AI succeeds:
         → Update session with ai_response / product_results
         → Render STATE_B
```

**Why this ordering is correct and what it fixes:**

1. **Credit always deducted before AI call** — no free AI calls. This is already correct in current code.
2. **Refund on AI failure** — currently NOT implemented. `runGeneration()` in V1 and V2 sets `errorType='AI_ERROR'` but does NOT call any refund function. Users silently lose credits when all AI providers fail. Fix: add refund call in the catch block after AI failure (not credit failure).
3. **shouldReuseSession bug (V1)** — the `shouldReuseSession` flag in V1 prevents re-creating a session if one exists but has no recommendations. This is correct for retry behavior. HOWEVER, it also skips `deductCredit()` on retry, which means a user can retry after an AI failure without losing another credit — this is actually the desired behavior. Do not change this.
4. **Double-invoke protection** — `hasGeneratedRef.current` in `GiftFlow.tsx` prevents the `useEffect` from firing twice under React StrictMode. This is correct and should be preserved.

**New refund-credit Edge Function:**

```typescript
// supabase/functions/refund-credit/index.ts
// Called when AI generation fails AFTER credit was successfully deducted
// Body: { session_id: string }
// Returns: { success: boolean, refunded: number }
```

The function calls a new SQL function `refund_user_credit(p_user_id, p_session_id, p_amount DEFAULT 1)` which:
1. Finds the most recent 'usage' credit_transaction for this session
2. Inserts a reverse 'refund' transaction (amount positive, type='refund')
3. Restores `credits_remaining` on the originating `credit_batch`
4. Recalculates and updates `users.credits_balance`

```sql
CREATE OR REPLACE FUNCTION public.refund_user_credit(
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_new_balance numeric;
BEGIN
  -- Find the batch used for this session's deduction
  SELECT batch_id INTO v_batch_id
  FROM public.credit_transactions
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND type = 'usage'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no usage transaction found, nothing to refund
  IF v_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No usage transaction found');
  END IF;

  -- Insert refund transaction
  INSERT INTO public.credit_transactions (user_id, type, amount, batch_id, session_id, metadata)
  VALUES (p_user_id, 'refund', p_amount, v_batch_id, p_session_id,
    jsonb_build_object('reason', 'ai_generation_failed'));

  -- Restore batch credits
  UPDATE public.credit_batches
  SET credits_remaining = credits_remaining + p_amount
  WHERE id = v_batch_id
    AND user_id = p_user_id;

  -- Recalculate and update user balance
  SELECT COALESCE(SUM(credits_remaining), 0) INTO v_new_balance
  FROM public.credit_batches
  WHERE user_id = p_user_id
    AND is_expired = false
    AND credits_remaining > 0
    AND expires_at > now();

  UPDATE public.users
  SET credits_balance = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'refunded', p_amount, 'new_balance', v_new_balance);
END;
$$;
```

**Frontend integration for refund:**

In `useGiftSession.ts` (V1), inside `runGeneration()`, after the AI call fails in the catch block:

```typescript
// After AI failure (not credit failure — credit failure has already returned early)
// Attempt refund silently — don't block error display
if (sessionId && !isNoCreditError(typedError)) {
  invokeAuthedFunction('refund-credit', { session_id: sessionId })
    .catch(() => console.error('Refund failed — manual intervention needed'));
  // Update session status
  supabase.from('gift_sessions').update({ status: 'errored' })
    .eq('id', sessionId).eq('user_id', currentUserId);
}
```

Error message shown to user when refund fires: "AI had trouble — your credit was returned. Try again."
Error message when refund cannot be confirmed: "AI had trouble. If your credit was charged, contact support."

### 4.4 Regeneration Logic

**Plan limits:**
| Plan | Max Regenerations per Session |
|------|-------------------------------|
| Spark | 1 |
| Thoughtful | 2 |
| Confident | 3 |
| Gifting Pro | ∞ |

**Regeneration is FREE within the session** — no credit deducted. The session already paid; regen is fixing the AI's output, not starting a new session.

**Flow:**
1. User clicks "Regenerate ideas" button
2. `planLimits.canRegenerate(giftSession.regenerationCount)` checked client-side
3. If at limit: `UpgradeModal` opens instead
4. If within limit: `giftSession.regenerate(onRegenerateParams)` called
5. `runGeneration()` with `isRegeneration: true` — skips `createSession()` and `deductCredit()`, reuses existing `sessionId`
6. Calls AI again with same params + `is_regeneration: true`
7. `generate-gifts` Edge Function checks `regenerationLimit(plan)` server-side — returns 403 if at limit
8. On success: `regenerationCount` incremented, new recommendations replace old

**Button state display:**
- `0/1 used`: "🔄 Regenerate ideas  0/1"
- `1/1 used` (at limit): button disabled or shows upgrade modal on click
- Unlimited plan: "🔄 Regenerate ideas  ∞"

**Bug fix required:** `regeneration_count` column is not incremented in the DB currently. The Edge Function receives `is_regeneration: true` but does not UPDATE `gift_sessions.regeneration_count`. Add this to the Edge Function's success path and ensure the column exists.

### 4.5 Plan Gate Enforcement Per Step

| Step | Feature | Spark | Thoughtful | Confident | Gifting Pro |
|------|---------|-------|-----------|----------|------------|
| 1 | Selectable recipients | 1 | 5 | 15 | ∞ |
| 1 | Add new recipient | Up to plan limit | Up to plan limit | Up to plan limit | ∞ |
| 2 | Cultural/regional occasions | ✅ all | ✅ all | ✅ all | ✅ all |
| 3 | All budget ranges | ✅ | ✅ | ✅ | ✅ |
| 4 | Context field | ✅ | ✅ | ✅ | ✅ |
| 5 | Store count in buy links | 1 (Amazon) | 1-2 | All | All |
| 5 | Signal Check | ❌ | ❌ | ✅ | ✅ |
| 5 | Regenerations | 1 | 2 | 3 | ∞ |
| 5 | Priority AI model | ❌ | ❌ | ❌ | ✅ |

Enforcement layers:
- **UI:** Disabled state + lock icon + upgrade CTA at the feature location
- **API:** Edge Functions validate plan before serving locked features
- **DB:** RLS does not currently enforce plan limits (by design — logic lives in app/function layer)

### 4.6 Edge Cases

1. **User starts flow, closes browser mid-step.** Session not yet created (created at Step 4). No orphan session. Input data is lost. User returns to a fresh Step 1.

2. **User closes browser after Step 4 click but before session is created.** Network request in flight. If `createSession` INSERT completed, orphan 'active' session exists. Future: 24h cron marks it 'abandoned'.

3. **User resumes via URL `?session=UUID` after 24h.** Fetch session from DB. If `status='abandoned'` or `updated_at < now() - 24h`: show "This session expired — [Start New]." Do not attempt AI generation.

4. **User has 0 recipients.** Step 1 shows empty state: "Add your first person to get started" → inline form appears, no recipient cards. Cannot proceed until at least one recipient is added.

5. **User on Spark with 1 recipient (limit reached) and no saved recipients yet.** Step 1 shows: Add card shows upgrade overlay. User cannot add new recipients. Must upgrade or use the one existing recipient.

6. **AI returns fewer than 3 recommendations.** `validateAIResponse()` in the Edge Function requires exactly 3 recommendations. If the AI returns 2, the function treats this as a parse error and retries once (V1) or falls back providers. If all attempts fail, credits are refunded and STATE_C shows.

7. **AI returns recommendations outside budget.** `budget_enforcer` node (LangGraph V2) or deterministic filtering in the Edge Function removes out-of-budget items. If fewer than 3 remain after filtering, `budgetAssessment` / `warningMessage` is set. The budget warning card in STATE_B appears.

8. **Network error during AI call.** V1: caught as generic error, STATE_C. V2: SSE stream drops → falls back to polling → 20 attempts × 1s → timeout → STATE_C. Refund triggered in both paths.

9. **User clicks Regenerate rapidly.** "Regenerate ideas" button is disabled while `isGenerating || isRegenerating`. Debounce via the disabled state. Double-click safe.

10. **User navigates back from Step 5 during loading.** `goBack()` detects `currentStep === 5` and `hasGeneratedRef.current === true`, shows `showResetWarning` dialog. If user confirms reset, `giftSession.resetSession()` clears all session state. Credit already deducted — user will need to spend another credit. Warning copy must be explicit: "Going back will use another credit for new results."

11. **User opens two tabs with same session.** Two tabs both reach Step 5. First tab to complete generation saves results. Second tab's `generateGifts` call with `shouldReuseSession: true` finds `sessionId` already set and `recommendations` still null — will call AI again. This double-generation creates two sessions (different `createSession` calls in each tab). No collision. However, user pays 2 credits. No mitigation currently — acceptable as an edge case.

12. **Prefill URL params: recipient exists.** `preloadRecipient()` in `GiftFlow.tsx` fetches and validates the recipient belongs to the current user. `setSelectedRecipient()` called. `isPreloaded: true` banner shows. User sees Step 1 with recipient pre-selected and can click "Continue" immediately.

13. **Prefill URL params: recipient was deleted.** `preloadRecipient()` gets empty data (RLS prevents cross-user access). `setSelectedRecipient` never called. Step 1 shows with empty selection — no crash. No error shown (could improve: show "Pre-filled person not found" toast).

14. **User's plan changes mid-session.** `usePlanLimits` fetches plan once on mount. If plan changes (e.g., credit pack expires), the hook doesn't re-fetch until remount. For critical enforcement (regeneration, signal check): Edge Functions re-validate plan from DB on each call. Client-side limit checks may briefly show wrong state but API enforcement is the source of truth.

15. **User selects a gift they already gave this recipient.** `get_recent_past_gifts()` function feeds into the LangGraph pipeline — the `past_gift_retriever` node passes history to the generator to avoid repeats. On V1 this is not enforced. On V2, if the AI recommends something identical to a past gift, the `personalization_validator` node should penalize it. No UI-level duplicate warning currently.

### 4.7 Prefill Logic (URL Params)

**Parsing:** `useSearchParams()` in `GiftFlow.tsx` reads params on mount.

**Supported params:**
| Param | Type | Behavior |
|-------|------|---------|
| `recipient` | UUID | Fetch recipient from DB, auto-select |
| `occasion` | slug string | Auto-select occasion chip in Step 2 |
| `budget_min` | number | Auto-set custom budget min |
| `budget_max` | number | Auto-set custom budget max |
| `context` | URL-encoded string | Auto-fill `specialContext` field |

**Behavior rules:**
- All params are hints, not locks — user can change any pre-filled value.
- `isPreloaded` banner appears at Step 1 if `recipient` param was used.
- If `recipient` UUID is not found or doesn't belong to current user: silent — Step 1 shows with no pre-selection.
- "Continue" is enabled immediately when pre-fill produces a valid state.
- Fastest path (all 4 params valid): user sees Step 1 pre-selected, clicks Continue × 4 → Step 5 loads. Under 10 seconds of user interaction.

---

## Section 5 — System Design & Backend

### 5.1 gift_sessions Schema (Authoritative — includes all migration-added columns)

The current schema has accumulated columns across multiple migrations with inconsistent naming. This section defines the authoritative current + required column set:

```sql
-- Existing table with all confirmed/inferred columns:
CREATE TABLE public.gift_sessions (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  recipient_country text DEFAULT NULL,

  -- Step 2 data
  occasion text,
  occasion_date date,

  -- Step 3 data
  budget_min integer,
  budget_max integer,
  currency text NOT NULL DEFAULT 'USD',  -- was 'INR' in original, should be 'USD'

  -- Step 4 data
  context_tags text[] DEFAULT '{}',
  special_context text,              -- code uses this; schema originally had 'extra_notes'

  -- AI output
  results jsonb,                     -- legacy alias for ai_response
  product_results jsonb,             -- product link results from search-products

  -- Selection
  selected_gift_name text,
  selected_gift_index integer,
  selected_gift_note text,           -- NEW: from selection modal "add a note"
  confidence_score numeric,

  -- Session metadata
  status text NOT NULL DEFAULT 'active',  -- was 'in_progress' originally; use 'active'
  credits_used numeric DEFAULT 0,
  regeneration_count integer DEFAULT 0,  -- needs to be incremented on regen
  feedback_rating text,
  feedback_notes text,

  -- V2 LangGraph additions
  personalization_scores jsonb,
  graph_state jsonb,
  node_timings jsonb,
  cultural_rules_applied integer DEFAULT 0,
  past_gifts_checked integer DEFAULT 0,
  engine_version text DEFAULT 'v1',
  feedback_cultural_fit integer,
  feedback_cultural_note text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Migration needed to fix inconsistencies:**
```sql
-- Migration: fix_gift_sessions_schema.sql
-- Run AFTER reviewing current column state

ALTER TABLE public.gift_sessions
  -- Rename extra_notes to special_context if it exists
  RENAME COLUMN extra_notes TO special_context IF EXISTS,
  -- Add missing columns
  ADD COLUMN IF NOT EXISTS selected_gift_note text,
  ADD COLUMN IF NOT EXISTS regeneration_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_results jsonb,
  -- Fix currency default
  ALTER COLUMN currency SET DEFAULT 'USD';

-- Fix status values for existing rows
UPDATE public.gift_sessions
SET status = 'active'
WHERE status = 'in_progress';

-- Add check constraint
ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_status_check,
  ADD CONSTRAINT gift_sessions_status_check
    CHECK (status IN ('active', 'completed', 'abandoned', 'errored'));
```

**New table: feedback_reminders**
```sql
CREATE TABLE IF NOT EXISTS public.feedback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  occasion text NOT NULL,
  occasion_date date,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'dismissed'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_reminders_own ON public.feedback_reminders
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 5.2 RLS Policies (Current + Required)

Current policies for `gift_sessions` are correct:
- `sessions_select_own`: SELECT where `auth.uid() = user_id`
- `sessions_insert_own`: INSERT where `auth.uid() = user_id`
- `sessions_update_own`: UPDATE where `auth.uid() = user_id`
- Superadmin bypass policies exist

**Missing policy — DELETE:**
```sql
-- Allow users to delete sessions that were never completed (for cleanup)
CREATE POLICY sessions_delete_own ON public.gift_sessions
FOR DELETE USING (
  auth.uid() = user_id
  AND selected_gift_name IS NULL
  AND status NOT IN ('completed')
);
```

### 5.3 API / Edge Function Contracts

**Direct Supabase DB calls (frontend → Supabase):**
- `createSession()`: INSERT `gift_sessions`
- `updateSession(sessionId, updates)`: UPDATE `gift_sessions` (for product_results, status)
- `selectGift(giftIndex, giftName)`: UPDATE `gift_sessions` (selected_gift_name, status='completed')
- `trackProductClick(product)`: INSERT `product_clicks`

**Edge Functions called via `invokeAuthedFunction`:**

| Function | Method | When Called | Returns |
|----------|--------|-------------|---------|
| `deduct-credit` | POST | Before AI call | `{ success, remaining }` or `{ error: 'NO_CREDITS' }` |
| `generate-gifts` | POST (V1 only) | After deduct | 3 recommendations + metadata |
| `search-products` | POST | After AI success | Product links array |
| `signal-check` | POST | On-demand from GiftCard | Signal analysis result |
| `award-referral-credits` | POST | After gift selection | Referral credit grant |
| `refund-credit` | POST | After AI failure | `{ success, refunded }` |

**V2 LangGraph API routes (not Supabase functions — these are Vercel/Express routes):**

| Route | Method | Description |
|-------|--------|-------------|
| `/api/recommend/start` | POST | Kicks off LangGraph pipeline |
| `/api/recommend/stream` | GET | SSE stream of node progress |
| `/api/recommend/status` | GET | Polling fallback |
| `/api/recommend/recover` | POST | Re-run stale/stuck pipeline |
| `/api/recommend/select` | POST | Saves gift selection |

**NEW Edge Function: refund-credit**

```typescript
// supabase/functions/refund-credit/index.ts
// Called when generate-gifts fails after credit was deducted
// Auth: Bearer token required
// Body: { session_id: string }
// Returns: { success: boolean, refunded: number, new_balance: number }
// Calls: refund_user_credit() RPC
```

### 5.4 Analytics Events (PostHog)

All events are fired from `GiftFlow.tsx` or step components. Use `posthog.capture()` (or the PostHog React hook).

| Event | Properties | When Fired |
|-------|-----------|-----------|
| `gift_flow_started` | `{ entry_source, has_prefill, plan }` | GiftFlow.tsx mount |
| `gift_flow_step_viewed` | `{ step, session_id }` | Each step render |
| `gift_flow_step_completed` | `{ step, duration_ms }` | "Continue" click |
| `gift_flow_recipient_selected` | `{ recipient_id, was_prefilled }` | Step 1 confirm |
| `gift_flow_occasion_selected` | `{ occasion, category, has_date }` | Step 2 confirm |
| `gift_flow_budget_selected` | `{ budget_min, budget_max, preset }` | Step 3 confirm |
| `gift_flow_context_added` | `{ has_tags, tag_count, has_text, char_count }` | Step 4 confirm |
| `gift_flow_generation_started` | `{ plan, credits_before }` | "Continue" at Step 4 |
| `gift_flow_generation_succeeded` | `{ provider_used, latency_ms, attempt, engine_version }` | AI success |
| `gift_flow_generation_failed` | `{ error_type, refund_issued, plan }` | AI error |
| `gift_flow_regenerated` | `{ regen_count, plan }` | Regenerate clicked |
| `gift_flow_gift_selected` | `{ recommendation_index, confidence_score, had_note }` | Gift picked |
| `gift_flow_buy_link_clicked` | `{ store, gift_index, is_search_link }` | External link opened |
| `gift_flow_abandoned` | `{ last_step, time_spent_ms, plan }` | Page unmount without completion |
| `gift_flow_signal_check_viewed` | `{ gift_index, is_first_time, plan }` | Signal check opens |

Analytics are NOT currently implemented in the codebase. This is a full implementation task.

### 5.5 Error Handling Strategy

| Error Type | User-Facing Message | Technical Action |
|-----------|---------------------|-----------------|
| `NO_CREDITS` | "You've used all your credits" | Show STATE_D, mark session 'abandoned', no AI call |
| `AI_PROVIDER_FAILURE` | "AI had trouble — your credit was returned. Try again." | Refund credit, mark session 'errored', show STATE_C |
| `AI_PARSE_ERROR` | "AI had trouble — your credit was returned. Try again." | Auto-retry once (V1), refund if all retries fail |
| `RATE_LIMITED` | "Too many requests — wait a minute and try again." | Show STATE_C with timer if retry_after provided |
| `NETWORK_TIMEOUT` | "Check your connection and retry." | Show STATE_C, retain session ID for retry |
| `AUTH_REQUIRED` | "Your session expired. Please sign in again." | Trigger re-auth redirect |
| `GENERIC` | "Something went wrong. Try again." | Show STATE_C |

---

## Section 6 — Component Breakdown

### File Structure

```
src/
├── pages/
│   └── GiftFlow.tsx                 (orchestrator — owns step state + navigation)
├── components/gift-flow/
│   ├── GiftFlowStepper.tsx          (unused — legacy, can delete)
│   ├── StepProgress.tsx             (5-dot progress indicator)
│   ├── StepRecipient.tsx            (Step 1)
│   ├── StepOccasion.tsx             (Step 2)
│   ├── StepBudget.tsx               (Step 3)
│   ├── StepContext.tsx              (Step 4)
│   ├── StepResults.tsx              (Step 5 — all states)
│   ├── GiftCard.tsx                 (single recommendation card in STATE_B)
│   ├── ProductLinks.tsx             (buy link row in GiftCard)
│   ├── SignalCheck.tsx              (premium signal analysis in GiftCard)
│   ├── NoCreditGate.tsx             (STATE_D — paywall)
│   ├── CrossBorderSelect.tsx        (country override in Step 1)
│   └── CrossBorderSection.tsx       (container for cross-border UI — Step 3)
├── hooks/
│   ├── useGiftSession.ts            (factory — selects V1 or V2 impl)
│   ├── useGiftSessionV2.ts          (LangGraph SSE/polling implementation)
│   ├── giftSessionShared.ts         (shared helpers: invokeAuthedFunction, etc.)
│   └── giftSessionTypes.ts          (shared types: GiftSessionState, etc.)
└── lib/
    └── geoConfig.ts                 (PLANS, BUDGET_CHIPS, OCCASIONS, CONTEXT_TAGS, etc.)
```

### Component Specs

**`GiftFlow.tsx` — Orchestrator**

Props: none (reads user from AuthContext)

State: see Section 4.1 for full state list

Key responsibilities:
- Parse URL params on mount, pre-fill state
- Manage step transitions with validation
- Hold all step-collected data (recipient, occasion, budget, context)
- Pass `giftSession` object to `StepResults`
- Handle back navigation with "clear results?" warning dialog
- Show `NoCreditGate` when `creditsBalance <= 0` BEFORE rendering wizard
- Call `refreshProfile()` after generation to sync credit balance

Known issue: `creditsBalance` check at page top causes false-positive paywall during initial load. Fix: `isCheckingCredits` guard exists but should also prevent rendering of `NoCreditGate` during the check.

---

**`StepProgress.tsx` — Progress Indicator**

Props: `{ currentStep: number }` (1–5)

Renders: 5 dots. Current = amber filled circle. Past = smaller amber dot. Future = muted gray dot.

Currently implemented as a simple row of divs. No change needed.

---

**`StepRecipient.tsx` — Step 1**

Props:
```typescript
interface StepRecipientProps {
  selectedRecipient: Recipient | null;
  onSelectRecipient: (r: Recipient) => void;
  recipientCountry: string | null;
  onRecipientCountryChange: (c: string | null) => void;
  isCrossBorder: boolean;
  onCrossBorderChange: (v: boolean) => void;
  onContinue: () => void;
  userPlan: string;
  isFirstTime?: boolean;
  isPreloaded?: boolean;
}
```

State managed: `showInlineForm`, `upgradeOpen`, `showPrefilledBanner`, `inlineForm`, `customInterest`, `howItWorksDismissed`

Queries: `gift-flow-recipients` via React Query — SELECT from `recipients` where `user_id = me`

Mutations: `addRecipient` — INSERT into `recipients`, then auto-select

Key interactions:
- Click recipient card → `onSelectRecipient` + update country/cross-border flags
- "Add Someone New" → expand inline form → submit → `addRecipient.mutate()`
- Click locked card → `setUpgradeOpen(true)` → `UpgradeModal`

Dependencies: `usePlanLimits`, `useAuth`, React Query, `supabase`

---

**`StepOccasion.tsx` — Step 2**

Props:
```typescript
interface StepOccasionProps {
  selectedOccasion: string | null;
  onSelectOccasion: (id: string) => void;
  occasionDate: string | null;
  onOccasionDateChange: (date: string | null) => void;
  targetCountry: string;
  onContinue: () => void;
  onBack: () => void;
}
```

State managed: none (pure controlled)

Key interactions:
- Click occasion chip → `onSelectOccasion(id)`
- Date input change → `onOccasionDateChange`
- "I'm not sure yet" checkbox → `onOccasionDateChange(null)`
- Urgency calculation: `getDaysUntil(occasionDate)` < 3 → show urgency banner

---

**`StepBudget.tsx` — Step 3**

Props:
```typescript
interface StepBudgetProps {
  budgetMin: number | null;
  budgetMax: number | null;
  onBudgetChange: (min: number, max: number) => void;
  isCrossBorder: boolean;
  recipientCountry: string | null;
  relationship: string | null;
  userCountry?: string;
  onContinue: () => void;
  onBack: () => void;
}
```

State managed: `customOpen` (collapsible)

Key interactions:
- Chip click → `onBudgetChange(chip.min, chip.max)` + closes custom range
- Custom inputs → `onBudgetChange(newMin, newMax)`
- Budget insight: computed from `getBudgetInsight(min, max, relationship)`

---

**`StepContext.tsx` — Step 4**

Props:
```typescript
interface StepContextProps {
  specialContext: string;
  onSpecialContextChange: (text: string) => void;
  contextTags: string[];
  onContextTagsChange: (tags: string[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
  canUseSignalCheck?: boolean;
  creditsBalance?: number;
}
```

State managed: none (pure controlled)

Key interaction: tag toggle, textarea change, credit display

---

**`StepResults.tsx` — Step 5 (orchestrates all states)**

Props:
```typescript
interface StepResultsProps {
  giftSession: ReturnType<typeof useGiftSession>;
  selectedRecipient: Recipient;
  selectedOccasion: string;
  currency: string;
  recipientCountry: string | null;
  userPlan: string;
  onRegenerateParams: GenerateGiftParams;
  onCreditsChanged: () => void;
}
```

State managed: `messageIndex`, `upgradeOpen`, `isRegenerating`

Renders: routes between loading, error (multiple variants), complete, and results states based on `giftSession` state properties.

Key interactions:
- `handleRegenerate()`: plan gate check → `giftSession.regenerate(onRegenerateParams)`
- Gift card `onSelect`: calls `giftSession.selectGift(index, name)` — **needs Selection Modal added here**

---

**`GiftCard.tsx` — Individual Recommendation Card**

Displays one recommendation. Contains `ProductLinks` and `SignalCheck` subcomponents. Triggers `onSelect` callback.

**Required addition:** Selection Modal. When `onSelect` is called:
1. Show `Dialog` with gift name, optional note input, optional reminder checkbox
2. On "Yes, This One": call actual `onSelect(index, name)` with note + reminder data
3. `onSelect` in parent calls `giftSession.selectGift(index, name)` + persists note + reminder

---

**`NoCreditGate.tsx` — STATE_D**

Props: none (standalone, queries plan data internally)

Renders: paywall pricing cards. Used in two locations:
1. `GiftFlow.tsx` top-level (when `creditsBalance <= 0` on page load)
2. `StepResults.tsx` (when `errorType === 'NO_CREDITS'` from generation)

---

**`useGiftSession.ts` — Hook Interface**

Full return type (both V1 and V2):
```typescript
interface UseGiftSessionReturn {
  // State
  sessionId: string | null;
  isGenerating: boolean;
  isSearchingProducts: boolean;
  recommendations: GiftRecommendation[] | null;
  productResults: ProductResult[] | null;
  occasionInsight: string | null;
  budgetAssessment: string | null;
  culturalNote: string | null;
  aiProviderUsed: string | null;
  aiLatencyMs: number | null;
  aiAttempt: number | null;
  error: string | null;
  errorType: 'NO_CREDITS' | 'AI_ERROR' | 'AI_PARSE_ERROR' | 'RATE_LIMITED' | 'AUTH_REQUIRED' | 'GENERIC' | null;
  selectedGiftIndex: number | null;
  isComplete: boolean;
  regenerationCount: number;
  // V2 only (null in V1)
  engineVersion: string | null;
  currentNode: string | null;
  nodesCompleted: string[];
  nodeTimings: Record<string, number> | null;
  warningCode: string | null;
  warningMessage: string | null;
  avgPersonalizationScore: number | null;

  // Actions
  generateGifts: (params: GenerateGiftParams) => Promise<void>;
  regenerate: (params: GenerateGiftParams) => Promise<void>;
  selectGift: (giftIndex: number, giftName: string) => Promise<void>;
  trackProductClick: (product: ProductClickParams) => Promise<void>;
  resetSession: () => void;
}
```

---

## Section 7 — Integration Points

### Integration Map

| Integrates With | Direction | Purpose | Fallback if fails |
|-----------------|-----------|---------|------------------|
| Recipient Management | ← | Step 1 recipient list + add | Show empty state, allow manual entry |
| AI Provider Routing | ← | `generate-gifts` uses provider chain | All providers fail → refund + STATE_C |
| Credits System | ↔ | Deduct before AI, refund on fail | Show STATE_C if deduct fails |
| Plans & Limits | ← | Gate regen, stores, signal check | API enforcement as safety net |
| Product Linking | → | Buy links in Step 5 from `search-products` | Show no buy links gracefully |
| Signal Check | → | Premium relationship analysis per gift | Show "unavailable" inline |
| Recipient Memory | ← | Past gifts fed into AI prompt (LangGraph) | V1: no history sent. V2: uses `get_recent_past_gifts` |
| Gift History | → | Every completed session persists as history | Failure is silent (history is non-critical path) |
| Post-Gift Feedback | → | Selection creates `feedback_reminders` row | Toast-only fallback (currently implemented) |
| Occasion Engine | → | `occasion_date` saved for recipient reminders | Null date = no reminder created |
| Analytics (PostHog) | → | Events throughout flow | Silent failure on analytics |
| Referral System | → | `award-referral-credits` on gift selection | Silent failure, no retry needed |

### Integration: AI Provider Routing (most critical)

`generateGifts()` → `callAI()` → `generate-gifts` Edge Function.

That function calls `callAIWithFallback()` from `_shared/ai-providers.ts` which uses `getProviderChain(plan)`.

Provider chains by plan (from `generate-gifts` Edge Function):
- `spark`: Groq → Gemini → Claude Haiku
- `thoughtful`: Gemini → Claude Haiku → Groq
- `confident`: Claude Haiku → Gemini → Groq
- `gifting-pro`: Claude Sonnet → Haiku → Gemini Pro

Gift Flow does NOT need to know provider details. Its contract is:
- `success` → render STATE_B
- `error.type === 'NO_CREDITS'` → render STATE_D (deduct step failed)
- Any other error → attempt refund → render STATE_C

### Integration: Credits System

Deduct happens in `runGeneration()` via `deductCredit()` calling the `deduct-credit` Edge Function, which calls `deduct_user_credit()` RPC (atomic, uses row-level lock).

The RPC updates `credit_batches`, inserts into `credit_transactions`, and updates `users.credits_balance`. The `useCredits` real-time subscription in the credits hook listens to `users` table UPDATE events and refreshes the displayed balance.

Gift Flow additionally calls `refreshProfile()` after generation completes to sync `creditsBalance` displayed in the flow header.

### Integration: Product Linking (search-products)

Called immediately after AI success in `runGeneration()`. Passes recommendation array + country + plan. Returns `ProductResult[]`. If it fails, `productResults` stays null and `GiftCard` shows no buy links (graceful degradation — not an error state).

### Integration: Recipient Memory (LangGraph V2 only)

The `/api/recommend/start` route triggers the LangGraph pipeline. The `past_gift_retriever` node calls `get_recent_past_gifts(recipient_id)` — a SQL function that returns past completed sessions for this recipient. These are passed as context to the gift generator to avoid recommending duplicates.

In V1 (`generate-gifts` Edge Function), past gifts are NOT passed. This is a known gap.

---

## Section 8 — Edge Cases & Error States

### Wireframes for Key Error States

**Session Expired (>24h old active session resumed via URL):**
```
┌──────────────────────────────────────────────┐
│           ⏱️                                 │
│                                              │
│   This session has expired                  │
│                                              │
│   Sessions expire after 24 hours.           │
│   Start a new one — your credits are safe.  │
│                                              │
│   [Start New Gift Flow]                     │
└──────────────────────────────────────────────┘
```
Implementation: check `session.updated_at < now() - 24h` when resuming from URL. Reset all state and show this card in place of the wizard.

---

**Recipient Deleted Mid-Flow (recipient_id gone):**
```
┌──────────────────────────────────────────────┐
│           👤                                 │
│                                              │
│   That person is no longer saved            │
│                                              │
│   Looks like this recipient was deleted.     │
│                                              │
│   [Go Back to Step 1]                       │
└──────────────────────────────────────────────┘
```
Implementation: in `createSession()`, if `recipient_id` no longer exists in DB (FK constraint would fail), catch the error and show this. Navigate back to Step 1 with `setCurrentStep(1)`.

---

**Network Offline:**
```
┌──────────────────────────────────────────────┐
│           📶                                 │
│                                              │
│   You appear to be offline                  │
│                                              │
│   Check your connection and try again.      │
│                                              │
│   [Try Again]                               │
└──────────────────────────────────────────────┘
```
Implementation: in `runGeneration()` catch block, check for network errors (`TypeError: Failed to fetch`). Set a specific `errorType: 'NETWORK'`. No credit deducted if error is before deduct step. If after: refund may have failed too — show "contact support" sub-message.

---

**Rate Limited:**
```
┌──────────────────────────────────────────────┐
│           ⏰                                 │
│                                              │
│   Too many requests                         │
│                                              │
│   Please wait a minute before trying again. │
│                                              │
│   (countdown timer if retry_after available) │
│                                              │
│   [Try Again in 60s]  ← disabled, counts down│
└──────────────────────────────────────────────┘
```

---

**Regeneration at Plan Limit:**
```
Button: [🔒 No more regenerations on Spark]
→ Click → UpgradeModal opens

UpgradeModal highlights: "Get more regenerations"
Plans shown: Thoughtful (2/session), Confident (3/session), Gifting Pro (∞)
```

---

**Budget Filter Result: Fewer Than Expected:**
```
┌─ Limited results in your exact budget ───────┐
│ ⚠                                            │
│ We found 2 strong options within $30-50.     │
│ The third option is just outside at $52.     │
│                                              │
│ [Widen Budget +$20]  (adjusts budgetMax)    │
└──────────────────────────────────────────────┘
```
Implementation: `warningMessage` from AI response shown as amber card above results. "Widen Budget" button: NOT currently implemented. V2 feature.

---

**Plan Downgraded Mid-Session:**
No specific UI treatment. API enforcement catches the downgrade. If a user was on Confident and drops to Spark during a session:
- Next `regenerate()` call: Edge Function returns 403 (plan limit)
- Frontend catches 403, shows UpgradeModal
- Signal check: same — 403 from Edge Function, show "upgrade required" inline

No mid-session warning needed — the gate is hit naturally when the feature is attempted.

---

## Section 9 — Acceptance Criteria

### P0 — Must Have (launch blocker)

- [ ] All 5 steps render correctly on desktop (>768px) and mobile (375px min)
- [ ] StepProgress shows correct filled/unfilled state at each step
- [ ] Step 1: recipient list loads, selection persists to Step 5
- [ ] Step 1: inline add-recipient form works, plan limit enforced with UpgradeModal
- [ ] Step 1: locked recipient cards show upgrade prompt, not crash
- [ ] Step 2: occasion selection enables Continue; date is optional
- [ ] Step 2: regional occasions show based on `recipientCountry` from Step 1
- [ ] Step 3: budget chips set min/max; custom range works with validation
- [ ] Step 3: Continue disabled when `budgetMax < budgetMin`
- [ ] Step 4: context tags multi-select; free text capped at 300 chars
- [ ] Step 4: credit count displays correctly in credit notice
- [ ] `NoCreditGate` shown at page level when `creditsBalance = 0` (not during `isCheckingCredits`)
- [ ] Credit is deducted BEFORE AI call begins (existing correct order — must not regress)
- [ ] Credit deduction calls `deduct-credit` Edge Function → `deduct_user_credit()` RPC atomically
- [ ] `users.credits_balance` decreases by exactly 1 per successful session
- [ ] `credit_transactions` records 'usage' type with correct `session_id`
- [ ] If AI fails after all fallback providers: refund-credit Edge Function called, `credit_transactions` records 'refund'
- [ ] STATE_C message says "credit was returned" only when refund actually succeeded
- [ ] STATE_D shown for NO_CREDITS during deduction (not after AI call)
- [ ] Step 5 STATE_A loading shows node progress (V2) or rotating messages (V1)
- [ ] Step 5 STATE_B shows 3 recommendations sorted by confidence descending
- [ ] "I'll Pick This One" opens Selection Modal (NEW — not yet implemented)
- [ ] Selection Modal saves `selected_gift_name`, `selected_gift_index`, `selected_gift_note` to DB
- [ ] Gift selection sets `gift_sessions.status = 'completed'`
- [ ] Gift selection triggers `award-referral-credits` call
- [ ] Recipients' `last_gift_date` updated on gift selection (V1 only — V2 uses `/api/recommend/select`)
- [ ] Regenerate button shows `count/limit` and respects plan limit (client-side check + API enforcement)
- [ ] Regeneration uses existing session ID, does NOT deduct credit
- [ ] `gift_sessions.regeneration_count` incremented in DB on each regeneration
- [ ] URL prefill: `?recipient=UUID` auto-selects in Step 1 with prefill banner
- [ ] URL prefill: `?occasion=slug` auto-selects in Step 2
- [ ] Back button from Step 5 with existing results shows "clear recommendations?" warning
- [ ] Buy links open in new tab (`target="_blank" rel="noopener noreferrer"`)
- [ ] Product click tracked in `product_clicks` table
- [ ] RLS prevents cross-user session reads (`auth.uid() = user_id`)
- [ ] `schema fix migration` runs without errors on existing data (column renames, status values)

### P1 — Should Have (launch soon)

- [ ] Selection Modal: reminder checkbox creates row in `feedback_reminders` table
- [ ] Analytics events fire for all 15 events in Section 5.4 (PostHog integration)
- [ ] Step 5 timeout >20s shows "taking longer than usual" message
- [ ] Session expired message when resuming >24h old session from URL
- [ ] State E: "Save reminder" actually persists (not just toast)
- [ ] Budget warning card from AI has "Widen budget" button working
- [ ] `useCredits` real-time subscription reflects deduction immediately after generation
- [ ] Mobile: all steps fully usable at 375px with no horizontal scroll (budget chips scroll horizontally within row, not the page)
- [ ] `isCheckingCredits` state prevents NoCreditGate false-positive on initial load
- [ ] `hasGeneratedRef` prevents double-generation under React StrictMode
- [ ] Toast notifications on: successful regeneration, gift selection save, refund received
- [ ] Back button at Step 5 during LOADING shows warning (already exists but copy should mention credit impact)
- [ ] Locked store links in buy row show lock icon + upgrade tooltip, not broken links

### P2 — Nice to Have (post-launch)

- [ ] Animated slide transitions between steps (existing Framer Motion setup, just wire direction)
- [ ] Confetti animation on gift selection (STATE_E)
- [ ] "Find Another Gift" from STATE_E pre-fills Step 1 with same recipient
- [ ] Undo selection (within 60 seconds of selecting, "Undo" toast appears)
- [ ] Streaming AI response via SSE (V2 already supports it — expose to UI)
- [ ] URL `?session=UUID` for mid-session refresh recovery
- [ ] 24h cron job to mark stale active sessions as abandoned
- [ ] Custom occasion input (free text) in Step 2

---

## Section 10 — Open Questions & Decisions Needed

1. **Should the Selection Modal be in `GiftCard.tsx` or `StepResults.tsx`?**
   - Option A: In `GiftCard.tsx` — self-contained, simpler prop surface
   - Option B: In `StepResults.tsx` — single modal instance, shared state easier to manage
   - Recommendation: Option A — each card manages its own modal state. Simpler for Codex to implement without touching existing parent components.

2. **Should regeneration count reset between sessions?**
   - Option A: Per-session (current behavior — `regenerationCount` in hook state resets on `resetSession()`)
   - Option B: Per-day across sessions (more restrictive, harder to implement)
   - Recommendation: Per-session (Option A). Consistent with current code, simpler, more forgiving.

3. **What happens if refund-credit Edge Function also fails?**
   - Current answer: silent console.error. User has lost a credit.
   - Option A: Queue refund for retry (requires persistent queue — complex)
   - Option B: Log to `credit_transactions` with `type='refund_failed'` for admin review + show user "contact support" message
   - Recommendation: Option B. Low overhead, actionable for support. Add `refund_failed` to credit_transactions type enum.

4. **Should credit pre-check use `creditsBalance` local state or always re-fetch from DB?**
   - Current: uses local `creditsBalance` state (stale risk)
   - Option A: Re-fetch from DB on every Step 4 Continue click (adds latency, but guarantees accuracy)
   - Option B: Trust local state + let deduct-credit RPC be the authoritative gate (current)
   - Recommendation: Option B is correct — the RPC is atomic. Local state pre-check is UX optimization only. Both checks are needed.

5. **Should `special_context` column rename from `extra_notes` be done with a migration or a view?**
   - Current: code inserts `special_context` but schema has `extra_notes`. Silent failures possible.
   - Option A: Migration `RENAME COLUMN extra_notes TO special_context` — simple, permanent
   - Option B: Keep both columns, deprecate `extra_notes`
   - Recommendation: Option A. The rename migration is low-risk and eliminates the inconsistency permanently.

6. **V1 vs V2 LangGraph path — which should be default for launch?**
   - Current: `VITE_USE_LANGGRAPH=false` → V1 (uses `generate-gifts` Edge Function)
   - V2 requires `/api/recommend/start`, `/api/recommend/stream` routes to be deployed
   - Recommendation: Launch with V1 as default. V2 can be enabled per-environment via env var once routes are verified. Do not block gift flow launch on LangGraph route availability.

7. **Should budget chips be scrollable or wrapping on mobile?**
   - Current: `overflow-x-auto pb-1` → horizontal scroll row
   - Alternative: wrap chips to 2-per-row on narrow screens
   - Recommendation: Keep horizontal scroll — matches native app patterns and avoids layout shift.

8. **Post-selection: should "Find Another Gift" pre-fill Step 1 with same recipient?**
   - Option A: Navigate to `/gift-flow?recipient=SAME_ID` → recipient pre-filled
   - Option B: Navigate to clean `/gift-flow` → Step 1 empty
   - Recommendation: Option A — same recipient is the most common use case (they already know who needs a gift), reduces friction.

9. **Should `creditsBalance` shown in Step 4 reflect real-time subscription or poll?**
   - Currently: `creditsBalance` in `GiftFlow.tsx` is set by `refreshProfile()` which fetches on mount and after generation. No real-time subscription in this component.
   - Option A: Add real-time subscription in `GiftFlow.tsx`
   - Option B: Keep polling — `refreshProfile()` is called after every generation
   - Recommendation: Option B is sufficient. Users don't need real-time updates in the flow; the post-generation refresh is enough.

10. **Should the Selection Modal note field be free text or structured?**
    - Option A: Free text ("Going to wrap with brown paper...")
    - Option B: Structured (delivery notes, wrapping preferences, etc.)
    - Recommendation: Free text, max 150 chars. Structured fields are premature for V1.

---

## Section 11 — Rollout & Migration

### Schema Migration Plan

**Step 1: Run `fix_gift_sessions_schema.sql`**
```sql
-- Verify column existence before renaming
ALTER TABLE public.gift_sessions 
  ADD COLUMN IF NOT EXISTS special_context text;

-- Copy data from extra_notes if it has values
UPDATE public.gift_sessions 
SET special_context = extra_notes 
WHERE extra_notes IS NOT NULL AND special_context IS NULL;

-- Add remaining missing columns
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS selected_gift_note text,
  ADD COLUMN IF NOT EXISTS regeneration_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_results jsonb;

-- Fix status values
UPDATE public.gift_sessions SET status = 'active' WHERE status = 'in_progress';
ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_status_check;
ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_status_check
    CHECK (status IN ('active', 'completed', 'abandoned', 'errored'));

-- Fix currency default
ALTER TABLE public.gift_sessions 
  ALTER COLUMN currency SET DEFAULT 'USD';
```

**Step 2: Deploy `refund-credit` Edge Function**

Deploy `supabase/functions/refund-credit/index.ts` via `supabase functions deploy refund-credit`.

**Step 3: Deploy SQL function `refund_user_credit`**

Run as part of a migration (see Section 4.3 for full SQL).

**Step 4: Create `feedback_reminders` table**

Run migration (see Section 5.1 for full SQL).

### Feature Flag

No new feature flag needed. The gift flow is live in production. Changes are incremental fixes + additions. If a new component (Selection Modal) needs staged rollout, wrap in `if (import.meta.env.VITE_SELECTION_MODAL_V2 === 'true')` during development.

### Rollout Sequence

1. **Day 1:** Deploy schema migration. No user-visible change.
2. **Day 2:** Deploy `refund-credit` function. Wire into `runGeneration()` catch block. Test with deliberately failing AI call.
3. **Day 3:** Implement Selection Modal. Test gift selection end-to-end.
4. **Day 4:** Implement analytics events (PostHog). Monitor funnel.
5. **Week 2:** `feedback_reminders` table + reminder checkbox in modal.
6. **Week 2:** Analytics review — check completion rate, abandon points.

### Rollback

- Schema migration: reversible by removing `ADD COLUMN` additions; `RENAME COLUMN` is reversible with another rename.
- Edge function deploy: previous version auto-preserved by Supabase; `supabase functions deploy refund-credit --version=previous` to rollback.
- Selection Modal: wrap in feature flag `VITE_SELECTION_MODAL_ENABLED`. If flag off, `GiftCard` calls `onSelect` directly (existing behavior).

---

## Appendix — Known Issues Summary Table

| # | Issue | Location | Severity | Fix in this PRD? |
|---|-------|----------|----------|-----------------|
| 1 | Credits not deducting visually after generation | `GiftFlow.tsx` → `refreshProfile()` race | Medium | Yes — Section 4.3 |
| 2 | NoCreditGate shows during `isCheckingCredits` | `GiftFlow.tsx` top-level check | Low | Yes — Section 9 P1 |
| 3 | "No selection made" in history for all non-completed sessions | Admin view behavior | Low | Explained — not a bug |
| 4 | `useCredits` was crashing (on()/subscribe() order) | `useCredits.ts` | Fixed in code | N/A |
| 5 | Regeneration count not enforced server-side | `gift_sessions.regeneration_count` not updated | Medium | Yes — Section 4.4 |
| 6 | AI failure does NOT refund credit | `runGeneration()` catch block | High | Yes — Section 4.3 |
| 7 | `special_context` vs `extra_notes` column mismatch | DB schema | High | Yes — Section 11 |
| 8 | `shouldReuseSession` in V1 means no second credit deducted on retry | `useGiftSessionV1` | By design | Documented |
| 9 | No Selection Modal — gift selection has no note/reminder capture | `GiftCard.tsx` | Medium | Yes — Section 3.7 |
| 10 | `product_results` column not in any migration | DB schema | Medium | Yes — Section 11 |
