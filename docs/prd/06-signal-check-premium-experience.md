# PRD 06 — Signal Check Premium Experience

**Feature name (internal):** Signal Check  
**Feature name (user-facing):** Signal Check — What Your Gift Says  
**Owner:** Product  
**Version:** 1.0  
**Status:** Partially implemented — audit + redesign PRD  
**Date:** 2026-04-23

---

## Section 0 — Audit of Existing Implementation

### What Exists Today

Signal Check is GiftMind's highest-value premium feature, available exclusively on the Confident (🎯) and Gifting Pro (🚀) plans. It uses an AI-backed relationship psychologist persona to analyze what a chosen gift communicates about the gifter's relationship with the recipient — surfacing positive signals, potential risks, and tuning suggestions.

#### Component Inventory

| File | Type | Purpose |
|------|------|---------|
| `src/components/gift-flow/SignalCheck.tsx` | React Component | Full in-flow UI: locked state, run button, result card, follow-up refinement, revision history |
| `src/lib/signalCheck.ts` | Library | Type definitions, `parseSignalCheckResult`, `parseSignalChecks`, `getSignalFeedbackComparison` |
| `supabase/functions/signal-check/index.ts` | Edge Function | Server-side: plan gate, credit deduction (0.5 credits), rate limiting, AI call, DB writes |
| `src/pages/GiftHistory.tsx` (lines 720–815) | Page Section | Read-only view of past signal checks in history with feedback comparison |
| `src/pages/admin/AdminSettings.tsx` | Admin Page | Feature flag `feature_signal_check`, AI model config `ai_model_signal`, `signal_check_cost`, `signal_checks_per_day` |

#### Current Data Model

**`signal_checks` table (from `src/integrations/supabase/types.ts`):**

```sql
id                    uuid PRIMARY KEY
user_id               uuid → auth.users
session_id            uuid → gift_sessions
gift_name             text
parent_signal_check_id uuid → signal_checks (self-referential for revisions)
revision_number       integer
follow_up_prompt      text | null
result_payload        jsonb  -- SignalCheckResult shape
credits_used          numeric (always 0.5)
created_at            timestamptz
```

**`SignalCheckResult` shape (JSON stored in `result_payload`):**

```ts
{
  positive_signals: string[];        // 2–3 things the gift communicates well
  potential_risks: string[];         // 0–2 risks (can be empty)
  overall_message: string;           // 1–2 sentence relationship read
  confidence_note: string;           // AI's confidence level
  adjustment_suggestions: string[];  // 0–3 tuning ideas
}
```

#### Current Interaction Flow

```
User on Step 5 (Results) → GiftCard renders <SignalCheck> for each recommendation
  
  Locked state (Spark/Thoughtful):
    - If gift has `signal_interpretation` preview text: shows first 80 chars visible + 40 chars blurred
    - "Unlock full Signal Check" button → UpgradeModal (highlights "confident")
    
  Unlocked state (Confident/Gifting Pro), no check yet:
    - Shows preview text if available (first 200 chars, italic)
    - "Signal Check — See what this gift says" button
    - Click → POST /signal-check Edge Function (0.5 credits)
    
  Unlocked state, check complete:
    - Golden card (bg gradient #FAF5E8 → #F5E9C9, border #EDD896)
    - Positive signals (green checkmarks)
    - Potential risks panel (rose/red tones, only if present)
    - Adjustment suggestions panel (indigo, only if present)
    - Overall message + confidence note
    - "Refine the read" section: 3 suggested follow-up prompts + free text textarea
    - Each follow-up = new revision (0.5 credits, saved to DB)
    - Revision history accordion (shows all past revisions in reverse order)
    
  Follow-up refinement:
    - Suggested prompts: "Make this less romantic", "Make this more premium", "Make this feel more playful"
    - Custom text: up to 240 chars
    - Submitting → POST /signal-check with `follow_up_prompt` + `parent_signal_check_id`
    - Server builds context block with previous result + follow-up direction
    - New revision stored and query cache invalidated
```

#### Current Edge Function — Signal Check (`signal-check/index.ts`)

**Plan gating:** `ALLOWED_PLANS = ["confident", "gifting-pro"]`. Returns `403 PLAN_RESTRICTED` for other plans.

**Credit check:** Pre-flight check: `credits_balance < 0.5` → `402 NO_CREDITS` before any AI call.

**Caching (reuse):** If no `follow_up_prompt` and a saved check exists for this `(session_id, gift_name)` combo, the existing result is returned without a new AI call or credit deduction. This is correct — it prevents redundant charges on re-renders.

**Rate limiting:** `rate_limit_events` table, `action = "signal-check"`, 30 per day per user. Enforced via count query. Rate limit event is inserted BEFORE the credit deduction — if credit deduction fails after, the rate limit slot is consumed unnecessarily. 

**AI call:** `callAIWithFallback` using `getProviderChain(plan, "signal-check")` — an AI provider chain configured per plan. Model is admin-configurable (`ai_model_signal`), noted as "Always Sonnet — the premium differentiator."

**Temperature:** 0.6 — moderate. Appropriate for nuanced relationship analysis.

**Result storage:** 
1. Inserts into `signal_checks` table.
2. Updates `gift_sessions.ai_response` JSONB by merging signal check data per gift name into `ai_response.signal_checks[gift_name]`.

**Post-AI analytics:** `gift_sessions.ai_response` is updated with `signal_checks[giftName]` blob that includes `provider`, `latency_ms`, `attempt`. This is non-normalized denormalized storage alongside the primary `signal_checks` table — creates a duplication risk.

#### Plan Configuration

| Plan | `hasSignalCheck` | Signal Check Access |
|------|-----------------|---------------------|
| Spark ✨ | `false` | Locked — upgrade CTA to Confident |
| Thoughtful 💝 | `false` | Locked — upgrade CTA to Confident |
| Confident 🎯 | `true` | Full access |
| Gifting Pro 🚀 | `true` | Full access |

**Credit cost:** 0.5 credits per initial check. 0.5 credits per follow-up revision.

**Daily rate limit:** 30 Signal Checks per user per day.

#### Signal Check in Gift History (`GiftHistory.tsx`)

When a session is expanded, any gift that has a signal check in `signal_checks` table will render a Signal Check block in read-only mode. The history view:
- Displays `overall_message` and `confidence_note` from the latest revision
- Shows all follow-up prompts as chips
- Computes feedback comparison: `getSignalFeedbackComparison(latestSignalCheck, feedback)` matches the signal prediction against post-gift `recipient_reaction` feedback.

