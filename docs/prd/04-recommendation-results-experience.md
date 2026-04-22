# PRD 04 — Recommendation Results Experience
**Feature name (internal):** Recommendation Results Experience  
**User-facing name:** Your Matches  
**Owner:** Product / Engineering  
**Version:** 1.0  
**Status:** Ready for implementation  
**Date:** 2026-04-19  

---

## Section 0: Phase 1 Audit — Current State

### 0.1 Component Structure (as-built)

```
src/components/gift-flow/
├── StepResults.tsx          ← Main container. Handles state: loading / error / results / success.
├── GiftCard.tsx             ← Individual gift card. Has selection dialog, SignalCheck, ProductLinks.
├── SignalCheck.tsx          ← On-demand signal analysis (plan-gated). Has revision history.
├── ProductLinks.tsx         ← Horizontal-scroll store cards with locked store placeholders.
├── NoCreditGate.tsx         ← Paywall screen (full pricing table).
src/components/ui/
└── confidence-badge.tsx     ← ConfidenceBadge component. Count-up animation. Already exists.
```

### 0.2 Current GiftCard Layout (ASCII)

```
┌───────────────────────────────────────────────────────────────┐
│  [Recommendation N badge]  [Best Match badge if index 0]       │
│                                                               │
│  Gift Name (font-heading 2xl)              ┌──────────┐       │
│  why_it_works paragraph (text-sm)          │  92%     │       │
│                                            │Excellent │       │
│  [$45 badge]  [category badge]  [plan]     └──────────┘       │
│                                                               │
│  [▼ Gift caution — collapsible amber button]                   │
│  (what_not_to_do shown on expand)                             │
│                                                               │
│  [Signal Check — locked button OR full analysis card]         │
│                                                               │
│  [Product Links — horizontal scroll cards with store images]  │
│                                                               │
│  [I'll Pick This One — hero button full width]                │
└───────────────────────────────────────────────────────────────┘
```

### 0.3 Current ConfidenceBadge Design

- **Exists at:** `src/components/ui/confidence-badge.tsx`
- **Buckets:** ≥90 → amber + "Excellent match" | ≥75 → indigo + "Strong match" | ≥60 → neutral + "Good match" | <60 → neutral + "Moderate match"
- **Animation:** count-up via `useCountUp` hook using cubic easing. Respects `prefers-reduced-motion`.
- **Sizes:** sm / md / lg
- **aria-label:** `${score}% confidence score` — needs update to include label text

### 0.4 Current Signal Check Design

- **Free users:** Single locked button → "Unlock with Confident". No preview text.
- **Paid users (Confident+):** On-demand button → full analysis card with positive_signals, potential_risks, adjustment_suggestions, overall_message, confidence_note. Has follow-up prompt + suggested chips. Revision history accordion.
- **Credit cost:** 0.5 credits per initial check + 0.5 per follow-up.
- **Plan enforcement:** Server-side in `signal-check/index.ts`. Only `confident` and `gifting-pro` allowed.
- **Gap:** No preview/tease for free users. Just a flat lock. PRD must address this.

### 0.5 Current Buy Links Design

- **Layout:** Horizontal scroll with `min-w-[260px]` cards (NOT a row of buttons).
- **Each card has:** store badge (colored), product image (if available), product title, price/stock/delivery badges, coupon badge, "View on [Store]" link.
- **Locked stores:** Muted card with lock icon + upgrade text. Triggers UpgradeModal on click.
- **Geo:** `recipient_country` vs `user_country` handled in `search-products`. Recipient takes priority. GLOBAL fallback if no stores for country.
- **Plan limits (STORE_LIMITS in search-products):** spark=1, thoughtful=2, confident=99, gifting-pro=99.
- **Gap:** Cards are rich (image, stock, coupon) but layout is wide cards that overflow horizontally — not ideal for narrow viewports.

### 0.6 Current Success State

- Emerald card with PartyPopper icon, gift name, confidence score.
- "Save for next year" feedback reminder CTA (upserts into `feedback_reminders`).
- WhatsApp share button + copy referral link.
- "Back to Dashboard" + "Find Another Gift" buttons.
- **Gap:** No "Buy on [Store]" primary CTA after selection. The buy action disappears on success.

### 0.7 Current product_clicks Table Schema

```sql
CREATE TABLE public.product_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE SET NULL,
  gift_concept_name text NOT NULL,
  store text NOT NULL,           -- store_id, not store_name
  product_url text NOT NULL,     -- outbound URL
  country text DEFAULT NULL,
  is_search_link boolean DEFAULT true,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
```

**Gaps vs PRD needs:** Missing `recipient_id`, `recommendation_index`, `recommendation_confidence`, `store_name` (readable), `estimated_price`, `product_title`, `clicked_from`.

### 0.8 AI Response Shape (from generate-gifts/index.ts)

```typescript
interface GiftRecommendation {
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;       // 0-100
  signal_interpretation: string;  // full text — already generated but not shown to free users
  search_keywords: string[];
  product_category: string;
  price_anchor: number;           // USD
  what_not_to_do: string;         // NOTE: currently typed as string, not string | null
}

interface AIResponse {
  recommendations: GiftRecommendation[];  // exactly 3
  occasion_insight: string;
  budget_assessment: string;
  cultural_note: string | null;
  _meta: { provider: string; latency_ms: number; attempt: number; }
}
```

**Gaps:**
- `personalization_score` is NOT returned by generate-gifts (not in schema, not in prompt).
- `what_not_to_do` typed as `string`, not `string | null` — validator accepts empty string, which causes blank callout to render.
- `signal_interpretation` is returned by AI but only used by Signal Check — it IS available to show as a free preview without an additional AI call.

### 0.9 Current feedback_reminders Table

```sql
CREATE TABLE public.feedback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  occasion text NOT NULL,
  occasion_date date,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);
```

Table already exists. The `upsertFeedbackReminder` helper in `giftSessionShared.ts` already handles insertion via the selection flow.

### 0.10 Known Bugs This PRD Addresses

1. **Empty "Gift caution" callout:** `what_not_to_do` is typed as `string` (not `string | null`); empty string `""` passes the truthiness check and renders a blank callout. Fix: trim + null-check.
2. **Signal Check lock state unclear:** Free users see a plain locked button with no tease. Zero indication of what they're missing. Fix: show `signal_interpretation` first sentence as preview.
3. **"No selection made" dominates gift history:** Success screen has no primary buy CTA, no clear next action after picking. Fix: "Buy on [store]" primary button in success state.
4. **Regenerate count UI:** Shows `count/limit` but label says "Regenerate ideas" — no indication this uses a quota. Fix: "Regenerate (2/3 free)" format.
5. **No "Start Over" button:** Users who want to change recipient/occasion have no path except browser back. Fix: Add "Start Over" action to bottom section.
6. **product_clicks schema too sparse:** Missing recommendation_index, confidence, store_name readable — can't do meaningful attribution analytics. Fix: schema migration + insert changes.
7. **ConfidenceBadge aria-label:** Currently `${score}% confidence score` — doesn't include the label ("Excellent match"). Fix: update to include label.
8. **"What to avoid" is a collapsible — UX friction:** The callout requires a click to expand. The value is hidden until interaction. Fix: show inline, not collapsed.

### 0.11 What's Working Well (Don't Break)

- LoadingState with node-by-node progress tracker — excellent UX, keep exactly as-is.
- ConfidenceBadge count-up animation with `prefers-reduced-motion` support — ship as-is.
- SignalCheck full analysis card design (amber gradient, revision system) — visual design is strong.
- GiftCard selection modal (Dialog-based, with note + reminder checkbox) — pattern is right, needs minor improvements.
- Plan-gated store locking in ProductLinks — logic is correct, visual treatment needs polish.
- `usePlanLimits` hook — clean, used consistently.

---

## Section 1: Overview

### 1.1 Feature Description

The Recommendation Results Experience is Step 5 of GiftMind's gift flow — the screen where a user first sees the AI's answer to their request. After entering a recipient, occasion, and budget across Steps 1–4 and paying one credit, they arrive here to see 3 ranked gift recommendations, each with a confidence score, a personalized reasoning paragraph, a relationship signal analysis, and actionable buy links to geo-targeted stores.

This is the "moment of value" screen. Every other step in the product exists to set this one up. If the results feel generic, the product has failed. If the buy links don't work, nothing converts. If the user can't pick a gift with confidence, the core promise is broken.

This screen also doubles as the primary upgrade surface in the product. The Signal Check preview, the store gate, and the regeneration quota all converge here. Users who see something they love will upgrade. Users who see nothing useful will leave and never pay.

### 1.2 Why It's the Moment of Truth

**First concrete demonstration of value.** Steps 1–4 are setup. Step 5 is the payoff. If the payoff underwhelms, every future visit is poisoned — the user has already formed their opinion of GiftMind.

**Decides if user pays.** The Confident plan upgrade, which is the primary revenue driver, is sold entirely based on what the user sees on this screen. Signal Check (the flagship Confident feature) must be visible enough to create want, and gated precisely enough to create urgency.

**The single differentiator vs. every competitor.** GiftAdvisor, Giftly, and ChatGPT all produce gift lists. None of them show a confidence score, explain *why* a gift works in terms of the specific recipient, or tell you what signal the gift sends about the relationship. These three things — confidence, why, signal — are GiftMind's product in a sentence.

**The only place in the app where "wow" is possible.** Onboarding is functional. The dashboard is navigational. The gift flow steps are input forms. Step 5 is the only screen where a user can think "this AI actually gets it." That moment of recognition is the engine of referrals, retention, and word-of-mouth.

### 1.3 Where It Fits

- **In the gift flow:** Step 5 of 5. Rendered by `StepResults.tsx`, composed by `GiftFlowStepper.tsx`.
- **In gift history:** Same data, view-only mode. Session's `ai_response` JSONB displayed without regen/select actions.
- **In analytics:** The single densest analytics event surface in the product — 15+ events per session.

### 1.4 Scope

**In scope:**
- Results rendering (3 recommendation cards)
- Confidence badge design + semantics
- "Why it works" personalized reasoning display
- "What not to do" callout (inline, not collapsed)
- Signal Check: free-user preview using `signal_interpretation` first sentence, paid-user full on-demand analysis
- Geo-targeted buy links (plan-gated store access)
- Regeneration UI with plan-based quotas and "Start Over" alternative
- Gift selection + confirmation modal + success screen with buy CTA
- Loading states (node-by-node progress tracker — keep as-is)
- Error states (retry-able, with credit refund message)
- Meta info footer (AI provider, latency — dev mode only)
- `product_clicks` table schema migration + richer tracking

**Not in scope:**
- AI generation logic (Gift Recommendation Engine PRD)
- Credit deduction mechanics (Credits & Plans PRD)
- Steps 1–4 of the gift flow (Gift Flow Orchestration PRD)
- Product search Edge Function internals (Product Linking PRD)
- Signal Check AI logic (Signal Check PRD)
- Post-gift feedback collection (Feedback Loop PRD)
- Gift History listing page (Gift History PRD)
- Saving gifts to a wishlist (V2)
- Sharing recommendations with friends for peer opinions (V2)
- PDF export of results (V2)

---

## Section 2: User Problem & Goals

### 2.1 The User Problem

> "I filled out all the steps. I spent time telling GiftMind about my recipient. Now show me something worth seeing. I need to believe these 3 ideas are actually for *this* person — not a list any search engine could produce. I need to know WHY they'll work, understand what signal they send, and be able to buy from somewhere that ships to where I'm sending. If I see 3 vague recommendations with no reasoning and a broken Amazon link, I'm closing this tab and never coming back."

### 2.2 The Business Problem

Every paywall in GiftMind converges here:
- **Signal Check lock** → upgrade to Confident ($5.99)
- **Store gate** → upgrade to Thoughtful ($2.99) or Confident
- **Regen quota** → upgrade for more attempts
- **Selection tracking** → drives feedback loop quality → better AI → more upgrades

If this screen doesn't earn trust, none of those upgrades happen. The current 15% gift selection rate (sessions with `selected_gift_name` filled) versus the ~40% target represents the entire retention gap. Users are arriving, seeing results, and leaving without committing — which means they're not getting value, and they're not coming back.

### 2.3 Jobs-to-be-Done

1. **JTBD — Ranking:** When I see 3 recommendations, I want to instantly know which is the "best" pick so I don't have to evaluate them equally from scratch.

2. **JTBD — Personalization signal:** When I read "why this works," I want to feel the AI actually understood my recipient (e.g., references their marathon training, not just "he's active").

3. **JTBD — Confidence calibration:** When I see the confidence score, I want 92% to feel meaningfully better than 78% — in color, weight, and language.

4. **JTBD — Relationship signal:** When I'm worried about misreading what the gift communicates (too romantic? too casual?), I want the Signal Check to tell me exactly what message this gift sends.

5. **JTBD — Actionable buying:** When I'm ready to buy, I want geo-appropriate store links that open a specific product page (or at minimum a filtered search), not a homepage.

6. **JTBD — Regeneration without restart:** When the AI misses the mark, I want 3 new ideas without losing my recipient/occasion/budget inputs.

7. **JTBD — Celebratory selection:** When I pick a gift, I want that moment to feel like a win (not a bureaucratic form) — then I want an immediate path to purchase.

8. **JTBD — Budget transparency:** When prices seem off, I want to understand whether the budget was filtered correctly and how to fix it.

9. **JTBD — Non-nagging upgrade path:** When I see a locked feature, I want to understand exactly what I'd get and feel like upgrading is a smart choice — not feel like the product is pestering me.

### 2.4 Success Metrics

| Metric | Target | Current Baseline | How Measured |
|---|---|---|---|
| Gift selection rate (selected_gift_name filled) | ≥40% | ~15% | gift_sessions WHERE status='completed' / total |
| Click-to-buy rate (≥1 buy link clicked) | ≥60% | Unknown | product_clicks / sessions with results |
| Avg time on Step 5 | ≥45 seconds | Unknown | PostHog session duration |
| Regeneration usage rate | ≥25% sessions | Unknown | regeneration_count > 0 |
| Signal Check preview interaction (free users) | ≥35% | 0% (not built) | click on preview element |
| Signal Check → upgrade conversion | ≥5% of preview clickers | Unknown | upgrade modal open from signal preview |
| Results → dashboard abandonment | ≤20% | Unknown | exit with no selection, no buy click |
| Feedback tagged "generic" | <15% | Unknown | feedback_reminders responded |
| Avg perceived personalization (post-feedback) | ≥4.2/5 | Unknown | PostHog survey after occasion |

---

## Section 3: User Journey & UX

### 3.1 The Anatomy of the Results Screen

The results screen renders in a single-column layout on both desktop and mobile. Cards are full-width — not side-by-side — because the "Why it works" paragraph is the core value, and it requires reading comprehension width. Shrinking to a 2-column grid would cause users to skip the reasoning, which defeats the purpose.