**Feedback comparison outcomes:**
| Recipient Reaction | Had Risks? | Label | Color |
|---|---|---|---|
| loved_it / liked_it | No | Matched outcome | Emerald |
| loved_it / liked_it | Yes | Mixed outcome | Amber |
| neutral | Yes | Matched caution | Amber |
| neutral | No | Mixed outcome | Amber |
| didnt_like | Yes | Matched caution | Amber |
| didnt_like | No | Missed outcome | Rose |

#### Known Bugs and Gaps

1. **Rate limit event inserted before credit deduction succeeds** — if credit deduction fails (edge case: DB timeout), the rate limit slot is consumed but no credit is charged and no signal check is generated. The user loses a rate limit slot for nothing.

2. **`ai_response.signal_checks[giftName]` duplication** — signal checks are stored *both* in the `signal_checks` table *and* embedded into `gift_sessions.ai_response`. The history page uses `signal_checks` table correctly, but the `ai_response` embed is never cleaned up and could become stale if a revision is added without updating the session.

3. **No refund on AI failure** — if the AI call fails after credit deduction, credits are charged but no `signal_checks` row is created. No refund path exists (unlike the main gift generation flow's `refund-credit` Edge Function). The user is charged 0.5 credits for nothing.

4. **`parent_signal_check_id` not sent correctly on follow-up** — in `SignalCheck.tsx` line 105, `parent_signal_check_id: prompt ? latestCheck?.id ?? undefined : undefined` — this sets the parent to the **latest** check regardless of which revision the user is building on. If there are 3 revisions and the user writes a follow-up after revision 1 (scrolled back in history), the parent is incorrectly set to revision 3. The correct behavior is to use the explicitly selected parent.

5. **`signal_interpretation` (the AI-generated teaser)** — `gift.signal_interpretation` is referenced in `SignalCheck.tsx` as `const previewText = gift.signal_interpretation?.trim() ?? ""`. However, `GiftRecommendation` type in `useGiftSession.ts` likely doesn't always include `signal_interpretation`. This field needs explicit documentation — it appears to come from the AI recommendation payload, not from Signal Check itself.

6. **Refresh after `onCreditsChanged`** — the component calls `onCreditsChanged()` on success, which triggers `refreshProfile()` in `GiftFlow.tsx`. However the credits UI in Step 4's teaser (\"You have N credits remaining\") only updates on full page refresh, not real-time. The `useCredits` hook is real-time subscribed but the Step 4 count is read from `GiftFlow.tsx` state cached at mount.

7. **`viewOnly` mode differences** — `viewOnly={true}` is used in some contexts. In `viewOnly` mode, the component renders the `signal_interpretation` preview or nothing, but does NOT render the golden result card even if `latestCheck` exists. This appears to be a bug: `viewOnly && !latestCheck` returns a preview or null, but `viewOnly && latestCheck` would fall through to the full render below. Actually re-reading: the `viewOnly` branch only fires when `!latestCheck` — if `latestCheck` exists, `viewOnly` only removes the "Refine the read" section. This is correct but the conditional structure is confusing and error-prone.

8. **No `.signal_interpretation` in StepContext preview** — the teaser in Step 4 (`StepContext.tsx`) says "See what your gift says about the relationship" but doesn't actually show any gift name or preview. The teaser is static and doesn't reference the recipient's name, which weakens its conversion impact.

---

## Section 1 — Overview

### Feature Name

**Signal Check** (internal) / **"What Your Gift Says"** (user-facing)

### Description

Signal Check is GiftMind's premium relationship intelligence layer. After the AI recommends a gift, Signal Check answers the next question: *"What does this specific gift say about my relationship with this person?"* It acts as a relationship psychologist on demand — surfacing what the gift communicates positively, what risks to watch for, and how to tune the presentation if needed.

This feature has two linked surfaces:
1. **In-Flow (Gift Results, Step 5):** Run Signal Check on any recommendation in real-time. Refine the analysis with follow-up prompts. Each revision is saved.
2. **In History (Gift History):** Read past Signal Check results alongside feedback from how the gift was actually received — closing the loop between prediction and outcome.

Signal Check is the clearest expression of GiftMind's core value proposition: *AI that understands relationships, not just products.* It is also the primary upgrade driver from Thoughtful to Confident.

### Why It Matters

**For the user:**
- Validates their gut feel ("Is this gift appropriate for where this relationship is?")
- Reduces gifting anxiety ("Will this come across right?")
- Provides language they can use when presenting the gift
- Creates a learning loop: after gifting, they can compare the AI's prediction to what actually happened

**For the business:**
- Primary differentiation from generic AI gift tools
- Key upgrade driver for Spark → Thoughtful → Confident conversion
- Sticky: each Signal Check creates a saved record users return to review in Gift History
- Revenue: 0.5 credits per check × revisions = predictable premium revenue per session
- NPS driver: of all features, Signal Check is the most "wow" moment users share (see SocialProof component: *"The Signal Check feature is brilliant"*)

### Where It Fits

Signal Check lives exclusively at **Step 5 (Results)** in the Gift Flow wizard, embedded within each `GiftCard`. It also surfaces in **Gift History** as a read-only record with feedback comparison.

**Entry points to Signal Check:**
- Directly inside `GiftCard` on Step 5 results
- Gift History → expand a session → any recommendation that had a Signal Check run
- Gift History → feedback comparison badge

---

## Section 2 — User Problem & Goals

### The User Problem

After getting AI gift recommendations, users face a second wave of doubt: *"I like this gift idea, but I'm not sure if it sends the right message."* 

This anxiety is especially acute for:
- Gifts for romantic partners (will this seem too serious? too casual?)
- Professional relationships (will this cross a line?)
- Gifts after a conflict (apology gift — will this land right?)
- Cross-cultural occasions (Diwali gift from a non-Indian friend)
- Milestone events (30th birthday — is this appropriate for the relationship stage?)

No existing tool answers this. Product search engines show price and availability. Gift idea lists show categories. GiftMind's AI already writes "why it works" — but Signal Check goes deeper: it explains what the *relationship narrative* of this gift is.

### Jobs to Be Done

1. **Validate appropriateness:** When I've chosen a gift, I want to know if it reads as appropriate for our relationship stage, so I can give with confidence.

2. **Identify risks proactively:** When there's something awkward about my gift choice (too intimate, too generic, culturally sensitive), I want Signal Check to tell me before the recipient opens the box.

3. **Tune the presentation:** When the gift is slightly off-tone, I want specific suggestions for how to present or accompany it to send the right signal.

4. **Explore "what if" scenarios:** When I'm curious how the same gift reads under different framings ("make it less romantic"), I want to iterate without starting over.

5. **Close the learning loop:** When the gift is given and I record how the recipient reacted, I want to see whether Signal Check predicted correctly — so I learn from this for next time.

### Success Metrics

| Metric | Target | Baseline | How Measured |
|---|---|---|---|
| Signal Check activation rate (Confident+ sessions) | ≥ 30% | ~15% est. | `signal_checks` rows / `gift_sessions` where plan = Confident+ |
| Follow-up revision rate (of sessions with ≥1 check) | ≥ 20% | Unknown | `revision_number > 1` / total Signal Check sessions |
| Upgrade click rate from Signal Check locked state | ≥ 8% | Unknown | `signal_check_upgrade_clicked` PostHog event / Spark+Thoughtful sessions |
| Credit-to-upgrade conversion (Signal Check gate) | ≥ 3% | Unknown | UpgradeModal → PayPal conversion from Signal Check trigger |
| Signal Check satisfaction (no re-do within 60s) | ≥ 80% | Unknown | Negative: `revision_number > 1 && elapsed < 60s` |
| AI failure rate on Signal Check calls | < 2% | Unknown | Calls returning 502/504 / total calls |
| Feedback comparison completion (Signal Check + Feedback) | ≥ 25% of SC sessions | Unknown | `gift_feedback` rows where session has `signal_checks` |
| Signal Check latency (P95 end-to-end) | < 8s | Unknown | `latency_ms` from `_meta` in response |

---

## Section 3 — User Journey & UX

### 3.1 Discovery: The Teaser (Plan-Locked State)

Users on Spark and Thoughtful see Signal Check in a locked-but-intriguing state. This is the most important conversion surface.

**Current behavior:** Shows `signal_interpretation` preview (80 chars visible, 40 blurred) if available, plus "Unlock full Signal Check" button.

**Required behavior (gap to close):**

The teaser must create desire, not just describe the feature. The current copy ("Unlock full Signal Check") is functional but flat. The locked state needs to feel like looking through a keyhole at something genuinely useful.

**Locked State Wireframe:**
```
┌─ Signal Check ─────────────────────────────────────────────────────┐
│  💬 Signal Check                                                   │
│                                                                    │
│  What this gift says about your relationship with Pratik...        │
│  ╔═══════════════════════════════════════════════════════════╗    │
│  ║ "A merino running headband at this price point says you   ║    │
│  ║  pay close attention to his training routine, not just    ║    │ ← 80 chars visible
│  ║  ████████████████████████████████████████████████████... ║    │ ← ~40 chars blurred
│  ╚═══════════════════════════════════════════════════════════╝    │
│  [🔒  See the full read   ·   Confident 🎯]                       │
└────────────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- `signal_interpretation` preview: first 80 chars rendered in normal text. Characters 80–120 rendered with `filter: blur(3px)` and `user-select: none`. This is the current implementation — keep it.
- If `signal_interpretation` is empty, show: *"What does this gift say about your relationship with [RecipientName]? Signal Check analyzes the relationship signal this gift sends."* — Don't skip the teaser widget; always show it.
- Clicking anywhere in the preview or the button: `trackEvent("signal_check_preview_clicked")` → open `UpgradeModal` with `highlightPlan="confident"` and `reason="Signal Check: see what your gift says"`.
- The CTA button text must use the gift recipient's name: **"See what this says about [Name]"** instead of the generic "Unlock full Signal Check".
- On mobile: collapse to a single tap target (no preview text, just icon + plan badge + CTA).

### 3.2 Activation: Running the First Check

Available to Confident 🎯 and Gifting Pro 🚀 users who have ≥ 0.5 credits.

**Pre-Check State (no check run yet):**

```
┌─ Signal Check ─────────────────────────────────────────────────────┐
│  💬 Signal Check                                                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 💡 "A merino running headband at this price point says you   │  │
│  │     pay close attention to his training routine..."          │  │
│  │  Full analysis uses 0.5 credits.                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [💬  Signal Check — See what this gift says    →]                │
└────────────────────────────────────────────────────────────────────┘
```

**Loading State (after click, 0.5 credits deducted, AI running):**

```
┌─ Signal Check ─────────────────────────────────────────────────────┐
│  💬 Signal Check                                                   │
│                                                                    │
│  [⟳  Analyzing...]           ← animated spinning icon             │
│                                                                    │
│  Reading relationship signals for this gift...                     │
│  (rotating message every 2s)                                       │
└────────────────────────────────────────────────────────────────────┘
```

**Loading messages (rotate every 2s):**
1. "Reading relationship signals..."
2. "Considering your relationship with [RecipientName]..."
3. "Assessing the tone for [Occasion]..."
4. "Weighing the cultural context..."
5. "Finalizing the read..."

**Behavior spec:**
- Click immediately deducts 0.5 credits server-side. The button must disable during the request.
- If credits fall to 0 after deduction but AI succeeds: show result normally. Credits display in Step 4 / header updates after `onCreditsChanged()` callback.
- If `NO_CREDITS (402)`: show inline error: "Not enough credits. [Get more credits →]" — link to `/credits`.
- If AI failure (502/504): **show specific error with refund note.** "Signal analysis failed. Your 0.5 credits were refunded." — *See Section 5.3 for refund implementation requirement.*
- If `RATE_LIMITED (429)`: "You've run 30 analyses today. Check back tomorrow." — no refund needed (no charge occurred).
- Loading state must not cancel on scroll or re-render (React Query mutation handles this correctly).

### 3.3 Result: The Signal Analysis Card

The golden card is Signal Check's "hero moment." It must feel premium, warm, and insightful — not clinical.

**Full Result Wireframe:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ✨ Signal Check         [Revision 1]   [2 saved reads]                │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  RELATIONSHIP READ                                                      │
│  "Gifting him a merino running headband for his marathon training       │
│   signals deep attentiveness — you're investing in his passion, not     │
│   just buying something safe."                                          │
│                                                                         │
│  Confidence: This gift lands as genuinely thoughtful for a close        │
│  friend who's been training seriously.                                  │
│                                                                         │
│  ───────────────────────────────────────────────────────────────────── │
│                                                                         │
│  ✅ POSITIVE SIGNALS                                                    │
│  ✓ Shows you've been paying attention to his daily life, not just       │
│    his public interests.                                                │
│  ✓ Priced right for a close friendship — not too extravagant,          │
│    not dismissive.                                                      │
│  ✓ Running gear as a gift affirms his identity as an athlete.          │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ⚠️ POTENTIAL RISKS                          (only if present)         │
│  ✗ If he's particular about gear brands, a headband he already          │
│    has or dislikes could read as careless.                              │
│                                                                         │
│  ╔═ HOW TO TUNE IT ════════════════════════════════════════════╗       │
│  ║ • Mention you noticed he runs in all weather — that makes    ║       │
│  ║   the gift feel researched, not random.                      ║       │
│  ║ • Include a short note about his marathon goal.              ║       │
│  ║ • If unsure of brand preference, opt for a gift card from    ║       │
│  ║   a running store alongside.                                 ║       │
│  ╚═══════════════════════════════════════════════════════════════╝      │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ✏️ REFINE THE READ                                                     │
│  Suggested: [Make this less romantic] [More premium] [More playful]    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Or type your own: "Make this feel more professional..."         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Each follow-up = new saved revision (0.5 credits)        [Refine →]   │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ▼ Revision History (2 reads)                                          │
│    [Revision 1 — Original read — Apr 23, 10:41 AM]                     │
│    [Revision 2 — "Make this more premium" — Apr 23, 10:45 AM]          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Visual Design Spec:**

- **Card background:** Gradient `linear-gradient(135deg, #FAF5E8 0%, #F5E9C9 100%)` — existing implementation, keep.
- **Card border:** `#EDD896` — existing, keep.
- **Section header text:** `#6F5326` — warm brown, existing.
- **Positive signals:** Lucide `Check` icon in `#3E8E7E` (emerald). One icon per bullet in a flex row. Text `text-sm text-foreground`.
- **Potential risks panel:** `border-[#E8D3C8] bg-[#FFF6F4]`. `X` icon in `#C25450`. Only shown when `potential_risks.length > 0`.
- **Adjustment suggestions panel:** `border-indigo-100 bg-indigo-50`. Only shown when `adjustment_suggestions.length > 0`.
- **Overall message:** `text-sm font-medium text-foreground` — the most prominent text block.
- **Confidence note:** `text-sm text-muted-foreground` — secondary.
- **"Refine the read" section:** `border-border/60 bg-background/80 p-3 rounded-xl`. Header with `Wand2` icon `text-muted-foreground`.
- **Revision badge:** `<Badge variant="primary">Revision N</Badge>`.
- **Multiple revisions badge:** `<Badge variant="primary">N saved reads</Badge>`.

**Animation spec:**
- Card enters with `motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}`.
- Each positive signal enters with `initial={{ opacity: 0, x: -4 }}` staggered by 100ms per item.
- Risk panel enters separately with `initial={{ opacity: 0, scale: 0.98 }}`.
- Full card uses `AnimatePresence` so removal animates out.

### 3.4 Refinement: Follow-Up Revisions

The follow-up system allows users to steer the analysis in a specific direction without re-running the full gift flow.

**Behavior spec:**
- Suggested prompts: 3 chips that populate the textarea on click. Currently: "Make this less romantic", "Make this more premium", "Make this feel more playful". These should be dynamic based on context (see Section 4.2 for suggested prompt personalization).
- Custom textarea: max 240 chars (server enforces via `sanitizeString(follow_up_prompt, 240)`). Show char counter.
- "Refine" button: disabled when `isPending || !followUpPrompt.trim()`.
- Cost notice: "Each follow-up saves a new revision and uses 0.5 credit." — accurately reflects server behavior.
- On success: `queryClient.invalidateQueries({ queryKey })` re-fetches all revisions. `followUpPrompt` cleared.
- **`parent_signal_check_id` fix required:** The component must always send the `revision_number - 1` check as the parent, not always `latestCheck.id`. When `follow_up_prompt` is set via the textarea, the parent should be `latestCheck.id` (the currently displayed latest). This is the common case and is correct. The bug only manifests if the user somehow edits a previous revision — which the current UI doesn't allow (no per-revision edit). So the current behavior is actually correct in practice. Keep as-is. Note in code comment.

**Suggested Follow-Up Prompts — Contextual Logic (V1: static, V2: personalized):**

V1 (current): Three hard-coded strings regardless of occasion or relationship.

V2 (future): Derive from relationship and occasion:
- Partner + romantic occasion → ["Make this less possessive", "Lean into the emotional depth", "Make this feel lighter"]
- Friend + casual → ["Make this more personal", "Make this feel less generic", "Add a playful angle"]
- Professional → ["Make this more neutral", "Make this feel more formal", "Remove any personal overtones"]
- Cross-cultural → ["Address the cultural fit directly", "Make this more universally meaningful", "Add a cultural note"]

For this PRD (V1), ship the current static prompts. Tag V2 personalization as a follow-up item.

### 3.5 Revision History

```
┌─ Revision History (3 reads) ──────────────────────────────────────┐
│                                                                    │
│  ┌─ Revision 3 — "Make this feel more playful" — 10:51 AM ──────┐ │
│  │ "Pairing this with a lighthearted note transforms the gift    │ │
│  │  from serious athlete endorsement to best-friend silliness." │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Revision 2 — "Make this more premium" — 10:45 AM ───────────┐ │
│  │ "At this price point, pairing with a small card from a       │ │
│  │  premium running shop would elevate the perceived value..."  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Revision 1 — Original read — 10:41 AM ──────────────────────┐ │
│  │ "A merino running headband signals deep attentiveness..."    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- Rendered via shadcn `Accordion`. Trigger: "Revision History" with count badge. Shown only when `checks.length > 1`.
- Revisions listed newest-first (`.slice().reverse()`).
- Each entry shows: revision number badge, follow-up prompt if present ("Original read" if null), formatted timestamp (`Intl.DateTimeFormat`), and `overall_message`.
- Clicking a revision entry does NOT navigate to that revision — it's read-only history, not a "restore" UI. Add a comment in code to not add restore until V2.
- On mobile: accordion trigger is touch-friendly (min 44px height).

### 3.6 Signal Check in Gift History

When a past session is expanded in Gift History:

**Has Signal Check data:**
```
┌─ Merino Running Headband ──────────────── Selected ✓ ─────────────┐
│  🎯 92% confidence                                    ~$45         │
│                                                                    │
│  "Signals deep attentiveness to his training routine..."            │
│                                                                    │
│  ┌─ Signal Check — Revision 2 ── 2 saved reads ─────────────────┐ │
│  │ ✨ Signal Check                                [Matched ✓]    │ │
│  │                                                               │ │
│  │ "A merino headband signals deep attentiveness..."             │ │
│  │ Confident this lands right for a close friendship.           │ │
│  │                                                               │ │
│  │ Tuning ideas:                                                 │ │
│  │ "Mention his marathon goal in the card."                      │ │
│  │                                                               │ │
│  │ Follow-ups: [Make this less romantic] [More premium]          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Shop Again ↗]                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Behavior spec:**
- Source: `signalChecksBySessionGift` map keyed by `${session_id}:${gift_name}`.
- Shows `latestSignalCheck.result.overall_message` and `confidence_note`.
- Shows `adjustment_suggestions` if any.
- Shows all `follow_up_prompt` chips from the history list.
- Feedback comparison badge: shown only when session is selected AND `gift_feedback` exists for this session.
- The component used here is NOT the interactive `<SignalCheck>` — it's a bespoke read-only block in `GiftHistory.tsx`. This is correct: no credits, no editing.
- `viewOnly={true}` prop: NOT used here. History uses its own JSX. TODO: refactor to use `<SignalCheck viewOnly={true} />` with the `latestCheck` pre-loaded so history and flow share a single render path. Tag as V2 refactor.

### 3.7 Upgrade Entry Points from Signal Check

Signal Check creates three upgrade funnel moments:

| Moment | User State | CTA Copy | Target Plan |
|---|---|---|---|
| Blurred preview in locked state | Spark/Thoughtful | "See what this says about [Name] · Confident 🎯" | Confident |
| "Unlock full Signal Check" button | Spark/Thoughtful | "Unlock with Confident 🎯" | Confident |
| No Credits error during Signal Check | Confident, 0 credits | "Get more credits to continue" | None (credits purchase) |
| Step 4 teaser (before results) | Spark/Thoughtful | "Available on Confident plan · 1 credit per gift" | Confident |

**UpgradeModal invocation:**
- `highlightPlan="confident"` for all Signal Check gates
- `reason="Signal Check: see what your gift says about the relationship"` — specific copy that reinforces the value proposition
- PostHog events: `signal_check_upgrade_clicked` (from preview click), `signal_check_run` (from button click with plan=locked)

---

## Section 4 — Logic & State Management

### 4.1 Component State Machine

```
INITIAL STATE:
  canUseSignalCheck == false:
    → Render locked state
    → If signal_interpretation exists: render blurred preview
    → "Unlock" button → UpgradeModal

  canUseSignalCheck == true:
    checks.length == 0:
      → Render pre-check state
      → If signal_interpretation exists: render italic preview
      → "Signal Check" button → runInitialCheck()
    
    checks.length > 0:
      → Render golden result card (latestCheck)
      → Render follow-up section if !viewOnly
      → If checks.length > 1: render revision history accordion

MUTATION STATES:
  signalMutation.isPending:
    → Button disabled, spinner icon, "Analyzing..." text
    → Loading messages rotate every 2s
  
  signalMutation.isError:
    → Toast with error message
    → Button re-enabled
    → If NO_CREDITS: inline credit error + link
    → If AI_ERROR: toast + credit refund notice
  
  signalMutation.isSuccess:
    → queryClient.invalidateQueries → refetches checks
    → followUpPrompt cleared
    → onCreditsChanged() called
```

### 4.2 Credit Cost Logic

**Initial check:** 0.5 credits per gift name per session (deducted server-side).

**Reuse (no charge):** If a signal check already exists for `(session_id, gift_name)` with no `follow_up_prompt`, the server returns the cached result without deducting. This handles React re-renders, page refreshes, and re-opening the results view.

**Follow-up revision:** 0.5 credits per follow-up, each stored as a new `signal_checks` row with incremented `revision_number`.

**Client-side gate:** The component checks `canUseSignalCheck` prop (derived from `planLimits.hasSignalCheck`) before invoking the mutation. If false, it opens `UpgradeModal` instead. This prevents the API call entirely — correct behavior.

**Server enforcement:** Even if client-side gate is bypassed, the Edge Function enforces `ALLOWED_PLANS` check via `active_plan` from `users` table. Defense in depth is correct.

### 4.3 Rate Limiting

**Current:** 30 Signal Checks per user per 24-hour rolling window. Enforced via `rate_limit_events` table.

**Issue to fix:** Rate limit event is inserted before credit deduction. Move the rate limit insert to AFTER successful credit deduction to avoid consuming rate limit slots on failed charges.

**Correct order:**
1. Validate plan
2. Pre-flight credits check
3. Parse + validate request
4. Validate session ownership
5. Fetch existing checks (cache hit path)
6. **Deduct credit**
7. **Insert rate limit event** (only after credit is confirmed)
8. Call AI
9. Store result
10. Return success

### 4.4 `signal_interpretation` Field

`signal_interpretation` is a string field on `GiftRecommendation` that the AI recommendation engine includes as a preview of what Signal Check would say. It is generated as part of the main `generate-gifts` LangGraph pipeline, not by the `signal-check` Edge Function.

**Purpose:** Create Signal Check desire *before* the user runs it. Shows 80 visible chars + 40 blurred chars on locked plans, and 200 chars preview on unlocked plans as a teaser.

**Implementation gap:** The `generate-gifts` engine must include `signal_interpretation` in every recommendation. This must be documented in the Engine PRD (PRD 04 or the LangGraph spec). Current code assumes it exists but no guarantee of its generation is enforced.

**Fallback:** If `signal_interpretation` is null or empty, the component must not crash. Render the static fallback copy: *"What does this gift say about your relationship with [RecipientName]?"*

### 4.5 Data Flow

```
User clicks "Signal Check"
  ↓
SignalCheck.tsx: signalMutation.mutateAsync(undefined)
  ↓
POST /signal-check (Supabase Edge Function)
  ↓
  1. Authenticate JWT → get user.id
  2. Fetch user.active_plan, user.credits_balance
  3. Plan gate check → 403 if not in ALLOWED_PLANS
  4. Pre-flight credits check → 402 if credits < 0.5
  5. Parse + validate request body
  6. Validate session ownership (session.user_id == user.id)
  7. Fetch existing signal_checks for (user_id, session_id, gift_name)
  8. Cache check: if no follow_up_prompt && existing check → return cached
  9. Resolve parent (latest or explicit parent_id)
  10. Count rate_limit_events last 24h → 429 if ≥ 30
  11. RPC: deduct_user_credit(user_id, session_id, 0.5)
  12. Insert rate_limit_events row
  13. Build AI prompt: SIGNAL_CHECK_SYSTEM_PROMPT + buildSignalCheckMessage()
  14. callAIWithFallback → parse JSON → validate
  15. INSERT into signal_checks
  16. UPDATE gift_sessions.ai_response JSONB
  17. Return { success, signal, signal_check_id, revision_number, credits_remaining }
  ↓
Client: queryClient.invalidateQueries → refetch signal_checks
  ↓
Component re-renders with new latestCheck → golden result card
```

### 4.6 AI Prompt Design

**System prompt:** Relationship psychologist persona. Tight output format. Explicit rules: be honest, not just positive; consider relationship depth (new vs close); consider cultural norms.

**User message built by `buildSignalCheckMessage()`:**
- Gift name + description  
- Approximate budget in currency  
- Recipient name, relationship, relationship_depth, occasion  
- Optional: relationship_stage  
- Optional parent context block for follow-ups (includes previous result JSON + follow-up direction)

**Response format:** JSON only. 5 fields: `overall_message`, `positive_signals`, `potential_risks`, `confidence_note`, `adjustment_suggestions`.

**Validation:** `validateSignalCheckResult()` type-checks all fields. Empty `overall_message` or `confidence_note` → reject.

**Temperature:** 0.6. Appropriate for nuanced judgment. Do not lower to 0.2 (too rigid) or raise above 0.7 (too variable).

**Max tokens:** 1000. Sufficient for 5 fields with 2-3 items each.

---

## Section 5 — Implementation Requirements & Gaps

### 5.1 Bug Fixes (Required Before Launch)

**BUG-01: No credit refund on AI failure**  
Priority: P0 — direct revenue integrity issue.  
Current behavior: 0.5 credits deducted → AI call fails → no refund → user charged for nothing.  
Required: On AI call failure after credit deduction, call the `refund-credit` Edge Function (already exists for `generate-gifts` path) with `amount = 0.5` and `reason = "signal_check_ai_failure"`. Return error with `"Your 0.5 credits were refunded."` message. Client shows refund notice in error state.

```typescript
// In signal-check/index.ts, after callAIWithFallback throws:
} catch (aiError) {
  // Attempt refund
  try {
    await supabaseAdmin.rpc('refund_user_credit', {
      p_user_id: user.id,
      p_session_id: body.session_id,
      p_amount: 0.5,
    });
  } catch (refundError) {
    console.error('Signal Check refund failed:', refundError);
  }
  const mapped = mapAIError(aiError);
  return json({ ...mapped.body, credits_refunded: true }, mapped.status);
}
```

**BUG-02: Rate limit event inserted before credit deduction**  
Priority: P1 — causes rate limit slots to be consumed even when the user isn't charged.  
Fix: Move `INSERT into rate_limit_events` to after `deduct_user_credit` succeeds. See Section 4.3 for correct order.

**BUG-03: Missing `signal_interpretation` fallback**  
Priority: P2 — defensive coding.  
Current: `const previewText = gift.signal_interpretation?.trim() ?? ""` — if empty, no preview renders. The fallback copy ("What does this gift say about your relationship with [Name]?") must be shown even when `signal_interpretation` is null.  
Fix: In `SignalCheck.tsx`, replace empty string check with fallback copy render.

```typescript
const previewText = gift.signal_interpretation?.trim() ?? "";
const fallbackPreview = `What does this gift say about your relationship with ${recipient.name}?`;
const displayPreview = previewText || fallbackPreview;
```

**BUG-04: `ai_response.signal_checks` denormalization staleness**  
Priority: P2 — data integrity.  
Current: Signal check result is stored in TWO places: `signal_checks` table (primary) and `gift_sessions.ai_response.signal_checks[giftName]` (redundant). The history page reads from `signal_checks` table (correct). The embedded `ai_response` embed is stale after revisions if the merge logic isn't updated. Consider deprecating the `ai_response` embed entirely. For now, keep it for backward compat but add a comment that it's deprecated.

### 5.2 UX Improvements (Required Before Launch)

**UX-01: Recipient name in CTA copy**  
Current: "Unlock full Signal Check" / "Signal Check"  
Required: "See what this says about [RecipientName]" for the locked CTA, "Signal Check [RecipientName]'s reaction" for the unlocked button.  
Why: Personalized copy dramatically increases click rate on feature gates.

**UX-02: Step 4 teaser personalization**  
Current teaser in Step 4 (StepContext.tsx) is static. It should read:  
*"After results, Signal Check tells you what each gift says about your relationship with [RecipientName]."*  
This requires passing `selectedRecipient?.name` to `StepContext.tsx` — it's already in `GiftFlow.tsx` state.

**UX-03: Loading messages while analysis runs**  
Current: The loading state shows a generic spinner.  
Required: 5 rotating messages (see Section 3.2) with recipient name interpolated:
- "Reading relationship signals for [RecipientName]..."
- "Considering your [relationship] with [RecipientName]..."

**UX-04: Error states in UI (not just toast)**  
Current: Errors show via `toast.error()` only. The user must notice the toast while looking at the card.  
Required: Show inline error state inside the Signal Check component when mutation fails. Below the button: `<p className="text-sm text-red-600">Analysis failed. [credits_refunded ? "Your 0.5 credits were refunded." : "Try again."]</p>`

**UX-05: Confirmation of credit deduction**  
Current: No visual confirmation that 0.5 credits were used.  
Required: After successful check, show a subtle "0.5 credits used · [N] remaining" line below the golden card for 5 seconds, then fade out.

### 5.3 Schema Additions (Required)

No new columns are needed for Signal Check itself — the `signal_checks` table is complete.

However, the `refund_user_credit` RPC function (or equivalent) must support `reason = "signal_check_ai_failure"` to properly categorize refunds in the admin view.

### 5.4 Analytics Events (Required)

All events tracked via `trackEvent()` from `@/lib/posthog`. Required events:

| Event Name | Trigger | Properties |
|---|---|---|
| `signal_check_run` | Button clicked (any plan) | `rec_index`, `plan`, `revision_number` |
| `signal_check_preview_clicked` | Locked preview clicked | `rec_index`, `plan: "locked"` |
| `signal_check_upgrade_clicked` | "Unlock" button on locked state | `rec_index`, `current_plan` |
| `signal_check_success` | Mutation succeeds | `rec_index`, `revision_number`, `has_risks`, `has_suggestions`, `latency_ms`, `provider` |
| `signal_check_error` | Mutation fails | `rec_index`, `error_type`, `credits_refunded` |
| `signal_check_follow_up` | Follow-up submitted | `rec_index`, `revision_number`, `prompt_type: "suggested" | "custom"` |
| `signal_check_history_viewed` | History accordion opened | `revision_count` |

**PostHog tracking gaps to fix:**
- `signal_check_success` event does not currently exist. Add after mutation's `onSuccess`.
- `prompt_type` is not tracked on follow-ups. Track whether user used a suggested prompt chip or typed custom.

---

## Section 6 — Plan Gating & Monetization

### 6.1 Access Control Summary

| Gate | Where | Enforced |
|---|---|---|
| `hasSignalCheck` plan flag | `SignalCheck.tsx` client | Checked before mutationFn runs |
| `ALLOWED_PLANS` list | `signal-check` Edge Function | Checked before any state change |
| `credits_balance >= 0.5` | `signal-check` Edge Function | Pre-flight before AI call |
| `rate_limit_events < 30/day` | `signal-check` Edge Function | After credit deduction |
| `user_id == session.user_id` | `signal-check` Edge Function | Session ownership |
| `feature_signal_check` global flag | Admin → affects all plans | Edge Function should check this flag |

**Gap:** The global feature flag `feature_signal_check` (from admin settings) is NOT checked in the Edge Function. If an admin turns off Signal Check globally, the button in the UI may still be visible (it's not aware of the flag). The Edge Function must check this flag from `admin_settings` table before proceeding.

```typescript
// Add after plan check in signal-check/index.ts:
const { data: featureFlag } = await supabaseAdmin
  .from('admin_settings')
  .select('feature_signal_check')
  .single();

if (featureFlag?.feature_signal_check === false) {
  return json({ error: 'Signal Check is temporarily unavailable.' }, 503);
}
```

### 6.2 Upgrade Conversion Funnel

Signal Check is the single most important upgrade driver from Thoughtful to Confident:

```
Spark/Thoughtful user on Step 5
  → Sees blurred Signal Check preview with recipient name
  → Clicks preview or "Unlock" button
  → UpgradeModal (highlights Confident)
    → User sees Confident = $5.99, 75 sessions, Signal Check, Batch Mode
  → If converts: plan upgraded → Signal Check unlocked → runs first check
  → Re-engagement: returns to Gift History → sees Signal Check results
  → Data point: "Matched outcome" badge creates trust → re-purchase likely
```

**Conversion tracking:**
- `signal_check_upgrade_clicked` → `upgrade_modal_viewed` → `paypal_checkout_opened` → `payment_completed`
- Attribution: set `upgrade_source = "signal_check"` in UpgradeModal invocation for this specific path.

### 6.3 Credit Economics

At 0.5 credits per Signal Check:
- A Confident plan user (75 credits, $5.99) can run 150 Signal Checks.
- Expected activation rate: 30% of sessions × 75 sessions = ~22 sessions with Signal Check.
- Expected revisions per check: 1.2 average (20% run one follow-up).
- Expected credits used for Signal Check: 22 × 1 × 0.5 + 22 × 0.2 × 0.5 = 13.2 credits (~18% of plan credits).
- Revenue margin: AI cost ~$0.01 per check × 22 checks = $0.22 AI cost for Signal Check per Confident user vs. $5.99 plan price. Well within margin.

**Implication:** Do NOT increase Signal Check credit cost above 0.5. The current price point is psychologically light (users think of it as free) and economically correct for GiftMind's margins.

---

## Section 7 — Gift History Integration Deep Dive

### 7.1 Feedback Comparison: The Learning Loop

The most powerful Signal Check moment is **retrospective**: after the gift is given and the user records `recipient_reaction`, the Gift History screen shows whether Signal Check's prediction matched reality.

```
Gift History Card — expanded
  Merino Running Headband         Selected ✓
  Signal Check · Revision 2
  ┌─────────────────────────────────────────────────────────┐
  │ "Signals deep attentiveness..."                         │
  │                                                         │
  │ [Matched outcome ✓ — emerald badge]                     │
  │ "The final reaction lined up with the positive read     │
  │  from Signal Check."                                    │
  └─────────────────────────────────────────────────────────┘
```

**State mapping (`getSignalFeedbackComparison`):**

| Recipient Reaction | Had Risks | Label | Description | Color |
|---|---|---|---|---|
| `loved_it` | No risks | Matched outcome | "The final reaction lined up with the positive read from Signal Check." | Emerald |
| `loved_it` | Has risks | Mixed outcome | "The recipient still liked it, even though Signal Check had flagged some risk." | Amber |
| `liked_it` | No risks | Matched outcome | Same as loved_it/no risks | Emerald |
| `liked_it` | Has risks | Mixed outcome | Same as loved_it/has risks | Amber |
| `neutral` | Has risks | Matched caution | "The neutral reaction landed close to the cautions Signal Check surfaced." | Amber |
| `neutral` | No risks | Mixed outcome | "Signal Check was more optimistic than the eventual neutral reaction." | Amber |
| `didnt_like` | Has risks | Matched caution | "The recipient reaction aligned with the potential risks called out by Signal Check." | Amber |
| `didnt_like` | No risks | Missed outcome | "Signal Check missed the negative reaction and read this gift too positively." | Rose |

**UX importance:** The "Missed outcome" state (Signal Check predicted well but gift didn't land) is actually a valuable signal for the user — it means the *presentation* was likely the issue, not the gift itself. Consider surfacing the `adjustment_suggestions` from Signal Check in this state: *"Signal Check suggested: [adjustment 1]. Consider these for next time."*

### 7.2 Cross-Query Data Dependencies

Gift History loads Signal Checks in a separate query:
```typescript
queryKey: ["gift-history-signal-checks", user?.id]
// Fetches all signal_checks for this user, ordered by created_at ASC
// Then groups by `${session_id}:${gift_name}` map key
```

**Performance consideration:** If a user has run many Signal Checks across many sessions, this query could return hundreds of rows. Add index on `signal_checks(user_id, created_at)` if not already present.

**Current implementation:** `parseSignalChecks(signalCheckRows)` processes all rows in memory. Fine for < 500 rows; add server-side pagination or limit at scale.

---

## Section 8 — Admin Controls

### 8.1 Feature Flag

**`feature_signal_check`** — global on/off switch. When OFF:
- SignalCheck component should check this flag (currently it does NOT — only plan is checked)
- Edge Function should return 503 immediately
- The admin intent is "hide for all users at once" (e.g., for AI provider outage)

**Implementation gap:** The component has no awareness of `feature_signal_check`. It only checks `canUseSignalCheck` (derived from `planLimits.hasSignalCheck`). Add a `useFeatureFlags()` hook or pass `featureSignalCheck` as a prop from GiftFlow.tsx.

### 8.2 AI Model Selection

**`ai_model_signal`** — controls which AI model is used for Signal Check via `getProviderChain(plan, "signal-check")`.

Current admin note: *"Always Sonnet — this is the premium differentiator."*

This is correct product strategy: Signal Check should use the highest-quality model on the Confident/Gifting Pro plans. Do not switch to Haiku/Flash for cost savings here — the premium feel is the product.

### 8.3 Cost & Rate Limit Controls

**`signal_check_cost`** — credit cost per check. Default: 0.5. Admin-adjustable 0.0–1.0 in 0.1 steps. **This value is NOT currently read by the Edge Function** — the function hard-codes `p_amount: 0.5`. This must be fixed to read from `admin_settings`.

**`signal_checks_per_day`** — daily rate limit per user. Default: 30. Currently enforced in Edge Function as hard-coded `>= 30`. **This also needs to be read dynamically from `admin_settings` at runtime.**

**Fix required:**
```typescript
const { data: adminSettings } = await supabaseAdmin
  .from('admin_settings')
  .select('signal_check_cost, signal_checks_per_day, feature_signal_check')
  .single();

const checkCost = adminSettings?.signal_check_cost ?? 0.5;
const dailyLimit = adminSettings?.signal_checks_per_day ?? 30;
const featureEnabled = adminSettings?.feature_signal_check ?? true;
```

---

## Section 9 — Non-Goals

The following are explicitly out of scope for this PRD:

1. **Signal Check for non-selected recommendations in batch mode.** Signal Check operates on one gift at a time in the current flow. Running "batch Signal Check" on all 3 recommendations at once is a Gifting Pro V2 feature.

2. **Shared Signal Check results.** Users requesting to share Signal Check output (e.g., "send this analysis to my partner") is a V2 social feature.

3. **Signal Check on custom (user-entered) gifts.** Signal Check is currently tied to AI-recommended gifts via `session_id`. Supporting arbitrary gift names without a session context is V2.

4. **Signal Check score or rating system.** The current output is qualitative (text). Adding a quantitative "relationship fit score" alongside is V2 and requires calibration data.

5. **Signal Check notification ("Your Signal Check is ready").** Push notification when analysis completes is V2. Current flow is synchronous (user waits on the button).

6. **AI-generated gift note copy.** The `adjustment_suggestions` show "*what* to say" but don't generate the actual note/card copy. "Write a gift card message based on Signal Check" is a V2 draft assistant feature.

---

## Section 10 — Verification Plan

### Automated Testing

**Edge Function unit tests:**
- Plan gate: confirm 403 for `spark` and `thoughtful` plans
- Credit pre-flight: confirm 402 when balance = 0.4
- Cache hit: confirm no deduction when existing check present and no follow-up prompt
- Rate limit: confirm 429 after 30 events in 24h
- Refund: confirm `refund_user_credit` called when AI fails (after BUG-01 fix)
- JSON validation: confirm 502 when AI returns malformed JSON

**Integration tests:**
- Full happy path: Confident user → initial check → golden card renders
- Follow-up: submit change prompt → revision_number increments → new card
- History: Signal Check shows in expanded session with correct latest revision

### Manual Verification

1. **Locked state UX:** Log in as Spark user. Go to Step 5. Confirm blurred preview renders with `recipient.name` in CTA. Confirm clicking opens UpgradeModal with Confident highlighted.

2. **Activation:** Log in as Confident user with ≥ 1 credit. Run Signal Check. Confirm golden card renders, positive signals, risk panel (if any), adjustment suggestions.

3. **Credit deduction:** Verify credits decrease by 0.5 in header and Step 4 teaser after running.

4. **Credit refund on AI failure:** Simulate AI failure (temporarily invalid API key in admin). Confirm "credits refunded" message shown and balance unchanged.

5. **Follow-up revision:** Run initial check. Add follow-up using suggested prompt chip. Confirm revision_number increments. Check revision history accordion.

6. **Gift History integration:** Complete a session with Signal Check run. Go to Gift History. Expand session. Confirm Signal Check block renders with revision badge and overall_message.

7. **Feedback comparison:** Add gift_feedback for a completed session that has a Signal Check. Confirm comparison badge renders.

8. **Rate limit:** Run 30 Signal Checks in quick succession (use test account). Confirm 31st returns rate limit error.

9. **Global feature flag:** Turn off `feature_signal_check` in admin. Confirm Signal Check is hidden/unavailable for all plan users.

10. **Admin cost setting:** Change `signal_check_cost` to 0.4 in admin. Confirm Edge Function deducts 0.4 credits (after fix is applied).

---

## Section 11 — Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| Q1 | Should Signal Check be available for non-selected recommendations in the results view, or only after a gift is selected? Current: available for all 3 recommendations simultaneously. This is correct — let users compare the signal of different gifts before choosing. But it means a user could burn 1.5 credits checking all 3. Should there be a "choose first to run Signal Check" gate? | Credit economics, UX friction | Product |
| Q2 | Should `signal_interpretation` (the AI-generated teaser) be documented and enforced in the `generate-gifts` prompt, or is it optional? Currently treated as optional. If it's missing, the locked state teaser falls back to generic copy. | Conversion rate from teaser | AI/Engine |
| Q3 | The `ai_response.signal_checks[giftName]` embed in `gift_sessions` is redundant. Should it be removed to simplify the data model, or kept for backward compat? Removing it requires migrating any read paths that use it. | Data integrity | Engineering |
| Q4 | Should follow-up revision credit cost be reduced to 0.25 credits to encourage more iterations? Lower cost = more revisions = more engagement = better product signal. Risk: revenue dilution per session. | Revenue vs. engagement | Product |
| Q5 | Should Gifting Pro users get a daily rate limit higher than 30, or unlimited? Pro plan users are highest credit purchasers and most likely to run Signal Check on many recipients. Current 30/day limit may frustrate them. | Pro tier retention | Product |