**Desktop layout (primary):**

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back                                           Step 5 of 5  │
│  ●────●────●────●────●  (progress bar, sticky)                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  3 gifts for Pratik's Birthday               [scroll area]     │
│  💡 These gifts celebrate his marathon training journey        │
│                                                                │
│  🧠 Personalized using 3 past gifts + 1 feedback              │
│                                                                │
│  ┌─ Top Pick ───────────────────────────────────────────────┐  │
│  │                                          ┌────────────┐  │  │
│  │  ✦ Best Match                            │    92%     │  │  │
│  │                                          │  Excellent │  │  │
│  │  Wool Merino Running Headband            └────────────┘  │  │
│  │                                                          │  │
│  │  Why it works                                            │  │
│  │  Pratik's marathon training means he runs in all         │  │
│  │  weather — in Mumbai's monsoon and Pune's winter.        │  │
│  │  A Smartwool merino headband signals you pay             │  │
│  │  attention to his passion, and at $45 it's thoughtfully  │  │
│  │  priced within your range without feeling stingy.        │  │
│  │                                                          │  │
│  │  ┌─ What to avoid ───────────────────────────────────┐  │  │
│  │  │ ⚠  Generic running gear — he's picky about fabric  │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  🔍 Signal Check                                         │  │
│  │  "This gift says 'I see you as a serious athlete'..."    │  │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ [blurred continuation]            │  │
│  │  [🔒 Unlock full Signal Check — Confident 🎯]           │  │
│  │                                                          │  │
│  │  💰 ~$45 · Budget $50–75 ✓                               │  │
│  │                                                          │  │
│  │  Buy from:                                               │  │
│  │  ┌──────────────────┐  ┌──────────────────┐             │  │
│  │  │ Amazon.in  [$42] │  │ 🔒 Flipkart      │             │  │
│  │  │ [View on store →]│  │ Unlock Thoughtful│             │  │
│  │  └──────────────────┘  └──────────────────┘             │  │
│  │                                                          │  │
│  │              [ ✓  I'll Pick This One ]                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Second Pick ─────────────────────────────────────────────┐  │
│  │  Leather Running Journal        ┌────────────┐           │  │
│  │  (muted border, no glow)        │    84%     │           │  │
│  │  Why it works...                │   Strong   │           │  │
│  │  [What to avoid]                └────────────┘           │  │
│  │  [Signal preview / lock]                                  │  │
│  │  [Buy links]                                              │  │
│  │  [I'll Pick This One]                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Third Pick ──────────────────────────────────────────────┐  │
│  │  Compression Recovery Socks     ┌────────────┐           │  │
│  │  (standard border)              │    78%     │           │  │
│  │                                 │   Strong   │           │  │
│  │  [similar structure]            └────────────┘           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ AI insights ─────────────────────────────────────────────┐  │
│  │  💡 These gifts are particularly well-timed for...       │  │
│  │  💰 Budget looks right for close friend birthday.        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Not quite right? ────────────────────────────────────────┐  │
│  │  [🔄 Regenerate (1/3 free)]      [← Start Over]          │  │
│  │  New ideas, same inputs          Change anything          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  ── dev only ──────────────────────────────────────────────── │
│  AI: claude-haiku-4-5 · 4.2s · attempt 1                      │
└────────────────────────────────────────────────────────────────┘
```

**Mobile layout:**

```
┌──────────────────────────────┐
│  ←  GiftMind       5/5   ←  │
│  ●─●─●─●─●                  │
│                              │
│  3 gifts for Pratik          │
│  💡 Marathon training...     │
│  🧠 3 past gifts used        │
│                              │
│ ┌─ Top Pick ───────────────┐ │
│ │ ✦ Best Match             │ │
│ │ ┌────────┐               │ │
│ │ │  92%   │               │ │
│ │ │Excell. │               │ │
│ │ └────────┘               │ │
│ │                          │ │
│ │ Wool Merino Running      │ │
│ │ Headband                 │ │
│ │                          │ │
│ │ Why it works:            │ │
│ │ Pratik's marathon        │ │
│ │ training...              │ │
│ │                          │ │
│ │ ⚠ What to avoid:         │ │
│ │ Generic running gear     │ │
│ │                          │ │
│ │ 🔍 Signal Check:         │ │
│ │ "This gift says 'I see   │ │
│ │ you as a serious..."     │ │
│ │ [🔒 Unlock — Confident]  │ │
│ │                          │ │
│ │ 💰 ~$45 · Budget ✓       │ │
│ │                          │ │
│ │ [Amazon.in $42] →        │ │
│ │ [🔒 Flipkart — Upgrade]  │ │
│ │                          │ │
│ │ [✓ I'll Pick This One]   │ │
│ └──────────────────────────┘ │
│                              │
│ [🔄 Regenerate (1/3 free)]   │
│ [← Start Over]               │
└──────────────────────────────┘
```

**Layout rules:**
- Single column on all screen sizes — max-width: 800px, centered
- Top Pick card: `border-amber-300 shadow-glow-amber` — already implemented via `isBestMatch` prop
- Cards 2 and 3: standard `border-border/80` (current behavior is correct)
- Sticky header: progress bar stays fixed during scroll (currently NOT sticky — needs change)
- Full page scroll, no internal card scroll

**Keyboard navigation:**
- `Tab` moves through interactive elements in DOM order
- `Enter` on "I'll Pick This One" opens selection modal
- `Escape` closes modal (already handled by Dialog component)
- `Tab` within modal moves: name → note → reminder checkbox → cancel → confirm

### 3.2 The Confidence Badge

The `ConfidenceBadge` component (`src/components/ui/confidence-badge.tsx`) already exists and is well-built. These are the changes needed:

**Current labels vs. PRD labels:**

| Score | Current Label | PRD Label | Change? |
|---|---|---|---|
| ≥90 | "Excellent match" | "High confidence" | Yes |
| 75-89 | "Strong match" | "Strong match" | No |
| 60-74 | "Good match" | "Good fit" | Minor |
| <60 | "Moderate match" | Don't show (AI rejects <60) | — |

**Decision:** Keep "Excellent match" and "Strong match" — they are clearer user language than "High confidence" and "Strong match" (confidence is already conveyed by the number). The number says the score; the label interprets it. Change only "Good match" → "Good fit" (warmer language).

**Animation spec (current implementation is correct):**
- Cubic easing (already: `1 - Math.pow(1 - progress, 3)`)
- Duration: 800ms (current) — keep
- Delay: 0ms (current) — keep
- `prefers-reduced-motion`: jump to value immediately (already implemented)

**Accessibility fix needed:**
- Current: `aria-label={`${score}% confidence score`}`
- Fix: `aria-label={`${score} percent confidence — ${label}`}`

**Tooltip (new):**
- On hover, show: "This score reflects how well the gift matches your recipient's interests, relationship depth, and occasion fit."
- Implement as a `<Tooltip>` component wrapping the badge (shadcn/ui Tooltip).
- Don't show tooltip on mobile (hover doesn't apply; add `hidden md:block` wrapper).

**Size variants (existing sizes are correct, use as-is):**
- `sm` — gift history list
- `md` — recommendation card header (current default)
- `lg` — selection modal (new use)

### 3.3 The "Why It Works" Reasoning Block

Currently: `gift.why_it_works` is rendered as a `<p className="max-w-2xl text-sm leading-6 text-neutral-600">` in `GiftCard.tsx`.

**Required changes:**

1. **Section header.** Add a small label above the paragraph:
   ```
   Why it works
   ─────────────   (1px border, muted)
   [paragraph text]
   ```
   This signals to the user that what follows is the AI's reasoning, not just a product description.

2. **Typography:** Inter 400, 16px (currently text-sm = 14px). Increase to `text-base` for readability on this most-important content.

3. **Line height:** Already `leading-6` (1.5). Spec wants 1.6 — change to `leading-relaxed` (Tailwind's 1.625).

4. **No truncation.** The full `why_it_works` paragraph must be visible without expansion. It currently renders in full — preserve this.

5. **Personalization warning:** The `generate-gifts` Edge Function does NOT currently return `personalization_score`. To implement the "this is generic" warning without a breaking change:
   - Add optional `personalization_score` to the `GiftRecommendation` type
   - If the field is absent (current data), no warning shown
   - In V2 engine (VITE_USE_LANGGRAPH=true), the field may be populated
   - If present and <70: show `PersonalizationWarning` component inline below the why-block

**PersonalizationWarning component (new — `src/components/gift-flow/PersonalizationWarning.tsx`):**
```tsx
// Shows if personalization_score < 70
// Props: score: number | undefined
export function PersonalizationWarning({ score }: { score?: number }) {
  if (!score || score >= 70) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={1.5} />
      This recommendation is a bit generic — try regenerating for a more specific match.
    </div>
  );
}
```

### 3.4 The "What to Avoid" Callout

**Current implementation:** Collapsible button with `ChevronDown` — content hidden until clicked.

**Change required:** Show inline, not collapsed. The "what to avoid" insight is too valuable to hide behind a click. The UX concern about "it might worry users" is wrong — knowing what NOT to do reduces purchase anxiety. Show it inline.

**New design:**

```
┌────────────────────────────────────────────────┐
│  ⚠  What to avoid                              │
│  Generic running gear — he's picky about        │
│  fabric quality                                │
└────────────────────────────────────────────────┘
```

**Spec:**
- Icon: `AlertTriangle` (amber-500, NOT red)
- Text: "What to avoid" label (xs, uppercase, tracking-wide, amber-700) + one-sentence text (sm, amber-800)
- Background: `bg-amber-50`
- Border: `border border-amber-200` + `border-l-4 border-l-amber-400`
- Padding: `px-4 py-3`
- Border radius: `rounded-xl`

**Empty/null handling (bug fix):**
Current code: `if (gift.what_not_to_do)` — this renders blank if `what_not_to_do` is `""`.
Fix:
```tsx
{gift.what_not_to_do?.trim() ? (
  <AvoidCallout text={gift.what_not_to_do} />
) : null}
```

**AvoidCallout component (`src/components/gift-flow/AvoidCallout.tsx` — new):**
```tsx
interface AvoidCalloutProps { text: string }
export function AvoidCallout({ text }: AvoidCalloutProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.5} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">What to avoid</p>
        <p className="text-sm text-amber-800">{text}</p>
      </div>
    </div>
  );
}
```

### 3.5 The Signal Check Preview + Lock

**Current state:** Free users see a flat "Unlock with Confident" button. No preview.

**The opportunity:** `signal_interpretation` is ALREADY returned by `generate-gifts` for every recommendation. It's in `gift.signal_interpretation`. We can show the first ~15 words as a tease WITHOUT any additional AI call or credit cost.

**Free user experience (Spark / Thoughtful):**

```
┌────────────────────────────────────────────────────┐
│ 🔍 Signal Check                                    │
│                                                    │
│ "This gift says 'I see you as a serious            │
│  athlete' — a strong statement that you            │
│  pay attention..."  ░░░░░░░░░░░░░░░░               │
│  [blurred trailing text, gradient fade]            │
│                                                    │
│ [🔒 Unlock full analysis — Confident 🎯]          │
└────────────────────────────────────────────────────┘
```

**Implementation logic:**
```tsx
// In SignalCheck.tsx (or new SignalCheckPreview.tsx):
const previewText = gift.signal_interpretation?.slice(0, 120) ?? "";
// Show 120 chars, then blur the last 40 chars with a gradient overlay
// Clicking anywhere on the preview or the button → opens UpgradeModal
```

**Visual treatment of preview:**
- Show first 120 characters of `signal_interpretation` as preview text
- Render the text in a `<div className="relative">`:
  - Last 40 chars wrapped in `<span className="blur-[3px] select-none">` to create the curiosity gap
  - A `linear-gradient(transparent, white)` overlay fades it out even more
- "Unlock full analysis" button below — uses `variant="outline"` with lock icon and plan badge
- Clicking the blurred text area OR the button → `setUpgradeOpen(true)`

**Paid user experience (Confident / Gifting Pro):**

The existing `SignalCheck.tsx` component is already well-designed. Keep it. The only changes:

1. Show the INITIAL state as a "Show Signal Check" button (current behavior) — on-demand is correct; auto-loading costs 0.5 credits per recommendation which would charge paid users on every results view without consent.

2. After running: the full analysis card shows with positive_signals, potential_risks, adjustment_suggestions (current design is correct — keep the amber gradient card).

3. **New:** For paid users who have NOT yet run Signal Check, show the `signal_interpretation` text (the AI-generated field from generate-gifts) as a free preview ABOVE the "Show Signal Check" button:
   ```
   🔍 Signal Check
   ─────────────────
   "This gift says 'I see you as a serious athlete'..."
   [Show full analysis — uses 0.5 credit]
   ```
   This gives paid users a taste before they commit the credit, reducing friction.

**Plan gates (server-side enforced, not just client):**
- Spark: signal_interpretation preview (no cost), locked analysis
- Thoughtful: signal_interpretation preview (no cost), locked analysis
- Confident: signal_interpretation preview (no cost) + full on-demand analysis (0.5 credits)
- Gifting Pro: signal_interpretation preview (no cost) + full on-demand analysis (0.5 credits)

### 3.6 Buy Links Row — Geo-Targeted & Plan-Gated

**Current implementation:** Horizontal scroll with wide `min-w-[260px]` cards. Rich data (image, price, stock, coupon, delivery ETA).

**The existing design is good.** The card layout, the locked store placeholder, the upgrade modal on lock click — keep all of this. The changes needed are:

**1. Layout on mobile:** The horizontal scroll works but cards are hard to dismiss on touch. Add `snap-x snap-mandatory` scroll snapping so cards click into place.

```tsx
<div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
  {products.map(product => (
    <Card className="min-w-[260px] snap-center ...">
```

**2. Budget indicator above buy links (new `BudgetBadge` component):**

```
💰  ~$45  ·  Your budget $50–75  ✓
```

```tsx
// Show price_anchor vs budget range
// Green ✓ if price_anchor is within range
// Amber ⚠ if price_anchor exceeds budget_max by ≤20%
// Red ✗ if price_anchor exceeds budget_max by >20%
interface BudgetBadgeProps {
  priceAnchor: number;
  budgetMin: number;
  budgetMax: number;
  currency: string;
}
```

**3. Fallback state when no products found:**

When `products.length === 0` and `!isLoading`:
```
┌─────────────────────────────────────┐
│  🔍 Searching stores didn't find    │
│     a direct match.                 │
│  [Search on Amazon →]               │
└─────────────────────────────────────┘
```
Construct a fallback search URL using `buildSearchUrl` logic for the top store.

**4. "X more stores on Confident" tease:**

When `lockedStores.length > 0`:
```tsx
<p className="text-xs text-muted-foreground mt-2">
  +{lockedStores.length} more stores available on Confident 🎯
</p>
```

**Geo logic (already correct in search-products, document here for clarity):**
- `recipient_country` takes priority over `user_country`
- If `recipient_country` is null, use `user_country`
- If no stores found for country, GLOBAL fallback applies
- Cross-border note (`crossBorderMeta` badge) shows when recipient is in different country than user — keep

**Click tracking (bug fix — richer schema):**
Update `trackProductClick` in `useGiftSession.ts` to include new fields once the schema migration is applied (see Section 5.1).

### 3.7 Regeneration & Alternative Actions

**Current state:** Regenerate button exists. Shows `count/limit` format. No "Start Over" button.

**Full spec for the bottom section:**

```
┌─ Not quite right? ────────────────────────────────────────────┐
│                                                               │
│  [🔄 Regenerate (1/3 free)]         [← Start Over]          │
│                                                               │
│  New ideas, same inputs.        Change person or occasion.   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Regenerate button states:**

| State | Label | Behavior |
|---|---|---|
| 0 used, Spark (limit 1) | "🔄 Regenerate (0/1 free)" | Allowed |
| 0 used, Thoughtful (limit 2) | "🔄 Regenerate (0/2 free)" | Allowed |
| 0 used, Confident (limit 3) | "🔄 Regenerate (0/3 free)" | Allowed |
| 1 used, Confident | "🔄 Regenerate (1/3 free)" | Allowed |
| At limit | "🔄 Regenerate (limit reached)" | → UpgradeModal |
| Generating | "Generating new ideas…" + spinner | Disabled |

**Current implementation of count display:**
```tsx
// StepResults.tsx line 571-572 — already shows count/limit
<span className="ml-2 text-xs text-muted-foreground">
  {giftSession.regenerationCount}/{planLimits.maxRegenerations === -1 ? "∞" : planLimits.maxRegenerations}
</span>
```
Change the button label to: `Regenerate (${used}/${max})` format — move the count into the button text, not after it.

**"Start Over" button (new):**
- Navigates to `/gift-flow` with `recipientId` pre-populated in query params so the user doesn't have to re-select recipient
- Confirmation: none required (no irreversible data loss — session is preserved)
- Rendered as `variant="outline"` secondary button next to Regenerate

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => navigate(`/gift-flow?recipientId=${selectedRecipient.id}`)}
>
  <RotateCcw className="mr-2 h-4 w-4" />
  Start Over
</Button>
```

**Regeneration behavior (existing logic is correct):**
1. Frontend checks `planLimits.canRegenerate(giftSession.regenerationCount)`
2. If at limit → UpgradeModal
3. If allowed → `giftSession.regenerate(params)` → sets PENDING state → replaces recommendations
4. Old recommendations discarded (no "round comparison" — avoid decision fatigue)
5. Server-side enforcement: `generate-gifts` checks `regeneration_count < limit`, returns 403 if over

**No new credit charge for regeneration** — this is already correctly implemented. Regen is "fixing" the first attempt, not buying a new session.

### 3.8 Gift Selection Flow

**Current state:** "I'll Pick This One" opens a Dialog with the gift name, a note field (max 150 chars), and a reminder checkbox. Works correctly. The success state (SuccessState component) shows share buttons and dashboard navigation.

**Changes to current implementation:**

**In the selection modal:**
1. Increase note field max to **200 characters** (currently 150 — small change, update the `slice(0, 150)` to `slice(0, 200)` and maxLength).
2. Add **ConfidenceBadge `size="lg"`** above the gift name in the modal header so users feel reinforced in their choice.
3. Reminder checkbox default: `true` if `occasionDate` is set, `false` if no date (current implementation uses `useState(true)` always — fix this).

**Updated SelectionModal layout:**

```
┌──────────────────────────────────────────────────┐
│  Mark this as your pick?                         │
│                                                  │
│  ┌──────────┐                                    │
│  │   92%    │  Wool Merino Running Headband      │
│  │ Excellent│  for Pratik's Birthday              │
│  └──────────┘                                    │
│                                                  │
│  ── Optional ─────────────────────────────────── │
│  ☑ Ask me after the occasion how it went         │
│    We'll save a follow-up reminder.              │
│                                                  │
│  Add a note (just for you):                      │
│  ┌──────────────────────────────────────────┐   │
│  │ Going to wrap with his favorite          │   │
│  │ brown paper                              │   │
│  └──────────────────────────────────────────┘   │
│  192/200                                         │
│                                                  │
│  [ Cancel ]              [ Yes, This One ]       │
└──────────────────────────────────────────────────┘
```

**"Yes, This One" action sequence** (current in `useGiftSession.ts:selectGift` — mostly correct, document for completeness):

1. Update `gift_sessions` row:
   - `selected_gift_index = giftIndex`
   - `selected_gift_name = giftName`
   - `selected_gift_note = options.note`
   - `confidence_score = selectedGift.confidence_score`
   - `status = 'completed'`
2. Update `recipients.last_gift_date = now()` (current: `last_gift_date` — verify column name)
3. `award-referral-credits` invoked (silent, current behavior)
4. If `options.createReminder && options.occasion`: upsert into `feedback_reminders`
5. Set local state: `isComplete = true`, `selectedGiftIndex = giftIndex`
6. **New:** fire PostHog analytics event `gift_flow_gift_selected` with properties: `rec_index`, `confidence_score`, `has_note`, `reminder_set`

**Success screen changes:**

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              🎉                                  │
│                                                  │
│         Great choice!                            │
│                                                  │
│  You picked the Wool Merino Running Headband     │
│  with 92% confidence for Pratik's Birthday.      │
│                                                  │
│  Ready to buy?                                   │
│  ┌────────────────────────────────────────┐      │
│  │  🛒 Buy on Amazon.in →                 │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ✨ We'll ask how Pratik reacted after his       │
│     birthday — feedback makes GiftMind smarter.  │
│                                                  │
│  ─────────────────────────────────────────────   │
│                                                  │
│  [ Back to Dashboard ]  [ Find Another Gift ]    │
│                                                  │
│  [Share GiftMind]  [Copy referral link]          │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Key change: "Buy on [Store]" primary CTA on success screen.**

After selecting a gift, find the first non-locked product link for that gift and show it as the primary action. If no buy links are available, show "Search on Amazon" with the search URL.

```tsx
// In SuccessState or StepResults when isComplete:
const selectedGift = giftSession.recommendations?.[giftSession.selectedGiftIndex ?? 0];
const selectedGiftProduct = giftSession.productResults
  ?.find(r => r.gift_name === selectedGift?.name)
  ?.products?.[0];

const buyUrl = selectedGiftProduct?.affiliate_url 
  || selectedGiftProduct?.product_url 
  || selectedGiftProduct?.search_url;
const storeName = selectedGiftProduct?.store_name ?? "Amazon";
```

Pass `buyUrl` and `storeName` to the SuccessState component as props.

---

## Section 4: Logic & State Management

### 4.1 Component State Machine

```
State: PENDING
(credit deducted, AI call in-flight, node-by-node progress shown)
    │
    ├── AI returns success ──────────────────────────────────────►  State: RESULTS
    │                                                               │
    └── AI returns error ───────────────────────────────────────►  State: ERROR
                                                                   │
                                            ┌──────────────────────┤
                                            │ retry (refund issued) │
                                            ▼                       │
                                       State: PENDING               │
                                            │                       │
                                        (credit                     │
                                        NOT deducted                │
                                        on retry)                   │


State: RESULTS
    │
    ├── Click "I'll Pick This One" ──────────► State: SELECTION_MODAL
    │                                              │
    │                                    ┌─────────┴──────────┐
    │                                    │ cancel             │ confirm
    │                                    ▼                    ▼
    │                               State: RESULTS       State: CONFIRMED
    │                                                         │
    │                                                    SuccessState rendered
    │
    ├── Click Regenerate (within quota) ─────► State: PENDING (no credit)
    │
    ├── Click Regenerate (at quota) ──────────► UpgradeModal shown (no state change)
    │
    ├── Click Start Over ──────────────────────► Navigate /gift-flow (state reset)
    │
    └── Click buy link ────────────────────────► External tab + product_clicks insert
                                                 (state: RESULTS, session persists)

State: CONFIRMED (isComplete = true)
    ├── "Buy on [Store]" ────────────────────► External tab (product_clicks insert)
    ├── "Back to Dashboard" ─────────────────► Navigate /dashboard
    └── "Find Another Gift" ─────────────────► Navigate /gift-flow?recipientId=...
```

### 4.2 Data Flow on Results Load

```
1. User navigates to Step 5 (giftSession.generateGifts called from GiftFlowStepper)
   └── Frontend: renders LoadingState (node-by-node progress)
   └── useGiftSession.runGeneration():
       a. createSession() → inserts gift_sessions row, gets sessionId
       b. deductCredit(sessionId) → 1 credit deducted
       c. callAI(params) → invokes generate-gifts Edge Function
          └── Edge Function:
              - Validates auth + session ownership
              - Rate-limits (10 sessions/hour max)
              - Reads user plan
              - Calls AI via provider chain
              - Validates response (exactly 3 recs required)
              - Updates gift_sessions.ai_response
              - Returns recommendations + _meta
       d. setState: recommendations, occasionInsight, budgetAssessment, etc.
       e. Frontend renders RESULTS state

2. After recommendations render (parallel, non-blocking):
   └── searchProducts(params) → invokes search-products Edge Function
       └── Edge Function:
           - Reads plan from DB (server-side, ignores client claim)
           - Fetches marketplace_config by country
           - Fetches marketplace_products matching keywords + category
           - Applies STORE_LIMITS (spark=1, thoughtful=2, confident/pro=99)
           - Returns ProductLink[] + LockedStore[] per gift
       └── setState: productResults, isSearchingProducts: false
       └── UI: buy links replace "Searching stores..." placeholders

3. If AI returns error:
   └── If not a regeneration: refundCredit(sessionId)
   └── updateSessionStatus(sessionId, 'errored')
   └── setState: error, errorType, refundIssued
```

**Progressive rendering contract:**
- Results MUST show as soon as AI responds — do not wait for product search
- During product search: show skeleton cards in the buy links section
- Buy link clicks are blocked while isSearchingProducts (graceful: show "Loading stores…" text, not disabled button)
- Selection ("I'll Pick This One") is ENABLED even before buy links load

### 4.3 Per-Recommendation Data Model

```typescript
// Extended from generate-gifts response + product search enrichment
interface Recommendation {
  // From AI (generate-gifts)
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;           // 0-100
  signal_interpretation: string;      // Full signal analysis — use for preview
  search_keywords: string[];
  product_category: string;
  price_anchor: number;               // USD
  what_not_to_do: string;             // May be "". Treat empty string as null.

  // Optional — from V2 engine only (VITE_USE_LANGGRAPH=true)
  personalization_score?: number;     // 0-100. If absent, no warning shown.
  personalization_issues?: string[];
}

// Existing GiftRecommendation type in giftSessionTypes.ts — verify it includes signal_interpretation
// If not, add it.

interface BuyLinksState {
  products: ProductLink[];
  lockedStores: LockedStore[];
  isLoading: boolean;
  error: string | null;
}
```

### 4.4 Regeneration Logic

**Client-side check (usePlanLimits):**
```typescript
canRegenerate: (count: number) => config.maxRegenerations === -1 || count < config.maxRegenerations
// spark: 1, thoughtful: 2, confident: 3, gifting-pro: -1 (unlimited)
```

**Server-side enforcement (generate-gifts Edge Function, already implemented):**
```typescript
function regenerationLimit(plan: string): number {
  return { spark: 1, thoughtful: 2, confident: 3, "gifting-pro": -1 }[plan] ?? 1;
}
// Returns 403 if at limit
```

**Regeneration does not charge credits** — already implemented correctly. The deductCredit call is only in the `!options.isRegeneration` branch.

**Regeneration replaces — does not accumulate.** Previous recommendations are discarded. Old `productResults` are replaced. This is intentional — avoids decision paralysis.

### 4.5 Buy Link Click Tracking

**Current tracking call** (in `trackProductClick`):
```typescript
await supabase.from("product_clicks").insert({
  user_id: user.id,
  session_id: state.sessionId,
  gift_concept_name: product.gift_name,
  product_title: product.product_title || product.store_name,
  product_url: outboundUrl,
  store: product.store_id,
  country: product.domain?.split(".").pop() || "",
  is_search_link: Boolean(product.is_search_link),
});
```

After the schema migration (Section 5.1), add:
- `recommendation_index` — which of the 3 cards was clicked (0/1/2)
- `recommendation_confidence` — confidence_score of that recommendation
- `store_name` — readable name (e.g., "Amazon.in")
- `recipient_id` — from session
- `clicked_from` — "results_screen" | "success_screen"

The `recommendation_index` must be passed down from `StepResults` through `GiftCard` through `ProductLinks` to the click handler.

### 4.6 Edge Cases

**1. AI returns <3 recommendations**
`validateAIResponse` in `generate-gifts` requires `recommendations.length === 3` — returns 502 if not. Frontend gets error state. Retry is available.

**2. AI returns 3 with all confidence <60**
Currently: rendered anyway. Gap: no visual warning.
Fix: if ALL three `confidence_score` values are <60, show a banner above the cards:
```tsx
const allLowConfidence = recommendations.every(r => r.gift.confidence_score < 60);
// Show: "These suggestions are a bit general — try regenerating for better matches."
```

**3. Budget prices exceed budget_max**
`budget_assessment` string from AI will flag this. Currently rendered in the "AI insights" card at the bottom. Keep this.

**4. Recipient deleted while on results screen**
Session data persists in React state. `recipient.id` is stored in session. "Find Another Gift" navigates to `/gift-flow` (no recipientId). If user clicks "I'll Pick This One", the selectGift call will still update the session — recipient_id is already on the session row. Acceptable behavior.

**5. User's plan downgraded mid-session**
`usePlanLimits` reads plan on mount. If user downgrades in another tab during the same session, the client still shows old plan limits. On next regen, the server enforces the new limit and returns 403. Frontend catches this with the `UpgradeModal` flow. Acceptable.

**6. Buy links API fails**
`searchProducts` error → `productResults = null`. `GiftCard` receives `products={null}`. `ProductLinks` renders empty + shows fallback: "Search on Amazon" with a constructed URL. The construction logic uses `gift.search_keywords[0]` as the search term.

**7. Two recommendations have identical product_category**
AI is instructed to vary categories. If duplication slips through, it's harmless — different products in the same category can both be good. No client-side dedup needed.

**8. User refreshes mid-pending (AI in-flight)**
Credit was deducted. AI call is aborted. Session status becomes `active` (not `completed`). On refresh, the gift flow starts from Step 1. The previous session has a deducted credit. The `refund-credit` Edge Function should be callable — but this is a recovery path for support, not automated. The session stays in `errored` state if the refund wasn't issued before refresh.

**9. AI takes >20 seconds**
Show "Taking longer than usual…" message after 15s. Add a cancel button that calls `refundCredit` and resets state to allow retry.

```tsx
// In LoadingState, add a 15-second timeout:
useEffect(() => {
  if (!isGenerating) return;
  const timeout = setTimeout(() => setShowSlowWarning(true), 15000);
  return () => clearTimeout(timeout);
}, [isGenerating]);
```

**10. AI takes >45 seconds**
Supabase Edge Functions have a default 60s timeout. At 45s, show: "This is taking too long. Your credit will be refunded if this fails." At 60s, the function returns 504, which maps to `AI_ERROR` — credit refund triggers.

**11. User picks gift, then regrets**
The session is `completed`. Selection cannot be un-done from the results screen. The Gift History PRD covers un-selection within a time window. Not in scope here — note it as a known limitation.

**12. Recommendation has no what_not_to_do (empty string)**
Fixed by the trim check: `gift.what_not_to_do?.trim() ? <AvoidCallout> : null`. Empty string → callout hidden.

**13. Signal Check AI fails for paid user**
`signalMutation.onError` fires. Current implementation shows `toast.error(message)`. Keep this. Add a retry option: "Signal Check failed. Try again." button replaces the "Show Signal Check" button.

**14. Regen triggered on completed session**
`giftSession.isComplete = true` prevents the Regenerate button from being shown (the SuccessState renders instead). No issue.

**15. View-only mode (from Gift History)**
When `viewOnly = true` prop is passed:
- Hide "I'll Pick This One" buttons on all cards
- Hide "Regenerate" section
- Hide "Start Over" button
- Show "View Only" badge in header
- Signal Check is disabled (no credit charges on viewed history)
- Buy links remain active (clicking stores from history is allowed)

**16. Prefers-reduced-motion**
Already handled in `useCountUp` hook — jumps to final value. No other animations require motion. Entry animations (card stagger) should also be disabled. Add:
```tsx
const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
// Pass to card: animate={!prefersReduced}
```

**17. Screen reader**
- ConfidenceBadge: update `aria-label` to include label text
- "What to avoid" callout: `role="note"`, `aria-label="Caution about this gift"`
- Signal Check preview blur: `aria-hidden="true"` on the blurred portion; accessible text elsewhere
- Selection modal: focus trap (Dialog handles this already)
- Regenerate button: `aria-live="polite"` on the count text so screen readers announce changes

**18. Product link opens in new tab**
All buy links use `window.open(url, "_blank", "noopener,noreferrer")` — correctly implemented in `trackProductClick`.

**19. No stores found for country**
search-products returns `products: [], locked_stores: []` with a "no stores for this country" message. UI shows the fallback "Search on Amazon" with global fallback URL.

**20. User language is not English**
AI response `why_it_works` and `what_not_to_do` are in English (system prompt enforces it). If the AI returns non-English text despite the system prompt (rare), the UI renders whatever is returned. No client-side language validation — acceptable, as this is an edge case and validation adds latency.

---

## Section 5: System Design & Backend

### 5.1 product_clicks Table Migration

The current schema is sparse. The following migration adds the fields needed for meaningful attribution and analytics.

```sql
-- Migration: add_product_click_enriched_fields.sql
-- Adds fields needed for recommendation attribution analytics.
-- Safe to apply: all new columns are nullable or have defaults.

ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommendation_index integer CHECK (recommendation_index IS NULL OR recommendation_index BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS recommendation_confidence integer,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS estimated_price numeric,
  ADD COLUMN IF NOT EXISTS product_title text,
  ADD COLUMN IF NOT EXISTS clicked_from text DEFAULT 'results_screen';

-- Rename store → store_id for clarity (keep store column for backward compat)
ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS store_id text;

-- Backfill store_id from store
UPDATE public.product_clicks SET store_id = store WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clicks_user_at ON public.product_clicks(user_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_session ON public.product_clicks(session_id);
CREATE INDEX IF NOT EXISTS idx_clicks_store_country ON public.product_clicks(store_name, country);
CREATE INDEX IF NOT EXISTS idx_clicks_recipient ON public.product_clicks(recipient_id);
```

**Updated insert in `trackProductClick`:**

```typescript
await supabase.from("product_clicks").insert({
  user_id: user.id,
  session_id: state.sessionId,
  recipient_id: recipientId,                    // NEW — from params
  gift_concept_name: product.gift_name,
  recommendation_index: recommendationIndex,     // NEW — 0, 1, or 2
  recommendation_confidence: recommendationConfidence,  // NEW — confidence_score
  store_id: product.store_id,
  store_name: product.store_name,               // NEW — readable name
  product_url: outboundUrl,
  product_title: product.product_title,          // NEW
  country: product.domain?.split(".").pop() || "",
  estimated_price: product.price_amount,         // NEW
  is_search_link: Boolean(product.is_search_link),
  clicked_from: "results_screen",               // NEW
});
```

`recommendation_index` requires propagating the index from `StepResults → GiftCard → ProductLinks → onTrackClick`. Update the `onTrackClick` callback signature:

```typescript
// In StepResults.tsx:
onTrackClick={(product) => {
  void giftSession.trackProductClick({
    ...product,
    recommendationIndex: originalIndex,           // NEW
    recommendationConfidence: gift.confidence_score, // NEW
    recipientId: selectedRecipient.id,            // NEW
  });
}}
```

### 5.2 API / Edge Function Contracts

**generate-gifts** — existing, document the full response shape for implementation reference:

```json
{
  "recommendations": [
    {
      "name": "Wool Merino Running Headband",
      "description": "A lightweight merino wool headband...",
      "why_it_works": "Pratik's marathon training means he runs in all weather...",
      "confidence_score": 92,
      "signal_interpretation": "This gift says 'I see you as a serious athlete'...",
      "search_keywords": ["merino", "wool", "running", "headband", "smartwool"],
      "product_category": "sports",
      "price_anchor": 45,
      "what_not_to_do": "Avoid generic running gear — he's picky about fabric quality"
    }
  ],
  "occasion_insight": "Birthdays are a natural moment to celebrate an ongoing passion.",
  "budget_assessment": "Your $50–75 range is well-suited for a thoughtful athletic accessory.",
  "cultural_note": null,
  "_meta": {
    "provider": "claude-haiku-4-5-20251001",
    "latency_ms": 4200,
    "attempt": 1
  }
}
```

**Gaps in current generate-gifts response (not blocking V1):**
- `personalization_score` not returned (V2 engine adds this)
- `what_not_to_do` should be `string | null` but is typed as `string` — empty string is the null equivalent

**search-products** — existing, returns per-gift results:

```json
{
  "success": true,
  "target_country": "IN",
  "results": [
    {
      "gift_name": "Wool Merino Running Headband",
      "products": [
        {
          "store_id": "amazon_in",
          "store_name": "Amazon.in",
          "domain": "amazon.in",
          "brand_color": "#FF9900",
          "gift_name": "Wool Merino Running Headband",
          "product_category": "sports",
          "is_search_link": false,
          "product_url": "https://www.amazon.in/dp/...",
          "affiliate_url": "https://www.amazon.in/dp/...?tag=giftmind-21",
          "product_title": "Smartwool Merino 150 Running Headband",
          "image_url": "https://...",
          "price_amount": 42,
          "price_currency": "USD",
          "stock_status": "in_stock",
          "delivery_eta_text": "Get it in 2 days",
          "is_affiliate": true
        }
      ],
      "locked_stores": [
        {
          "store_id": "flipkart",
          "store_name": "Flipkart",
          "brand_color": "#2874F0",
          "is_locked": true,
          "unlock_plan": "thoughtful"
        }
      ]
    }
  ],
  "total_stores_available": 5,
  "stores_shown": 1,
  "is_cross_border": false,
  "server_plan": "spark"
}
```

**signal-check** — existing, on-demand for Confident+:

```json
{
  "success": true,
  "signal": {
    "overall_message": "This gift communicates 'I see you as a serious athlete and I respect that passion.'",
    "positive_signals": [
      "Shows genuine attention to his marathon training",
      "Demonstrates knowledge of quality gear (merino vs generic polyester)",
      "Appropriate for a close friend — not too romantic, not too casual"
    ],
    "potential_risks": [
      "He may already own a headband of this type"
    ],
    "confidence_note": "High confidence. Running accessories are universally appreciated by serious runners.",
    "adjustment_suggestions": [
      "Consider personalizing with initials if the brand offers it",
      "Pair with a recovery gel or energy bar for extra thoughtfulness"
    ]
  },
  "signal_check_id": "uuid",
  "revision_number": 1,
  "credits_remaining": 9.5,
  "_meta": { "provider": "claude-sonnet-4-6", "credits_used": 0.5, "latency_ms": 2100, "attempt": 1 }
}
```

### 5.3 GiftRecommendation Type (fix needed)

Current type in `giftSessionTypes.ts` needs to be verified for `signal_interpretation` inclusion. It is returned by the AI but may not be in the client-side type.

```typescript
// src/hooks/giftSessionTypes.ts — verify and update:
export interface GiftRecommendation {
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;
  signal_interpretation: string;        // Ensure this exists
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
  what_not_to_do: string;
  personalization_score?: number;       // Add — optional, V2 engine only
  personalization_issues?: string[];    // Add — optional
}
```

### 5.4 Analytics Events

All events use PostHog. Add `posthog.capture()` calls at the specified points. Properties use snake_case.

| Event | Properties | Trigger |
|---|---|---|
| `results_viewed` | session_id, provider, latency_ms, rec_count | First render of RESULTS state |
| `result_card_entered_viewport` | rec_index, confidence_score, plan | IntersectionObserver fires |
| `signal_check_preview_clicked` | rec_index, plan | Free user clicks preview area |
| `signal_check_upgrade_clicked` | rec_index, current_plan | UpgradeModal opened from signal |
| `signal_check_run` | rec_index, plan, revision_number | Paid user runs initial check |
| `signal_check_follow_up` | rec_index, plan, revision_number | Paid user runs follow-up |
| `buy_link_clicked` | rec_index, store_name, country, confidence, is_search_link | Any buy link click |
| `buy_link_locked_clicked` | rec_index, store_name, unlock_plan | Locked store click |
| `regenerate_clicked` | regen_count, plan, time_on_screen_ms | Regenerate button clicked |
| `regenerate_limit_hit` | regen_count, plan | Clicked when at limit |
| `gift_selected` | rec_index, confidence, has_note, reminder_set, time_on_screen_ms | "Yes, This One" confirmed |
| `gift_selection_cancelled` | rec_index | Cancel on modal |
| `start_over_clicked` | time_on_screen_ms | Start Over button |
| `results_buy_link_clicked_post_selection` | store_name, session_id | Buy link on success screen |
| `results_abandoned` | time_on_screen_ms, scrolled_to_bottom, regen_count | Page exit, no selection |

Track `time_on_screen_ms` by storing `Date.now()` on RESULTS state mount and computing delta on each event.

### 5.5 Security & RLS

- **gift_sessions.ai_response** (JSONB): Contains all recommendations. RLS on `gift_sessions` already enforces `user_id = auth.uid()` — recommendations are protected.
- **signal_check**: Plan gate enforced server-side in Edge Function. Frontend gate is convenience only — never trust it.
- **product_clicks**: Existing RLS (`auth.uid() = user_id` for INSERT and SELECT). Superadmin SELECT policy also exists.
- **Affiliate URL injection**: `affiliate_url` comes from `marketplace_products.affiliate_url` (database) — not user-generated. No sanitization risk. Do NOT allow user-provided URLs to be opened from this screen.
- **Signal interpretation preview**: `signal_interpretation` is AI-generated and stored in `gift_sessions.ai_response`. Rendering it as text (no dangerouslySetInnerHTML) — safe.

### 5.6 Performance

| Operation | Target P95 | Current | Action |
|---|---|---|---|
| AI generation (generate-gifts) | <8s | 4-8s observed | Keep current provider chain |
| Product search (search-products) | <3s after results | Unknown | Keep async; add timeout at 8s |
| Confidence badge animation | 800ms | 800ms (correct) | No change |
| Card entry animation | <50ms per card | N/A (not staggered) | Add stagger (see Section 6) |
| Signal Check (on-demand) | <4s | 2-3s observed | No change |
| Buy link card render | <16ms | Not measured | Wrap ProductLinks in React.memo |

**React.memo usage:**
- `GiftCard` should be memoized (props change only on regen)
- `ProductLinks` should be memoized (frequently re-renders from parent)
- `ConfidenceBadge` is already cheap (no memo needed)

---

## Section 6: Component Breakdown

### 6.1 File Structure

All results components live in `src/components/gift-flow/`. No new directory is needed.

```
src/components/gift-flow/
├── StepResults.tsx           (main container — MODIFY)
├── GiftCard.tsx              (individual gift card — MODIFY)
├── SignalCheck.tsx           (signal analysis — MODIFY: add preview)
├── ProductLinks.tsx          (store cards — MODIFY: snap scroll, fallback)
├── NoCreditGate.tsx          (paywall — NO CHANGE)
├── AvoidCallout.tsx          (NEW — extracted from GiftCard)
├── BudgetBadge.tsx           (NEW — price vs budget indicator)
├── PersonalizationWarning.tsx (NEW — generic warning if score <70)
src/components/ui/
└── confidence-badge.tsx      (MODIFY — aria-label, label text update)
```

### 6.2 StepResults.tsx — Changes

```typescript
// Current props (StepResultsProps) — add:
interface StepResultsProps {
  // ... existing ...
  viewOnly?: boolean;  // NEW — for gift history read-only mode
}

// Changes:
// 1. Pass originalIndex (not sorted index) to GiftCard.onTrackClick
// 2. Add "Start Over" button in the regenerate section
// 3. Compute selectedGiftBuyLink and pass to SuccessState
// 4. Add PostHog event on results render
// 5. Add sticky header behavior (CSS: position sticky top-0 for progress bar)
// 6. Add slow-network warning after 15s
```

**Sticky progress bar:** The `StepProgress` component in `StepProgress.tsx` needs `className="sticky top-0 z-10 bg-background"` on its wrapper.

**Updated SuccessState signature:**
```typescript
function SuccessState({
  selectedGiftName,
  confidenceScore,
  recipientName,
  recipientId,
  sessionId,
  occasion,
  occasionDate,
  buyUrl,       // NEW
  storeName,    // NEW
}: { ... buyUrl?: string; storeName?: string; }) {
```

### 6.3 GiftCard.tsx — Changes

```typescript
interface GiftCardProps {
  // ... existing props ...
  budgetMin: number;    // NEW — for BudgetBadge
  budgetMax: number;    // NEW — for BudgetBadge
  currency: string;     // existing
  viewOnly?: boolean;   // NEW
}

// Change order of sections within the card:
// 1. Header (name + confidence badge)           — no change
// 2. Price/category badges                      — no change
// 3. "Why it works" section label + paragraph   — ADD section label
// 4. PersonalizationWarning (if score present)  — NEW (conditional)
// 5. AvoidCallout (inline, not collapsed)       — CHANGE: remove collapsible
// 6. BudgetBadge                                — NEW
// 7. Signal Check preview / full               — MODIFY (preview for free users)
// 8. ProductLinks                               — MODIFY (pass new props)
// 9. "I'll Pick This One" button                — MODIFY (hidden if viewOnly)
```

**Entry animation (new):**
```typescript
// Add staggered entry animation to each card
<motion.div
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{
    delay: index * 0.1,  // 0ms, 100ms, 200ms
    duration: 0.35,
    ease: "easeOut"
  }}
>
  <Card ...>
```

**Note:** `index` here is the sorted index (0 = top pick), not `originalIndex`. The stagger should match visual position, not AI generation order.

### 6.4 SignalCheck.tsx — Changes

**Free user path (new preview logic):**

```typescript
// At the top of the component, before the existing canUseSignalCheck check:
const previewText = gift.signal_interpretation?.trim() ?? "";
const previewFirst120 = previewText.slice(0, 120);
const previewBlurred = previewText.slice(80, 120);  // last 40 of the 120 are blurred
const previewVisible = previewText.slice(0, 80);

if (!canUseSignalCheck && !latestCheck) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
          Signal Check
        </div>
        {previewText ? (
          <div 
            className="relative rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground cursor-pointer"
            onClick={() => setUpgradeOpen(true)}
            role="button"
            aria-label="Preview of Signal Check analysis. Upgrade to Confident to unlock."
          >
            <p>
              <span>"{previewVisible}</span>
              <span className="blur-[3px] select-none" aria-hidden="true">{previewBlurred}</span>
              <span>..."</span>
            </p>
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-muted/40 to-transparent rounded-b-xl" aria-hidden="true" />
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setUpgradeOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" strokeWidth={1.5} />
            Unlock full Signal Check
          </span>
          Confident 🎯
        </Button>
      </div>
      <UpgradeModal ... />
    </>
  );
}
```

**Paid user path (minor change):**

For paid users who haven't run the check yet, show `signal_interpretation` as a "preview" above the "Show Signal Check" button:

```typescript
// In the !latestCheck section for paid users:
{!latestCheck && previewText ? (
  <div className="rounded-xl border border-border/40 bg-muted/10 p-3 text-sm text-muted-foreground">
    <p className="italic">"{previewText.slice(0, 200)}..."</p>
    <p className="mt-1 text-xs">Full analysis uses 0.5 credits</p>
  </div>
) : null}
```

### 6.5 AvoidCallout.tsx — New Component

```typescript
// src/components/gift-flow/AvoidCallout.tsx
import { AlertTriangle } from "lucide-react";

interface AvoidCalloutProps {
  text: string;
}

export function AvoidCallout({ text }: AvoidCalloutProps) {
  return (
    <div
      role="note"
      aria-label="Caution about this gift choice"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
      style={{ borderLeftWidth: "4px", borderLeftColor: "#F59E0B" }}
    >
      <AlertTriangle 
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" 
        strokeWidth={1.5} 
        aria-hidden="true"
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
          What to avoid
        </p>
        <p className="text-sm text-amber-800">{text}</p>
      </div>
    </div>
  );
}
```

### 6.6 BudgetBadge.tsx — New Component

```typescript
// src/components/gift-flow/BudgetBadge.tsx
import { cn } from "@/lib/utils";

interface BudgetBadgeProps {
  priceAnchor: number;
  budgetMin: number;
  budgetMax: number;
  currency: string;
}

export function BudgetBadge({ priceAnchor, budgetMin, budgetMax, currency }: BudgetBadgeProps) {
  const within = priceAnchor >= budgetMin && priceAnchor <= budgetMax;
  const slightlyOver = !within && priceAnchor <= budgetMax * 1.2;

  const indicator = within ? "✓" : slightlyOver ? "⚠" : "✗";
  const color = within 
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : slightlyOver 
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm", color)}>
      <span>💰 ~${priceAnchor}</span>
      <span className="text-muted-foreground">·</span>
      <span>Budget ${budgetMin}–{budgetMax}</span>
      <span className="font-semibold">{indicator}</span>
    </div>
  );
}
```

### 6.7 SelectionModal (within GiftCard.tsx) — Changes

```typescript
// 1. Add ConfidenceBadge to modal header
// 2. Fix reminder checkbox default
// 3. Increase note max to 200 chars

// Current:
const [createReminder, setCreateReminder] = useState(true);
// Fix:
const [createReminder, setCreateReminder] = useState(Boolean(occasionDate));

// Current:
onChange={(e) => setSelectionNote(e.target.value.slice(0, 150))}
// Fix:
onChange={(e) => setSelectionNote(e.target.value.slice(0, 200))}

// Current:
<div className="text-right text-xs text-muted-foreground">{selectionNote.length}/150</div>
// Fix:
<div className="text-right text-xs text-muted-foreground">{selectionNote.length}/200</div>

// Add ConfidenceBadge to DialogHeader area:
<DialogHeader>
  <div className="flex items-center gap-3 mb-2">
    <ConfidenceBadge score={gift.confidence_score} size="lg" animate={false} />
    <div>
      <DialogTitle>{gift.name}</DialogTitle>
      <DialogDescription>
        for {recipient.name}'s {occasion.replace(/_/g, " ")}
      </DialogDescription>
    </div>
  </div>
</DialogHeader>
```

---

## Section 7: Integration Points

### 7.1 Gift Flow Orchestration → Results

**Direction:** Parent passes data down  
**Interface:** `StepResultsProps` in `StepResults.tsx`  
**Data passed:** `giftSession` (the full hook return), `selectedRecipient`, `selectedOccasion`, `currency`, `recipientCountry`, `userPlan`, `onRegenerateParams`, `onCreditsChanged`  
**Trigger:** `GiftFlowStepper.tsx` renders `StepResults` at step 5  
**Fallback:** If session data is missing, `StepResults` shows ERROR state  

### 7.2 Gift Recommendation Engine → AI Response

**Direction:** Edge Function returns recommendations  
**Interface:** `generate-gifts` response shape (see Section 5.2)  
**Trigger:** `giftSession.generateGifts(params)` call in Step 5 mount effect (inside `GiftFlowStepper`)  
**Fallback:** 502 → ERROR state with retry. 429 → RATE_LIMITED state. 402 → NO_CREDITS state.  

### 7.3 Product Linking → Buy Links

**Direction:** Edge Function enriches recommendations  
**Interface:** `search-products` response (see Section 5.2)  
**Trigger:** After AI response arrives, `searchProducts()` called in parallel  
**Fallback:** If `search-products` fails, show fallback "Search on Amazon" card. Never block results render.  

### 7.4 Signal Check → Relationship Analysis

**Direction:** On-demand call per recommendation (paid users only)  
**Interface:** `signal-check` Edge Function (see Section 5.2)  
**Trigger:** User clicks "Show Signal Check" button on a card  
**Fallback:** If call fails, `toast.error()` + retry button replaces the "Show Signal Check" button  
**Plan gate:** Server-side — `ALLOWED_PLANS = ["confident", "gifting-pro"]`  

### 7.5 Credits & Plans ↔ Results Screen

**Direction:** Bidirectional  
**Read:** `usePlanLimits()` used in `StepResults` for regen quota, store limits, Signal Check gate  
**Write:** `onCreditsChanged()` callback called after Signal Check to refresh credit balance in parent  
**Trigger:** Every plan-gated feature check on this screen  
**Fallback:** If plan can't be read, default to `spark` limits  

### 7.6 Recipient Memory → Personalization Badge

**Direction:** Past sessions inform AI (handled by Edge Function); count shown in UI  
**Interface:** `_meta.past_gifts_count` is NOT currently in the API response. It must be added.  

**Required Edge Function change (minor):**
```typescript
// In generate-gifts response, add:
return jsonResponse({
  ...parsed,
  past_gifts_count: pastGiftsUsed,    // NEW: pass through if available
  memory_used: pastGiftsUsed > 0,     // NEW
  _meta: { ... }
});
```

Until that change is made, the memory badge can be omitted from V1. The `🧠 Personalized using N past gifts` line should only show if `past_gifts_count > 0`.

**V1 workaround:** Check `giftSession.recommendations` — if `warningMessage` is absent and session has a `recipient_id`, we can query `gift_sessions WHERE recipient_id = X AND status = 'completed' AND id != current` count and show it. But this adds a query. Simpler: skip the memory badge in V1, add when Edge Function exposes `past_gifts_count`.

### 7.7 Post-Gift Feedback → Reminders

**Direction:** Selection creates a reminder  
**Interface:** `feedback_reminders` table, `upsertFeedbackReminder()` in `giftSessionShared.ts`  
**Trigger:** `selectGift()` called with `options.createReminder = true`  
**Fallback:** If reminder insert fails, selection still completes (the reminder failure is silenced)  

### 7.8 Gift History → View-Only Mode

**Direction:** Gift History renders this screen in read-only mode  
**Interface:** `viewOnly?: boolean` prop on `StepResults`  
**Data:** Gift History fetches the session's `ai_response` JSONB and hydrates state via `hydrateSession()`  
**Fallback:** If `ai_response` is null on an old session, show "Results unavailable for this session"  

### 7.9 Analytics → PostHog

**Direction:** One-way, results fires events  
**Interface:** `posthog.capture(eventName, properties)`  
**Trigger:** See Section 5.4 for full event list  
**Fallback:** PostHog failures are silenced — never block the UI for analytics  

---

## Section 8: Edge Cases & Error States

### 8.1 Generation Error (Retry-able)

```
┌─────────────────────────────────────────────────┐
│                 🤔                               │
│                                                 │
│   AI had trouble with this one                  │
│                                                 │
│   Your credit was returned.                     │
│   Please try again.                             │
│                                                 │
│         [ Try Again ]                           │
│                                                 │
│   If this keeps happening, contact support.     │
└─────────────────────────────────────────────────┘
```

**Implementation:** This state already exists in `ErrorState` component. Ensure `refundIssued` is reflected in the message.

### 8.2 No Credits (NoCreditGate)

Currently implemented. The pricing table renders in-context. Keep as-is.

### 8.3 Rate Limited

```
┌─────────────────────────────────────────────────┐
│                 ⏰                               │
│   Too many requests                             │
│   Please wait a minute and try again.          │
│                                                 │
│         [ Try Again ]                           │
└─────────────────────────────────────────────────┘
```

Already implemented. Keep.

### 8.4 All Low Confidence

If all 3 `confidence_score` values are <75, show a banner:

```
┌─────────────────────────────────────────────────┐
│  ⚠  These are decent starting points, but the  │
│     AI wasn't highly confident. Try adding       │
│     more context about your recipient, or       │
│     regenerate for fresh ideas.                 │
└─────────────────────────────────────────────────┘
```

Threshold: all 3 scores <75 (not <60, since 60–74 = "Good fit" and is acceptable).

### 8.5 Buy Links Unavailable

When `products.length === 0` and `isSearchingProducts === false`:

```
┌─────────────────────────────────────────────────┐
│  We couldn't find specific products right now.  │
│  [Search on Amazon →]                           │
└─────────────────────────────────────────────────┘
```

Construct search URL: `https://www.amazon.com/s?k=${encodeURIComponent(gift.search_keywords[0])}` (use `amazon.in` for IN country, `amazon.co.uk` for GB, etc.).

### 8.6 Signal Check Unavailable (Paid User)

When `signalMutation.isError`:

```tsx
// Replace the "Show Signal Check" button with:
<div className="space-y-2">
  <p className="text-sm text-destructive">Signal Check failed. Please try again.</p>
  <Button variant="outline" size="sm" onClick={runInitialCheck}>
    Retry Signal Check
  </Button>
</div>
```

### 8.7 Slow Network (>15 seconds)

```tsx
// In StepResults.tsx, inside LoadingState section:
{showSlowWarning && (
  <div className="text-center text-sm text-muted-foreground mt-4">
    <p>Taking longer than usual…</p>
    <p className="text-xs mt-1">Your credit will be returned if this fails.</p>
  </div>
)}
```

Show after 15 seconds of PENDING state. No cancel button in V1 (aborting mid-call is complex and the 60s timeout handles it).

### 8.8 Regen at Limit

When `!planLimits.canRegenerate(giftSession.regenerationCount)`:
- Button changes to "Regenerate (limit reached)" state
- Click → UpgradeModal with `highlightPlan = planLimits.getUpgradePlan("more_regenerations")`
- Already implemented — just update button label text

### 8.9 Session Expired / Auth Lost

If Supabase auth token expires while on the results screen:
- Any authenticated operation (regen, signal check, select) will fail with 401
- Error message: "Your session expired. Please sign in again."
- Already handled via `normalizeGiftErrorType("AUTH_REQUIRED")`

### 8.10 View-Only Mode (from Gift History)

```
┌─────────────────────────────────────────────────┐
│  Past session — View Only                        │
│                                                 │
│  [Card 1 — no "Pick This One" button]           │
│  [Card 2 — no "Pick This One" button]           │
│  [Card 3 — no "Pick This One" button]           │
│                                                 │
│  [No regenerate section]                        │
└─────────────────────────────────────────────────┘
```

The `viewOnly` prop is checked in `StepResults` and `GiftCard`:
- `GiftCard`: hide "I'll Pick This One" when `viewOnly`
- `StepResults`: hide the regenerate/start-over section when `viewOnly`
- `SignalCheck`: disable credit charges when `viewOnly` (show full analysis if it was previously run and is in session data, but don't allow new runs)

---

## Section 9: Acceptance Criteria

### P0 — Must Have

- [ ] 3 recommendation cards render from `giftSession.recommendations` in confidence-descending order
- [ ] Top Pick card (index 0 after sort) has `border-amber-300 shadow-glow-amber` and "Best Match" badge
- [ ] Cards 2 and 3 render with standard border styling
- [ ] ConfidenceBadge renders on every card with correct color: amber (≥90), indigo (75-89), neutral (60-74)
- [ ] ConfidenceBadge count-up animation plays on card mount (800ms, respects prefers-reduced-motion)
- [ ] ConfidenceBadge aria-label includes label text: `{score} percent confidence — {label}`
- [ ] "Why it works" section has a "Why it works" label + horizontal rule above the paragraph
- [ ] "Why it works" paragraph renders at `text-base leading-relaxed` (not text-sm)
- [ ] "Why it works" shows full paragraph, no truncation, no "read more" toggle
- [ ] "What to avoid" callout is inline (not collapsed), with amber-50 bg, amber-400 left border
- [ ] "What to avoid" is hidden (not empty callout) when `what_not_to_do` is null or empty string
- [ ] Signal Check shows first 120 chars of `signal_interpretation` as blurred preview for Spark/Thoughtful users
- [ ] Signal Check preview clicking opens UpgradeModal with `highlightPlan="confident"`
- [ ] Signal Check full analysis renders for Confident/Gifting Pro (existing functionality preserved)
- [ ] BudgetBadge shows price anchor vs budget range with ✓/⚠/✗ indicator
- [ ] Buy links render in horizontal scroll container with `snap-x snap-mandatory`
- [ ] Locked stores show "Upgrade to [Plan]" with correct plan for each tier
- [ ] "+N more stores on Confident" tease text shown when locked stores exist
- [ ] Buy link click calls `supabase.from("product_clicks").insert(...)` with enriched schema
- [ ] Buy link click opens URL in new tab with `noopener,noreferrer`
- [ ] "I'll Pick This One" opens Dialog (selection modal) with ConfidenceBadge + note + reminder checkbox
- [ ] Reminder checkbox defaults to `true` when `occasionDate` is set, `false` when no date
- [ ] Note field max is 200 characters (not 150)
- [ ] "Yes, This One" updates `gift_sessions` (selected_gift_name, selected_gift_index, selected_gift_note, status='completed')
- [ ] "Yes, This One" upserts `feedback_reminders` when checkbox is checked
- [ ] Success screen shows "Buy on [Store]" primary CTA using first available product link
- [ ] Regenerate button shows quota in format: "Regenerate (N/M free)"
- [ ] Regenerate at limit shows "Regenerate (limit reached)" → UpgradeModal
- [ ] "Start Over" button navigates to `/gift-flow?recipientId={id}`
- [ ] Error states (AI_ERROR, AI_PARSE_ERROR, RATE_LIMITED) render correctly with retry
- [ ] Error state that includes a refund shows "Your credit was returned" message
- [ ] Mobile layout: single column, cards full width, horizontal buy-link scroll with snap
- [ ] `viewOnly` mode hides selection buttons and regenerate section
- [ ] LoadingState node-by-node progress tracker renders (keep existing, no change)
- [ ] "Slow network" warning appears after 15s of PENDING state
- [ ] 10 core PostHog analytics events fire (results_viewed, buy_link_clicked, gift_selected, regenerate_clicked, regenerate_limit_hit, start_over_clicked, signal_check_preview_clicked, signal_check_run, gift_selection_cancelled, results_abandoned)

### P1 — Should Have

- [ ] Cards stagger-animate in with 100ms delay per index (0ms, 100ms, 200ms)
- [ ] Card entry animation disabled when `prefers-reduced-motion` is true
- [ ] ConfidenceBadge Tooltip shows explanation text on hover (desktop only)
- [ ] ProductLinks wrapped in `React.memo` for performance
- [ ] GiftCard wrapped in `React.memo` for performance
- [ ] PersonalizationWarning shows if `personalization_score` field < 70 (future V2 engine data)
- [ ] "All low confidence" banner shows if all 3 scores < 75
- [ ] `past_gifts_count` memory badge in results header (requires Edge Function change)
- [ ] AI meta footer shows in dev mode with provider + latency + attempt
- [ ] "Find Another Gift" from success screen preserves `recipientId` in navigation
- [ ] Signal interpretation preview shown above "Show Signal Check" button for paid users who haven't run it yet
- [ ] `recommendation_index` and `recommendation_confidence` included in product_clicks inserts
- [ ] Buy links fallback "Search on Amazon" card when products array is empty
- [ ] All 15 PostHog analytics events fire (full list from Section 5.4)

### P2 — Nice to Have

- [ ] Compare mode: toggle 2 of 3 recommendations side-by-side (V2)
- [ ] Save recommendation to wishlist (V2)
- [ ] Share results via link (V2)
- [ ] PDF export of results (V2)
- [ ] Undo selection within 5 minutes (V2, via Gift History)
- [ ] Print-friendly mode (V2)
- [ ] Voice-assisted reading of "why it works" (V2)

---

## Section 10: Open Questions & Decisions Needed

### Q1: Signal Check preview — use `signal_interpretation` or generate separately?

**Context:** `signal_interpretation` is returned by `generate-gifts` for every recommendation. Using it as a free preview costs nothing. The alternative is generating a separate "teaser" analysis.

**Decision:** Use `signal_interpretation`. It's already available, costs nothing, and is the same content that Signal Check elaborates on. Showing the first 120 chars creates genuine curiosity without additional latency.

**Action needed:** None (implement as specified).

### Q2: Should ConfidenceBadge label be "High confidence" or "Excellent match"?

**Context:** The prompt spec says "High confidence." The existing component says "Excellent match." "Excellent match" is warmer, user-centric language. "High confidence" is the technical GiftMind vocabulary.

**Decision:** Keep "Excellent match" for ≥90, "Strong match" for 75-89. Change only "Good match" → "Good fit" for 60-74. The product vocabulary (confidence, signal) is communicated by the number; the label should interpret it humanly.

**Action needed:** Update `label` variable in `confidence-badge.tsx` for the 60-74 bucket only.

### Q3: Should Signal Check run automatically for Confident+ users on page load?

**Context:** Auto-run would give paid users instant Signal Check on all 3 recommendations without clicking. But it would also charge 1.5 credits (3 × 0.5) automatically every time they see results — even if they don't care about Signal Check for this gift.

**Decision:** On-demand only. Show the `signal_interpretation` preview (free, no click needed) and let users trigger full analysis if they want it. Never auto-charge credits.

**Action needed:** None (current on-demand behavior is correct).

### Q4: Regeneration — replace or accumulate?

**Context:** Current behavior replaces the previous 3 recommendations. Alternative: keep previous recommendations and add new ones as "Round 2" below, allowing comparison.

**Decision:** Replace. Accumulation adds decision paralysis. The user asked for 3 ideas; showing 6 is not twice as good. If they want to compare, they can remember the names from Round 1.

**Action needed:** None (current replace behavior is correct).

### Q5: Success screen — modal or full page?

**Context:** Currently SuccessState replaces the results list entirely (full page). Alternative: a modal overlay so users can still see the results list behind.

**Decision:** Keep full page. Selection is a major moment — it deserves a scene change. Users who want to see the results again can use Gift History (View Only mode).

**Action needed:** None (current full-page success behavior is correct).

### Q6: What if product images fail to load?

**Context:** `ProductLinks` shows product images in `<img>` tags with `loading="lazy"`. If the CDN URL is broken, the image breaks.

**Decision:** Add `onError` handler that hides the broken image div:
```tsx
<img
  onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }}
  ...
/>
```

**Action needed:** Add `onError` to the `<img>` in `ProductLinks.tsx`.

### Q7: How to handle the memory badge without Edge Function changes?

**Context:** Showing "Personalized using 3 past gifts" requires `past_gifts_count` from the Edge Function, which isn't currently returned.

**Decision:** Skip the memory badge in V1. Add it when the Edge Function is updated to expose `past_gifts_count`. Do not add a client-side query to count past sessions — it's an extra round trip for a cosmetic detail.

**Action needed:** Document as a V1.1 follow-up requiring Edge Function change.

### Q8: Should locked stores show estimated pricing?

**Context:** Locked stores currently show just the store name + lock icon. Showing a price estimate (even approximate) could increase upgrade motivation: "Flipkart has it for $38 — unlock to buy there."

**Decision:** V2. We don't have pricing data for locked stores (the product matching only runs for accessible stores). Faking a price estimate would be misleading.

**Action needed:** None.

### Q9: What happens to gift_sessions.product_results after regeneration?

**Context:** After regen, `productResults` in React state is replaced. But `gift_sessions.product_results` in the DB is also updated (line ~350 in `useGiftSession.ts`). The old buy links data is overwritten in the DB.

**Decision:** Acceptable. Old product results have no archival value. The regenerated session's product results are the relevant ones.

**Action needed:** None.

### Q10: How should the results screen behave if the user is offline?

**Context:** React state persists in memory while the tab is open. If user goes offline after results load, buy links and Signal Check won't work, but the recommendations themselves are still readable.

**Decision:** No offline-first behavior in V1. If a request fails due to network, show the appropriate error. The browser's native "You are offline" behavior handles the user's expectations.

**Action needed:** None.

---

## Section 11: Rollout & Migration

### 11.1 Feature Flag

Add `VITE_RESULTS_V2=true` to `.env` files to enable the new results experience. When `false` (default in production initially), the old `StepResults.tsx` behavior is preserved.

**Implementation:**
```typescript
// At the top of StepResults.tsx:
const isResultsV2 = import.meta.env.VITE_RESULTS_V2 === 'true';
```

However, since most changes are additive (new components, not rewrites), the flag is primarily for:
1. The inline `AvoidCallout` (vs. collapsible)
2. The Signal Check preview for free users
3. The stagger animation on cards

Changes that are pure bug fixes (empty `what_not_to_do`, aria-label, note max 200) should be deployed without a flag.

### 11.2 Database Migration

Apply `add_product_click_enriched_fields.sql` migration to add new columns to `product_clicks`. This migration:
- Is backward-compatible (all new columns are nullable or have defaults)
- Does not break existing inserts (new columns not required)
- Adds indexes for analytics queries

Apply BEFORE deploying the frontend changes that insert the new fields.

### 11.3 Rollout Phases

**Week 1 — Bug fixes (ship immediately, no flag):**
- Empty `what_not_to_do` fix (trim check)
- ConfidenceBadge aria-label update
- Note field max → 200 chars
- ProductLinks image `onError` handler
- Reminder checkbox default based on `occasionDate`
- Database migration (product_clicks schema)

**Week 2 — Structural UX changes (behind VITE_RESULTS_V2=true, 10% traffic):**
- Inline `AvoidCallout` (not collapsed)
- Signal Check preview for free users
- BudgetBadge above buy links
- Card stagger animation
- "Start Over" button
- Updated regenerate button label format
- Success screen with "Buy on [Store]" CTA
- "Why it works" section label + typography change
- Enriched `product_clicks` inserts

**Week 3 — Full rollout (100% traffic):**
- If Week 2 shows gift_selection_rate improvement: enable VITE_RESULTS_V2=true globally
- Success criteria: gift_selection_rate ≥25% (vs ~15% current)
- Rollback: set VITE_RESULTS_V2=false (no code rollback needed)

### 11.4 Backward Compatibility

Old gift sessions (with `ai_response` not containing `signal_interpretation`): The preview will simply be empty (`previewText = ""`). The lock button renders without preview text — this is acceptable. The `signal_interpretation` field has been in the AI response since early versions; most sessions will have it.

Old sessions viewed in history (view-only mode): All fields render from `ai_response` JSONB. If a field is missing, its component is conditionally hidden (already the pattern in `GiftCard`).

---

## Section 12: Appendix

### 12.1 Files Needing Modification

| File | Change Type | Scope |
|---|---|---|
| `src/components/gift-flow/StepResults.tsx` | Modify | Add viewOnly, Start Over, SuccessState buy CTA, slow-network warning, analytics |
| `src/components/gift-flow/GiftCard.tsx` | Modify | Inline AvoidCallout, BudgetBadge, section header, modal fixes, viewOnly, stagger |
| `src/components/gift-flow/SignalCheck.tsx` | Modify | Free-user preview using signal_interpretation |
| `src/components/gift-flow/ProductLinks.tsx` | Modify | snap-x, image onError, "+N more stores" tease, fallback empty state |
| `src/components/ui/confidence-badge.tsx` | Modify | aria-label fix, "Good fit" label change, Tooltip wrapper |
| `src/hooks/useGiftSession.ts` | Modify | trackProductClick enriched fields, recipientId + index + confidence |
| `src/hooks/giftSessionTypes.ts` | Modify | Add signal_interpretation, personalization_score to GiftRecommendation |
| `src/components/gift-flow/AvoidCallout.tsx` | **Create new** | Inline avoid callout component |
| `src/components/gift-flow/BudgetBadge.tsx` | **Create new** | Price vs budget indicator |
| `src/components/gift-flow/PersonalizationWarning.tsx` | **Create new** | Generic warning banner (V2 engine data) |
| `supabase/migrations/add_product_click_enriched_fields.sql` | **Create new** | DB migration |

### 12.2 Estimated Engineering Effort

| Phase | Tasks | Effort |
|---|---|---|
| Bug fixes (Week 1) | 7 fixes, 1 migration | 1–2 days |
| Structural UX (Week 2) | 9 component changes, 3 new components, analytics | 3–4 days |
| Testing + QA | Manual testing across plans and countries | 1 day |
| **Total** | | **5–7 days** |

### 12.3 Competitor Analysis

| Competitor | Confidence Score | Why It Works | Signal Analysis | Buy Links | Avoid Note |
|---|---|---|---|---|---|
| GiftAdvisor | ✗ | ✗ | ✗ | ✓ (generic) | ✗ |
| Giftly | ✗ | ✗ | ✗ | ✓ (affiliate) | ✗ |
| ChatGPT | ✗ | Partial (generic) | ✗ | ✗ | ✗ |
| **GiftMind** | ✓ | ✓ (specific) | ✓ (paid) | ✓ (geo+plan) | ✓ |

### 12.4 Design References

- **Confidence badge visual:** Inspired by Linear's priority indicators — color + number + label, never just color alone
- **Why it works typography:** Match the reading rhythm of New York Times article body text (Inter, 16px, 1.6 line-height)
- **Card hierarchy (Top Pick):** Apple's "Best in class" product callouts — subtle amber border, no heavy shadow
- **Signal Check preview blur:** Arc browser's "instant preview" pattern — show enough to understand the format, blur enough to create want

### 12.5 Glossary

| Term | Definition |
|---|---|
| Confidence score | AI's self-reported certainty that a gift matches the recipient (0-100) |
| Signal interpretation | What the gift communicates about the gifter-recipient relationship |
| Signal Check | The on-demand premium analysis of a gift's social signal (Confident+ feature) |
| Buy link | A geo-targeted, affiliate-tagged URL to purchase a recommended gift |
| Regen / Regeneration | Replacing the current 3 recommendations with 3 new ones (same inputs, no credit charge) |
| Top Pick | The highest-confidence recommendation (index 0 after sorting) |
| Plan gate | A feature locked behind a higher subscription tier |
| View-only mode | The results screen state when accessed from Gift History (no selection/regen) |
| Personalization score | Internal metric (0-100) measuring how specifically tailored a recommendation is (V2 engine) |

---

## Summary: Current Bugs This PRD Fixes

1. **Empty "What to avoid" callout** — `what_not_to_do: ""` renders a blank callout. Fix: trim + null check.
2. **Signal Check lock is opaque** — Free users see only a lock button with no preview. Fix: show first 120 chars of `signal_interpretation` as a blurred preview.
3. **No "Buy" CTA on success screen** — After selecting a gift, there's no direct path to purchase. Fix: add "Buy on [Store]" primary button using the first product link for the selected gift.
4. **Regenerate button doesn't show quota inline** — Count appears as a small muted `count/limit` after the label. Fix: integrate into button label as "Regenerate (N/M free)".
5. **No "Start Over" option** — Users who want to change inputs must use browser back. Fix: add "Start Over" button that navigates to `/gift-flow?recipientId={id}`.
6. **Reminder checkbox always defaults to checked** — Even when no occasion date is set. Fix: default to `Boolean(occasionDate)`.
7. **Note max is 150 chars** — PRD specifies 200. Fix: change `slice(0, 150)` and `maxLength={150}` to 200.
8. **ConfidenceBadge aria-label incomplete** — Doesn't announce the label text. Fix: include label in aria-label.
9. **"Gift caution" is collapsed** — Requires a click to see the avoid note. Fix: render inline as `AvoidCallout`.
10. **product_clicks schema missing analytics fields** — recommendation_index, confidence, recipient_id not tracked. Fix: schema migration + insert update.
