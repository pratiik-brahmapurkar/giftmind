# PRD 17 — Chat-First Gift Finder (RAG-Powered Conversational Discovery)

**Feature name (internal):** Chat-First Gift Finder
**Feature name (user-facing):** Ask GiftMind / Gift Chat
**Owner:** Product / Engineering
**Version:** 1.0
**Status:** Draft — Ready for review
**Date:** 2026-05-01
**Author:** Senior Product Manager
**Related PRDs:** 03 (Gift Flow Orchestration), 04 (Recommendation Results Experience), 05 (Product Linking & Affiliate), 06 (Signal Check), 08 (Credits & Wallet), 09 (Plans, Limits, Paywalls), 12 (Analytics & Telemetry), 13 (Platform Settings & Provider Routing), 15 (Blog CMS), 16 (Media Library)

---

## 1. Executive Summary

GiftMind today funnels every visitor through a **5-step questionnaire** before they see a single gift idea. Even motivated users must complete Landing → Signup → Dashboard → My People → Add Person → Steps 1–5 — roughly **8 deliberate actions** — before reaching value. This depresses landing-page conversion and disproportionately hurts top-of-funnel curiosity traffic ("I just want a quick idea for my mum").

**Chat-First Gift Finder** introduces a second, parallel discovery path: a RAG-powered conversational widget embedded on the Landing Page and inside the authenticated Dashboard. Visitors can type "I need a gift for my dad turning 60, he loves fishing, ~$80" and receive **inline, ranked gift recommendations within a single chat turn**, no signup required for the first attempt.

The chat **augments**, never replaces, the existing questionnaire flow — both paths produce the same `gift_sessions` shape, the same `GiftCard` results, and feed the same downstream features (Signal Check, ProductLinks, Save-to-Person, Reminders).

The MVP ships in **6–8 weeks** with a tightly scoped slice: one free guest turn, signup gate, single-recipient context, no recipient memory edits, RAG over a curated corpus (gift guides, blog posts, marketplace categories, occasion playbooks).

---

## 2. Problem Statement

### 2.1 Quantified Pain (from PRD 12 + PRD 03 audit)

- **Drop-off in the wizard is concentrated at Steps 1–2.** Many users never reach Step 5 results.
- **Pre-signup visitors cannot experience product value at all.** The wizard requires `useGiftSession`, which requires an authenticated user and a `recipients` row.
- **Repeat users with a clear ask** ("birthday, 12-year-old niece, $50, into Minecraft") are forced through the same 4-screen wizard every time.
- **Blog & SEO traffic is a dead end.** Blog readers (PRD 15) have no in-context way to act on a gift guide — they bounce or abandon at the signup wall.

### 2.2 Why Now

1. PRD 13 has stabilised the multi-provider AI chain (Anthropic → Gemini → Groq), making cheap free-tier inference viable.
2. PRD 08 introduced a real credits wallet that can be extended to **guest sessions**.
3. PRD 11 catalog (`marketplace_products`) is mature enough to power retrieval with non-trivial recall.
4. PRD 12 telemetry can measure the experiment cleanly against the wizard baseline.

### 2.3 Hypothesis

> If we let visitors describe their gift problem in one sentence and see results within one chat turn, **landing-to-first-result conversion will rise 3–5×** and **guest-to-signup conversion** will rise materially because the value moment now precedes the gate.

---

## 3. Goals and Non-Goals

### 3.1 Goals (MVP)

| # | Goal | Measure |
|---|------|---------|
| G1 | Reduce time-to-first-result for new visitors from ~3–5 min wizard to <60s | TTFV p50 |
| G2 | Allow exactly **1 free chat session for guests** before signup gate | Guest credit ledger |
| G3 | Preserve existing questionnaire flow with **zero feature regression** | E2E parity test |
| G4 | Embed chat on Landing + Dashboard with consistent UX | UX QA sign-off |
| G5 | Ship a RAG pipeline retrieving from blog posts, gift guides, marketplace catalog, and (when authenticated) recipient profiles | Retrieval recall@5 ≥ 0.7 on eval set |
| G6 | Recognise logged-in users on the Landing Page and skip the guest gate | Auth-aware widget |

### 3.2 Non-Goals (MVP)

- Replacing or deprioritising the wizard.
- Multi-recipient or group-gift conversations in a single thread.
- Voice input/output.
- Cross-session conversational memory (aside from logged-in user's existing recipients).
- Chat-driven editing of recipient profiles (read-only access in MVP; write in P1).
- Native mobile chat (web-responsive only in MVP).
- Embedding chat inside the existing wizard steps.
- Agentic checkout / completing the purchase inside chat.

---

## 4. Target Users & Personas

| Persona | Description | Primary need from Chat |
|---------|-------------|------------------------|
| **"Curious Visitor" Vidya** | Lands from blog/SEO/ads, no account. Wants a quick idea, low commitment. | Try product instantly without signup. |
| **"Last-Minute" Liam** | Logged-in user, occasion is in 2 days, doesn't want to re-fill the wizard. | Type one sentence, get a result, click buy. |
| **"Repeat Gifter" Rhea** | Has 6 saved recipients. Returns every quarter. | "What should I get Mum for Mother's Day under $60?" — pull recipient context automatically. |
| **"Skeptical Shopper" Sam** | Wants to validate quality before signing up. | Use the free turn to evaluate recommendation quality. |
| **"Blog Reader" Bea** | Reading a gift guide ("25 gifts for new dads"). | Refine the guide conversationally without leaving the page. |

---

## 5. Current Flow Analysis & Friction Points

### 5.1 Current Path (from PRD 03)

```
Landing
  └─ "Get Started" CTA
      └─ Signup / Login                          ← Gate #1: account creation
          └─ Dashboard                            ← Cognitive load: pick action
              └─ "Find a Gift"
                  └─ My People                    ← Gate #2: must select/create recipient
                      └─ Add Person form          ← 6+ fields
                          └─ Step 1: Recipient    ← Wizard begins
                              └─ Step 2: Occasion
                                  └─ Step 3: Budget
                                      └─ Step 4: Context
                                          └─ Step 5: Results
```

### 5.2 Friction Inventory

| # | Friction | Owner | Severity |
|---|----------|-------|----------|
| F1 | Forced signup before any value | Auth | High |
| F2 | Recipient creation required even for one-off gifts | Recipients | High |
| F3 | Wizard has 4 mandatory input screens; no "I'll type it" shortcut | Gift Flow | High |
| F4 | No way to ask follow-ups *after* results without re-running flow | Results | Medium |
| F5 | Blog reader must abandon article to start the wizard | Blog | Medium |
| F6 | Mobile keyboard/UX on Step 4 (free-text context) is identical to a chat anyway | UX | Low |

The chat-first path collapses F1–F5 by replacing the gate-then-form pattern with **describe-then-refine**.

---

## 6. Proposed Chat-First Flow

### 6.1 Happy Path (Guest)

```
Landing
  └─ Chat Widget (bottom-right, expandable)
      └─ Greeting: "Hey 👋 Who are you gifting for?"
          └─ User: "My dad's 60th birthday, he loves fishing, around $80"
              └─ [Bot retrieves: gift guides + marketplace + occasion data]
                  └─ Bot: 1–2 clarifying questions OR direct results
                      └─ Inline Gift Cards (3 results) within chat bubble
                          └─ "Want to see more or save these? Sign up free"
                              └─ Signup CTA
```

### 6.2 Happy Path (Logged-In, from Dashboard)

```
Dashboard
  └─ "Ask GiftMind" entry (prominent card + persistent FAB)
      └─ Chat opens with: "Welcome back, {name}. Who's this gift for?"
          └─ Suggested chips: existing recipients (e.g., "Mum", "Brother Sam")
              └─ User picks "Mum" → bot pre-loads recipient profile
                  └─ "Mother's Day in 12 days, ~$60 like last time?"
                      └─ Inline results, full feature set
                          └─ Save / Signal Check / Buy
```

### 6.3 State Machine (high-level)

| State | Trigger to next | Next state |
|-------|-----------------|------------|
| `idle` | Widget opened | `greeting` |
| `greeting` | User sends first msg | `intake` |
| `intake` | Sufficient slots filled (≥3) OR explicit "show me ideas" | `retrieving` |
| `intake` | Slots insufficient | `clarifying` (max 3 turns) |
| `clarifying` | Slots filled OR turn cap | `retrieving` |
| `retrieving` | LLM+RAG returns | `results_shown` |
| `results_shown` | User refines | `clarifying` |
| `results_shown` | Guest hits free-credit cap | `signup_gate` |
| `signup_gate` | User authenticates | `results_shown` (restore) |
| any | Provider error | `error_recoverable` |

### 6.4 Required Slots Before Retrieval

The chatbot extracts these "slots" via function-calling:

| Slot | Required for retrieval? | Default behavior |
|------|------------------------|------------------|
| `recipient_relationship` | **Yes** | Ask if missing |
| `occasion` | **Yes** | Ask if missing |
| `budget_range` | **Yes** (soft) | Default to "any" with disclaimer |
| `interests_or_context` | Optional | Encouraged via 1 follow-up |
| `recipient_age_band` | Optional | Inferred from relationship |
| `country` | Auto from IP / user profile | — |

Minimum bar: 3 of these 4 marked required, OR explicit user override ("just show me ideas").

---

## 7. Coexistence with Existing Questionnaire Flow

The wizard remains the **canonical, fully-featured path**. The chat is an **alternate entry point** that joins the same downstream pipeline.

### 7.1 Shared Backend Contract

Both flows ultimately call the existing `generate-gifts` Edge Function and write to `gift_sessions`. Chat introduces a single new field:

```ts
gift_sessions.source: 'wizard' | 'chat'   // default 'wizard' for backwards compat
gift_sessions.chat_thread_id: uuid | null // FK to chat_threads (new table)
```

### 7.2 Crossover Behaviors

| Action | Behavior |
|--------|----------|
| Chat user clicks "I'd rather use the full form" | Chat collapses; Wizard pre-fills extracted slots into `GiftFlow.tsx` state; deeplink: `/gift?prefill=<thread_id>` |
| Wizard user mid-flow opens chat | Chat opens in side-sheet; current wizard state passed in as system context (read-only). Wizard state preserved on close. |
| Saved chat result | Becomes a normal `gift_sessions` row visible in Dashboard "Recent Sessions" with badge `via Chat`. |
| Re-running a chat session | Creates new `chat_thread_id`; old thread archived. |

### 7.3 Feature Parity Matrix

| Feature | Wizard | Chat (MVP) | Chat (P1) |
|---------|:------:|:----------:|:---------:|
| Generate gift recommendations | ✅ | ✅ | ✅ |
| ProductLinks (PRD 05) | ✅ | ✅ inline | ✅ |
| Signal Check (PRD 06) | ✅ | ❌ (open in modal) | ✅ inline |
| Save to Person | ✅ | ✅ (logged-in only) | ✅ |
| Add Reminder (PRD 07) | ✅ | ❌ | ✅ |
| Confidence Badge | ✅ | ✅ | ✅ |
| Plan/Credit gating (PRD 08, 09) | ✅ | ✅ | ✅ |

**No wizard capability is removed or degraded.** A feature flag `feature_chat_finder` (PRD 13) gates the entire chat surface and defaults OFF in prod until launch.

---

## 8. Guest User Experience

### 8.1 Identification

- Guest = browser session without a Supabase JWT.
- Identified by `guest_id` cookie (signed, 30-day expiry, HttpOnly).
- One `guest_id` ⇒ one free chat credit, ever, per anonymized fingerprint (cookie + hashed IP+UA pair) to prevent trivial abuse.

### 8.2 Free Credit Allocation

| Rule | Value |
|------|-------|
| Guest credit | **1 chat session** = 1 retrieval-bearing turn that returns gift cards |
| Clarifying questions | **Free** — do not consume credit |
| Refinement turns after first result | **Blocked** for guests; prompts signup |
| Cookie clear or new device | New `guest_id`, but rate-limit by hashed fingerprint (max 3 free credits per fingerprint per 24h) |

### 8.3 Signup Gate UX

After the first result is rendered to a guest:

> *"That's your free preview. **Sign up free** to keep the conversation going, save these ideas, and get 15 credits a month."*

Buttons: **[Sign up — it's free]**  **[Log in]**  **[Continue browsing the article]** (graceful dismiss).

On signup, the guest's `chat_thread_id` is **transferred to the new user_id** atomically (server-side migration in `auth.users` post-signup webhook). Conversation continues in place.

### 8.4 Restrictions on Guests

- ❌ Cannot Save to Person.
- ❌ Cannot run Signal Check.
- ❌ Cannot view ProductLinks beyond the top 2 stores (locked-store pattern from PRD 05 reused).
- ✅ Can click the affiliate link on shown stores.
- ✅ Can copy/share the result.

---

## 9. Logged-In User Experience

### 9.1 Auth Awareness on Landing

If a logged-in user opens the Landing Page (e.g. via shared link, or after browsing blog), the widget:

1. Reads the existing Supabase JWT (`useAuth` already global).
2. Greets by name: "Welcome back, {name}."
3. Skips guest gate; uses the user's normal credit balance (PRD 08).
4. Surfaces existing recipients as quick-pick chips.

### 9.2 Recipient Memory Access

In MVP the chat has **read-only** access to:

- `recipients` rows owned by the user (name, relationship, age, interests, important_dates).
- Last 5 `gift_sessions` for the chosen recipient (to avoid duplicate suggestions).
- User's `users.country` and `plan`.

If the user says "for Mum" and there's a unique recipient match, the bot confirms before binding: *"Got it — using your saved profile for Mum (54, into gardening, last gift was a pruning kit). Should I use those details?"*

### 9.3 Logged-In Capabilities

All guest restrictions lifted, plus:

- ✅ Save result → existing `gift_sessions.selected_gift` flow.
- ✅ Add Reminder for an occasion mentioned in chat (PRD 07).
- ✅ Open Signal Check from a chat-result card (modal, plan-gated).
- ✅ "Edit recipient" link if the bot used stale data.

### 9.4 Plan & Credit Behavior

- One chat-driven retrieval = **1 credit** (same cost as wizard generation).
- Clarifying turns = free.
- Free plan: 15 credits/month (PRD 08) shared across wizard + chat.
- Plan limits from PRD 09 enforced server-side identically.

---

## 10. Dashboard Chat Experience

### 10.1 Surface

Inside `/dashboard`, the chat is exposed in two places:

1. **Hero card** — "Ask GiftMind" prominent module above the recipients list (variant of PRD 14 contextual blocks).
2. **Persistent FAB** — bottom-right floating button on every authenticated page.

### 10.2 Layout

- Mobile: full-screen sheet from bottom.
- Desktop: 420px right-side drawer overlaying current page; preserves dashboard scroll state.

### 10.3 Dashboard-Specific Affordances

- **Recipient chips** at greeting: "🎁 Mum · 🎁 Sam · 🎁 Aunt Lila · ➕ New person".
- **Upcoming-occasion chips** if any are within 30 days (e.g. "Mum's birthday in 9 days").
- **"Continue last chat"** if a thread from <72h ago exists.

### 10.4 Result Card Actions (Logged-In Dashboard)

Each inline gift card in chat shows:

```
[Confidence 86%]  Cordless Garden Pruners
"A premium tool that builds on her gardening hobby…"
[Buy from Amazon ↗] [Save] [Signal Check 🔒/🎯] [More like this]
```

---

## 11. Landing Page Chat Experience

### 11.1 Placement

- **Floating chat bubble** bottom-right (default collapsed).
- **Hero section CTA** — secondary button next to "Get Started Free": **"Or just chat — no signup"**.
- Auto-prompt **after 8 seconds** of dwell time (one-time per session) with a non-modal nudge: *"Need a gift idea? Just type it 👇"*. Dismissable; respects `prefers-reduced-motion`.

### 11.2 Cold-Start Greeting (Guest)

> "Hey 👋 I'm GiftMind. Tell me who you're gifting for and I'll find ideas. Free first try, no signup needed."

### 11.3 Conversion Hooks

After delivering the free result, the bot embeds a contextual signup nudge tied to what the user just saw:

> *"Want me to remember Dad's profile so next year is easier? **Save free →**"*

### 11.4 Blog Page Variant

When chat is opened from a blog post (PRD 15), the post's `slug` is passed as RAG context — the bot can say *"I see you're reading our 'Gifts for New Dads' guide — want me to narrow these down to your budget?"*

---

## 12. Credit & Usage Rules

| Actor | Action | Cost | Notes |
|-------|--------|------|-------|
| Guest | Open widget, send messages | 0 | Free |
| Guest | First retrieval (gift cards rendered) | 1 guest credit (consumed) | Allocated per `guest_id` |
| Guest | Second retrieval | Blocked — signup gate | — |
| Logged-in Free | Retrieval | 1 credit (from monthly 15) | Same wallet as wizard |
| Logged-in Confident/Pro | Retrieval | 1 credit | Same wallet |
| Any | Clarifying questions | 0 | LLM cost absorbed; rate-limited |
| Any | Refinement that re-runs retrieval | 1 credit | Visibly indicated before charge |
| Any | Signal Check on a chat result | Per PRD 06 | Plan-gated |

A new column `credit_transactions.context` records `'chat'` vs `'wizard'` for analytics.

### 12.1 Confirmation UX Before Charge

If a refinement will consume a credit, a subtle inline chip warns: *"This will use 1 of your 14 credits. Continue?"* — auto-confirmed if user has unlimited tier or has opted out.

---

## 13. Signup / Login Gating Behavior

### 13.1 Gate Trigger Points

1. **Guest after first retrieval** — soft gate (results stay visible).
2. **Guest tries to Save / Signal Check / 2nd retrieval** — hard gate (action queued).
3. **Suspected abuse** — see §21.

### 13.2 Gate Modal Spec

- Non-blocking — user can dismiss and re-read existing results.
- One-tap social signup (Google, Apple) at top.
- "Magic link" email second.
- Microcopy reminds value: *"Save your chat, get 15 free credits/month, never lose a recipient."*

### 13.3 Post-Auth Continuity

- Server-side: on signup webhook, `chat_threads.guest_id` rebound to `user_id` if the guest cookie matches the signup session.
- Client-side: chat re-opens at the same scroll position with toast "Welcome! Your chat is saved."

### 13.4 Login (Returning User)

If a guest tries to log in, after auth the bot detects existing recipients/sessions and offers: *"I see you have 3 saved people. Want to use one of them?"*

---

## 14. Conversational UX Requirements

### 14.1 Tone & Voice

Friendly, concise, lightly playful. Same voice as PRD 04 result copy. Never apologetic; never robotic. Max **2 emojis per message**, never decorative-only.

### 14.2 Message Constraints

| Constraint | Value |
|------------|-------|
| Bot message max length | ~80 words (≈400 chars) |
| Clarifying questions per session | Max 3 before forcing retrieval |
| Result cards per turn | Default 3, configurable to 5 (Pro) |
| Typing indicator | Required while LLM streams |
| Streaming | Token-by-token for clarifying messages; results render when complete |

### 14.3 Interaction Affordances

- **Quick-reply chips** under bot questions ("Birthday", "Anniversary", "Just because").
- **Slot summary chip** above input ("👤 Dad · 🎂 60th birthday · 💵 $80") — tappable to edit.
- **Edit & resend** any past user message; thread forks (not destructive).
- **Keyboard shortcut**: `/` opens widget on desktop, `Esc` closes.
- **A11y**: ARIA live region for new bot messages, focus trap inside drawer, full keyboard nav, screen-reader labels for cards.

### 14.4 Latency Budgets

| Action | Target p95 |
|--------|-----------|
| First token after send | <1.5s |
| Full clarifying message | <3s |
| Retrieval + first card render | <6s |
| Card hydration (links, images) | <8s |

If exceeding, show progressive skeletons and a one-line status: *"Still searching across 12 stores…"*

### 14.5 Empty/Edge Inputs

- Profanity / off-topic → polite redirect.
- Pure greeting "hi" → counter-prompt with examples.
- Too vague (<5 tokens, no slots) → request specifics with example.
- Non-English → MVP handles English only, falls back: *"I work best in English right now — could you rephrase?"*

---

## 15. RAG Requirements

### 15.1 Pipeline Overview

```
User message ──► [LLM Slot Extractor + Query Rewriter]
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
   [Retrieval Orchestrator]    [Conversation Memory]
              │
   ┌──────────┼──────────┬───────────┬──────────┐
   ▼          ▼          ▼           ▼          ▼
[Vector]  [Keyword]  [Catalog SQL] [Recipient] [User
 store     BM25       (filters)    profile     history]
   │          │          │           │          │
   └──────────┴──────────┴─────┬─────┴──────────┘
                               ▼
                  [Re-ranker (cross-encoder or LLM)]
                               ▼
              [Generation Prompt with Context Bundle]
                               ▼
                  [LLM produces JSON gift cards]
                               ▼
                  [Affiliate enrichment via search-products]
                               ▼
                       Inline Result Cards
```

### 15.2 Components

| Component | MVP choice | Rationale |
|-----------|-----------|-----------|
| Embedding model | OpenAI `text-embedding-3-small` or Gemini `text-embedding-004` | Low cost, multilingual ready |
| Vector store | Supabase `pgvector` | Already in stack, no new infra |
| Keyword index | Postgres `tsvector` GIN on existing tables | Zero new infra |
| Re-ranker (P1) | Cohere Rerank or LLM-based | Skip in MVP — direct top-k |
| LLM chain | Per PRD 13 `getProviderChain('chat_finder', plan)` | Reuse routing |
| Function calling | JSON-mode for slot extraction + result schema | Deterministic |

### 15.3 Retrieval Strategy

1. **Hybrid retrieval**: vector top-20 ∪ BM25 top-20.
2. **Hard SQL filters**: country, budget, in-stock, recipient age band.
3. **Catalog match**: re-use scoring algorithm from PRD 05/11 for `marketplace_products`.
4. **Top-K fusion** (Reciprocal Rank Fusion) → top 8 → LLM re-rank → 3 cards.

### 15.4 Generation Prompt Skeleton

```
SYSTEM: You are GiftMind's recommender. Given context bundle, output 3 gift recommendations as strict JSON {gifts: [...]}. Each gift must cite at least one source from <CONTEXT>.

CONTEXT:
- Slots: {…}
- Retrieved knowledge (max 8 chunks): {…}
- Recipient profile (if available): {…}
- Past gifts to recipient (avoid duplicates): {…}
- Marketplace candidates: {…}
USER: {latest message}
```

### 15.5 Grounding & Hallucination Controls

- Every gift idea must have at least one **citation_id** referencing a retrieved chunk or marketplace_product_id.
- If <3 valid citations, the bot says: *"I don't have enough info yet — can you tell me about their hobbies?"*
- Hard cap: bot never invents stores, prices, or stock state — those come from `search-products` enrichment only.

### 15.6 Eval Set

Engineering owns a frozen 100-prompt eval suite (curated from real wizard sessions) measuring:

- Slot extraction F1 ≥ 0.85
- Retrieval recall@5 ≥ 0.70
- Result diversity (cosine distance ≥ 0.4 between cards)
- Citation faithfulness (LLM-as-judge) ≥ 0.9

---

## 16. Data Sources for Retrieval

| # | Source | Table / Origin | Indexed As | Refresh |
|---|--------|----------------|-----------|---------|
| 1 | Marketplace catalog | `marketplace_products` | Vector + structured filters | Live (insert-trigger) |
| 2 | Store registry | `marketplace_config` | Structured | Live |
| 3 | Blog posts | `blog_posts` (PRD 15) | Vector chunks (≈400 tokens) | Nightly |
| 4 | Curated gift guides | New `gift_guides` table | Vector + tags | Manual |
| 5 | Occasion playbooks | New `occasion_playbooks` table (e.g. "Father's Day rules") | Vector + tags | Manual |
| 6 | User's recipients (logged-in) | `recipients` for `auth.uid()` | Direct row read | Live |
| 7 | User's prior `gift_sessions` | Last 10 per recipient | Direct row read | Live |
| 8 | User profile | `users` (country, plan, prefs) | Direct row read | Live |
| 9 | Trending categories (P1) | Aggregates from PRD 12 | Materialized view | Daily |

**Privacy boundary**: sources 6–8 are **only** included when the user is authenticated and only for that user's `auth.uid()`. RLS enforced.

### 16.1 New Tables

```sql
chat_threads (
  id uuid pk,
  user_id uuid null,
  guest_id text null,
  status text,           -- 'active' | 'gated' | 'closed'
  source_surface text,   -- 'landing' | 'dashboard' | 'blog'
  blog_post_slug text null,
  created_at timestamptz,
  updated_at timestamptz
);

chat_messages (
  id uuid pk,
  thread_id uuid fk,
  role text,             -- 'user' | 'assistant' | 'tool'
  content jsonb,
  citations jsonb,
  credit_charged bool default false,
  created_at timestamptz
);

guest_credits (
  guest_id text pk,
  fingerprint_hash text,
  credit_used bool default false,
  used_at timestamptz null,
  ip_country text,
  created_at timestamptz
);

gift_guides (
  id uuid pk, slug text unique, title text, body_md text,
  tags text[], embedding vector(1536), published bool, ...
);
```

---

## 17. User Profile & Recipient Memory Behavior

### 17.1 Memory Scope (MVP)

| Scope | Persistence | Read | Write |
|-------|-------------|------|-------|
| Slots within current thread | In-thread | ✅ | ✅ (auto from extraction) |
| User profile | Permanent | ✅ | ❌ in MVP |
| Existing recipient profiles | Permanent | ✅ | ❌ in MVP |
| Recipient-level "last 5 gifts" | Permanent | ✅ | ❌ |
| Cross-thread chat memory | None | ❌ | ❌ |

### 17.2 P1 Memory Enhancements

- Bot proposes "Save these details to a new recipient called 'Dad'?" → write to `recipients`.
- Bot proposes adding important dates → write to `recipients.important_dates` (PRD 07).
- "Update Dad's interests with 'fishing'" — explicit, confirmable diff before write.

### 17.3 Forget / Reset

User can "Forget this chat" → soft-deletes thread + messages. "Forget recipient context" → bot continues without recipient binding for the rest of the session.

---

## 18. Gift Recommendation Result Format

### 18.1 Inline Card Schema

```json
{
  "id": "uuid",
  "title": "Cordless Garden Pruners",
  "blurb": "A premium tool that builds on her gardening hobby…",
  "confidence": 86,
  "estimated_price": { "min": 55, "max": 75, "currency": "USD" },
  "why_it_fits": [
    "Matches 'gardening' interest",
    "Within $80 budget",
    "Different from last year's pruning kit"
  ],
  "citations": ["mp_4831", "blog_garden_gifts_2026"],
  "store_links": [ /* PRD 05 ProductLink schema */ ],
  "actions": ["save", "signal_check", "more_like_this"]
}
```

### 18.2 Visual Spec (mirrors PRD 04 GiftCard)

- Compact variant inside chat (image, title, confidence badge, primary CTA, overflow menu).
- Tap → expands to full GiftCard sheet (re-uses existing component).
- Carousel: horizontal swipe on mobile, side arrows on desktop.

### 18.3 "More Like This" Affordance

Sends an automatic refinement turn: `"Show me alternatives similar to {gift_title}, slightly different angle"` — consumes a credit.

### 18.4 No-Result Fallback

If retrieval yields <3 grounded gifts: bot returns 1–2 it has, plus *"I'm low on confidence here — tell me one more detail and I'll do better."* No credit charged.

---

## 19. Save / Share / Add-to-Person Behavior

### 19.1 Save (Logged-In Only)

- Card overflow → **Save**.
- If thread is bound to an existing recipient → saves to that recipient's `gift_sessions`.
- If unbound → modal: "Save under which person?" with chip list + "New person" option.
- Saved gifts appear in Dashboard > Recent Sessions with `via Chat` badge.

### 19.2 Share

- Generates a public read-only `share_token` URL: `/share/g/{token}`.
- Page renders the gift card(s) and a "Try GiftMind" CTA.
- Owner controls revoke from settings.

### 19.3 Add-to-Person (P1)

Promotes a chat-extracted profile to a real `recipients` row in one tap. MVP: deeplink to "+ New Person" prefilled.

### 19.4 Export (P2)

Email summary with all cards, used as a reminder asset.

---

## 20. Error States & Fallback Behavior

| Error | UX | Backend |
|-------|----|---------|
| LLM provider 5xx | "Hmm, my brain hiccupped — retrying…" + auto-retry once | Fall through provider chain (PRD 13) |
| All providers fail | "I'm down right now — try the [full form]({wizard_link}) instead." | Log to Sentry; **no credit charged** |
| Retrieval yields nothing | "I need a bit more detail to recommend." | Refund credit if charged |
| `search-products` fails for store enrichment | Show cards without store links + "Buying options loading…" | Background retry |
| Rate-limit hit | "Whoa, that's a lot of questions! Take a breath, try again in a minute." | 429 with `Retry-After` |
| Plan limit reached | Upgrade modal (PRD 09) | Block; no credit charged |
| Network offline | "You're offline — we'll keep your message and send it when you're back." | Queue in IndexedDB |
| Auth expired mid-chat | Silent refresh; if fail, login modal preserving thread | — |
| Profanity / unsafe input | Polite refusal with redirect to legitimate use | Logged for moderation |

### 20.1 Universal Escape Hatch

A persistent "Use the full form instead" link in the chat header — never hidden, never disabled.

---

## 21. Abuse Prevention & Rate Limits

| Vector | Control |
|--------|---------|
| Guest credit farming | `guest_credits` keyed on cookie + hashed fingerprint (IP+UA salted). 3 free credits/24h per fingerprint hard cap. |
| Prompt injection | System-prompt isolation, retrieved chunks rendered as untrusted text, output schema enforced. |
| Token-burning long messages | User input >1,500 chars → prompt to summarise; truncate at 4,000. |
| Affiliate URL scraping | Store links rendered server-side with click-tracking redirect (already PRD 05). |
| Bot traffic | hCaptcha invisible challenge before first retrieval for guests; Cloudflare Turnstile preferred. |
| Spam/abusive content | Provider safety filters + a thin moderation pass (Anthropic's content classifier, free tier). |
| Excessive clarifying loops | Hard cap 3 clarifications then forced retrieval or graceful exit. |
| Per-user RPS | 10 messages/min, 60 messages/hour (logged-in); 5/min, 15/session for guests. |

All limits configurable from `platform_settings` (PRD 13) under `chat_*` keys.

---

## 22. Privacy & Data Handling Requirements

1. **Guest data** is stored under `guest_id` only. No PII collected. Cookie banner already covers analytics consent.
2. **PII passed to LLMs** is minimised: recipient names hashed/aliased to `Recipient_A` before being sent to third-party providers; the alias map kept server-side.
3. **Chat content retention**: 90 days for guests (auto-purge), indefinite for logged-in users (purgeable on request — GDPR/CCPA).
4. **Right to erasure**: existing user-deletion job extended to wipe `chat_threads` + `chat_messages`.
5. **Provider routing**: Per PRD 13, free-tier traffic routed to Groq (no-train terms acceptable) → Gemini Flash → Claude Haiku. **No traffic** sent to providers without zero-retention DPAs for chat.
6. **Embeddings**: store text + embeddings in our DB; only de-identified text is sent to embedding providers.
7. **Audit logging** (PRD 10): admin actions on chat data (e.g. moderation overrides) recorded in `audit_log`.
8. **Children's data**: chat does not knowingly accept minors as authors; ToS update needed.
9. **Cross-border**: country derived from IP/profile gates EU-specific consent strings via existing CMP.

A short **Privacy Note** is shown beneath the widget input on first open: *"Your messages help find gifts. We don't sell your data. [Learn more]"*.

---

## 23. Analytics & Success Metrics

### 23.1 Event Taxonomy (extends PRD 12)

| Event | Properties |
|-------|------------|
| `chat_widget_opened` | surface, auth_state, source_url |
| `chat_message_sent` | thread_id, turn_index, char_len, slots_filled |
| `chat_clarifying_shown` | thread_id, slot_asked |
| `chat_retrieval_started` | thread_id, slots, plan |
| `chat_results_rendered` | thread_id, n_cards, latency_ms, citations_count |
| `chat_card_clicked` | card_id, store, position |
| `chat_card_saved` | card_id, recipient_id |
| `chat_signup_gate_shown` | thread_id, trigger |
| `chat_signup_completed_from_gate` | thread_id |
| `chat_session_ended` | thread_id, ended_by, turns |
| `chat_error_shown` | thread_id, error_code |

### 23.2 North-Star & Guardrail Metrics

| Metric | Type | MVP Target | Guardrail |
|--------|------|-----------|-----------|
| Landing → first-result conversion | North-star | ≥ 25% (vs ~6% wizard baseline) | — |
| Guest → signup conversion after free credit | North-star | ≥ 18% | — |
| Avg chat turns before result | UX | ≤ 4 | — |
| Chat recommendation click-through rate | Engagement | ≥ 35% | — |
| Save-to-person rate (logged-in) | Activation | ≥ 22% | — |
| Wizard usage week-over-week | Guardrail | No drop > 10% absolute | Halt rollout if breached |
| Retention D7 (chat-acquired) | Retention | ≥ 28% | vs 22% baseline |
| Latency p95 (retrieval) | Quality | < 6s | <8s |
| Result citation rate | Quality | ≥ 95% of cards | — |
| Free-credit abuse rate | Trust | < 2% suspicious sessions | <5% |
| Cost per retrieval (free tier) | Unit econ | < $0.005 | <$0.01 |

### 23.3 Experimentation (PRD 12)

Launch behind PostHog feature flag `chat_finder_enabled` with 10% → 50% → 100% rollout. Holdout group: 5% no-chat to measure long-term wizard retention impact.

---

## 24. Acceptance Criteria

A user story is complete when **all** of the following hold:

### 24.1 Functional

- [ ] AC-1: A guest on the Landing Page can open the chat, send "Gift for my dad's 60th, loves fishing, $80", and within ≤6s p95 see ≥3 inline gift cards with confidence badges and store links.
- [ ] AC-2: After the first retrieval, a guest's second retrieval is blocked with the documented signup modal; results from turn 1 remain visible.
- [ ] AC-3: A logged-in user opening the Landing Page does NOT see the guest gate and uses their normal credits.
- [ ] AC-4: From the Dashboard, a logged-in user can pick "Mum" chip and the bot binds the recipient profile, evidenced by referencing it in the next message.
- [ ] AC-5: Saving a chat card creates a `gift_sessions` row with `source='chat'` and the card visible in Dashboard recents.
- [ ] AC-6: The wizard flow remains accessible from `/gift` with no behavioral change (regression suite green).
- [ ] AC-7: The chat shares the same credit wallet — wizard generations and chat retrievals decrement the same balance.
- [ ] AC-8: Provider failure exhausting the chain shows the documented error and **does not** charge a credit.
- [ ] AC-9: Each gift card returned cites at least one retrieved chunk (`citations` non-empty).
- [ ] AC-10: A user can reach the wizard from inside chat via "Use the full form" with prefilled slots.

### 24.2 Non-Functional

- [ ] AC-11: Latency p95 < 6s end-to-end for a 1-turn retrieval on free plan.
- [ ] AC-12: Cost per retrieval averages < $0.005 for free-tier users (telemetry).
- [ ] AC-13: WCAG 2.1 AA: keyboard nav, focus management, ARIA live regions all pass automated audit + manual screen-reader walkthrough.
- [ ] AC-14: Mobile (iOS Safari, Android Chrome) full-screen sheet works, no layout shift, virtual keyboard behavior correct.
- [ ] AC-15: Feature flag `feature_chat_finder` toggles the entire surface live without redeploy.
- [ ] AC-16: RLS verified — guest cannot read another guest's thread; user cannot read another user's thread.
- [ ] AC-17: Eval suite: slot F1 ≥ 0.85, recall@5 ≥ 0.70, citation faithfulness ≥ 0.9.

---

## 25. Edge Cases

1. **User sends a multi-recipient request** ("for my mum AND dad") → bot splits, asks "Should we focus on one first?" Defaults to first mentioned in MVP.
2. **Budget given as range vs exact** ("$50-100" vs "$80") → both supported; cards must respect the upper bound.
3. **Currency mismatch** — user's profile country = UK but says "$80" → bot confirms currency.
4. **Logged-in user with 0 credits** — clarifying turns still free; retrieval blocked with PRD 09 paywall, no charge.
5. **Cookie disabled / Safari ITP** — guest credit may not persist across reloads; degrade to "1 credit per page session".
6. **Existing thread closed > 30 days** — auto-archived; "Continue" creates a new thread with prior context as soft-summary.
7. **User pastes very long product spec** — handled via summarisation step before retrieval.
8. **Recipient name collision** ("for Sam" but two Sams exist) → disambiguation chips.
9. **Profanity / harassment in user input** — soft refusal + counter; repeated abuse closes thread.
10. **Network interrupt mid-stream** — last user message persisted in IDB; retried on reconnect, dedup via client message ID.
11. **Guest signs up mid-stream** — retrieval continues uninterrupted using new auth context.
12. **User asks for non-gift help** ("write me a wedding speech") — politely refused with redirect.
13. **Catalog empty for country** — bot warns and shows generic ideas with "stores not available in your region" notice.
14. **Sensitive recipient context** (e.g. "for my mum who has cancer") — empathetic language, suppress humour, surface care-oriented gift guides.
15. **Anti-pattern: asking the bot for personal advice** — soft redirect: "I focus on gifts — should we get back to that?"
16. **Concurrent tabs** — same user, two threads → allowed; both write to `chat_threads` independently.
17. **Plan downgrade mid-session** — limits enforced at next retrieval, not retroactively.

---

## 26. MVP Scope

### 26.1 In Scope (V1.0 — 6–8 weeks)

| Area | MVP commitment |
|------|----------------|
| Surfaces | Landing widget + Dashboard drawer; **not** blog inline yet |
| Auth modes | Guest (1 free credit) + logged-in (free + paid plans) |
| Recipient memory | Read-only access to existing recipients |
| RAG sources | `marketplace_products`, `blog_posts`, 1 seeded `gift_guides`, `occasion_playbooks` (10 hand-curated), `recipients`, last 5 `gift_sessions` |
| Output | 3 gift cards inline; reuse PRD 04 components |
| Save | Save to recipient (logged-in) |
| Signal Check | Open in modal, plan-gated (not inline streaming) |
| Provider routing | Reuse PRD 13 chain |
| Analytics | Full event taxonomy from §23 |
| Feature flag | Default OFF, 10% → 50% → 100% |

### 26.2 Explicitly Excluded from MVP

- Inline Signal Check streaming inside chat
- Voice input
- Recipient profile *writes* from chat
- Multi-recipient single-thread conversations
- Cross-session memory ("remember I prefer Etsy")
- Native mobile apps
- Blog post embedded chat (still uses floating widget)
- Re-ranker model
- A/B testing of card layouts (basic single layout)

### 26.3 Recommended Lean Launch (4-Week "MVP-Lite")

If timeline is tighter, ship this minimal slice first behind `feature_chat_finder_lite`:

- Landing-only widget (no Dashboard surface).
- Guest 1-credit + signup gate.
- RAG over `marketplace_products` only (no blog/guides).
- 3 gift cards inline; **no save**; no Signal Check; no recipient memory.
- "Open in full form" deeplink for everything else.

This validates the conversion hypothesis cheaply; full MVP follows in the next iteration.

---

## 27. Future Enhancements (P1 / P2)

### P1 (next 1–2 quarters)

- [P1] **Recipient writes from chat** with explicit confirm-diff modal.
- [P1] **Inline Signal Check** streaming inside chat with collapsible result.
- [P1] **Add reminder from chat** ("Remind me 14 days before Mum's birthday").
- [P1] **Blog inline chat** — chat opens in-page on blog posts, contextualised.
- [P1] **Re-ranker** (Cohere or LLM-based) for retrieval quality.
- [P1] **Multi-language support** (ES, FR, DE) in retrieval and generation.
- [P1] **Cross-session memory** — summarise prior threads per user as a reusable "preferences" embedding.
- [P1] **"Why I picked this" expandable** showing retrieved chunks for transparency.

### P2 (later)

- [P2] **Voice input** (mobile push-to-talk).
- [P2] **Group gifting** — two users contribute to one thread.
- [P2] **Agentic checkout** — bot drafts cart at retailer (deeplink with pre-selected products).
- [P2] **Image-grounded retrieval** — user uploads a photo of recipient's hobby gear, bot extracts visual cues.
- [P2] **Browser extension** — chat anywhere on the web.
- [P2] **Family-account mode** — shared recipient list across household.
- [P2] **Predictive proactive nudges** — bot pings user 14 days before saved occasion offering chat session.

---

## 28. Open Questions & Assumptions

### 28.1 Open Questions

1. **Q-1 (Auth):** Will we support Google One Tap to make guest→signup gate friction-free? Pending OAuth redirect URL audit.
2. **Q-2 (Pricing):** Should chat retrievals cost the same as wizard retrievals indefinitely, or do we eventually price chat lower (since avg cost is lower)?
3. **Q-3 (Memory):** Do we let users opt out of cross-session memory by default (privacy-first) or opt in (engagement-first)?
4. **Q-4 (Providers):** Is Groq's free-tier rate limit sufficient at projected MVP volume, or do we need a paid backstop?
5. **Q-5 (Catalog):** What's the curation budget for `gift_guides` and `occasion_playbooks`? Manual seeding for MVP — who owns it?
6. **Q-6 (Brand):** Final user-facing name — "Ask GiftMind", "Gift Chat", or post-rebrand "Ask Kinfold"? Marketing decision.
7. **Q-7 (Embeds):** Public embeddable widget for partner blogs (P2)? Affects auth model.
8. **Q-8 (Latency):** Acceptable to stream cards one-by-one as they enrich, or render all-or-nothing? UX preference.
9. **Q-9 (Compliance):** Does our DPA with the chosen LLM providers permit logged-in user PII (recipient names) without aliasing? If yes, we can simplify §22.
10. **Q-10 (Wizard ↔ Chat):** When prefilling wizard from chat, should we *skip* the steps already filled, or land the user on Step 1 with values shown? UX A/B test candidate.

### 28.2 Working Assumptions

- A1: PRD 13 provider routing is generally available before MVP launch.
- A2: PRD 11 catalog has ≥5,000 indexed products across at least 5 stores at launch.
- A3: Embedding generation can run on the existing Supabase Edge Function infrastructure (no new compute).
- A4: Marketing supports dual-CTA on Landing ("Get Started" + "Or just chat").
- A5: Legal sign-off on guest data handling and 90-day retention obtained before public launch.
- A6: Existing PRD 04 `GiftCard` component can be rendered inside a chat bubble with a `compact` prop without forking.
- A7: PostHog and Sentry quotas accommodate the new event volume (~5× current generation events estimated).

---

## Appendix A — User Stories

### A.1 Guest / Visitor

- As a curious visitor, I want to ask for a gift idea right from the Landing Page, so that I can evaluate the product before committing to signup.
- As a visitor, I want my one free chat to feel complete (real results, real stores), so that I trust the product enough to sign up.
- As a visitor, I want a clear, friendly explanation when I run out of free turns, so that I know exactly what signing up unlocks.
- As a visitor, I want to dismiss the signup gate and re-read my one result, so that I don't feel pressured.
- As a privacy-conscious visitor, I want to know what's done with my chat content, so that I can decide whether to continue.

### A.2 New User Just Signed Up

- As a new user, I want my pre-signup chat to be preserved after signup, so that I don't have to start over.
- As a new user, I want a one-click way to save the gift I was just shown to a recipient profile, so that I keep momentum.

### A.3 Returning Logged-In User

- As a returning user, I want the chat to recognise me on the Landing Page, so that I don't get gated like a stranger.
- As a returning user, I want the chat to use my saved recipient profiles, so that I don't repeat myself.
- As a returning user, I want chat to suggest different gifts than I bought last year, so that I'm not redundant.
- As a returning user, I want to flip from chat to the full wizard mid-conversation with my context preserved, so that I get the deeper experience when I want it.
- As a returning user, I want the chat to share my monthly credits with the wizard, so that the system feels unified.

### A.4 Power User / Repeat Gifter

- As a power user, I want quick-pick chips for my recipients in the Dashboard chat, so that I get to results in two taps.
- As a power user, I want to ask "more like this" on a result card, so that I can converge on the right gift quickly.
- As a power user, I want to run Signal Check from a chat result, so that I validate my pick without leaving the conversation.

### A.5 Admin / Operator

- As an admin, I want to flip the chat surface on/off via feature flag, so that I can roll out and roll back safely.
- As an admin, I want to monitor cost-per-retrieval for chat separately from wizard, so that I can detect economic anomalies.
- As an admin, I want a moderation queue of flagged chat content, so that I can review abusive sessions.

---

## Appendix B — Functional Requirements (Prioritised)

### B.1 Surface & Entry Points

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Floating chat bubble on Landing Page, collapsed by default | **P0** |
| FR-2 | Persistent FAB on all authenticated pages | **P0** |
| FR-3 | "Ask GiftMind" hero card on Dashboard | **P0** |
| FR-4 | Auto-prompt nudge after 8s on Landing (one-time) | P1 |
| FR-5 | Inline embedded chat on blog posts | P1 |
| FR-6 | Public embeddable widget for partner sites | P2 |

### B.2 Auth & Credits

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7 | Guest gets 1 free retrieval per `guest_id` | **P0** |
| FR-8 | Logged-in users use existing wallet (PRD 08) | **P0** |
| FR-9 | Anti-abuse fingerprint cap (3 free credits / 24h) | **P0** |
| FR-10 | Auth recognition on Landing for logged-in users | **P0** |
| FR-11 | Guest-thread → user-thread migration on signup | **P0** |
| FR-12 | hCaptcha/Turnstile before first guest retrieval | P1 |

### B.3 Conversational Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-13 | LLM-based slot extractor (function-calling) | **P0** |
| FR-14 | Hybrid retrieval (vector + BM25) | **P0** |
| FR-15 | Hard SQL filters (country, budget, age) | **P0** |
| FR-16 | Reciprocal Rank Fusion → LLM re-rank | **P0** |
| FR-17 | Citation-required generation schema | **P0** |
| FR-18 | Streaming clarifying messages | **P0** |
| FR-19 | Cross-encoder re-ranker | P1 |
| FR-20 | Multi-language retrieval | P1 |
| FR-21 | Voice input | P2 |

### B.4 Results & Actions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-22 | Inline gift cards (compact GiftCard variant) | **P0** |
| FR-23 | Confidence badge per card | **P0** |
| FR-24 | ProductLinks integration with locked-store pattern | **P0** |
| FR-25 | "Save to person" (logged-in) | **P0** |
| FR-26 | "More like this" refinement | **P0** |
| FR-27 | Inline Signal Check (modal in MVP, inline in P1) | P1 |
| FR-28 | Add reminder from card | P1 |
| FR-29 | Share token URL | P1 |
| FR-30 | Email export | P2 |

### B.5 Memory & Personalization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-31 | Read user's existing recipients | **P0** |
| FR-32 | Read last 5 gift sessions per recipient | **P0** |
| FR-33 | Avoid duplicating recently gifted items | **P0** |
| FR-34 | Confirm-diff write-back to recipients | P1 |
| FR-35 | Cross-session preferences embedding | P1 |

### B.6 Reliability & Ops

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-36 | Provider chain fallback per PRD 13 | **P0** |
| FR-37 | No credit charge on errors / no-result | **P0** |
| FR-38 | Feature flag `feature_chat_finder` | **P0** |
| FR-39 | Sentry + PostHog instrumentation | **P0** |
| FR-40 | Admin moderation queue | P1 |
| FR-41 | A/B testing infra integration (PRD 12) | P1 |

### B.7 Privacy & Compliance

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-42 | Recipient name aliasing before LLM call | **P0** |
| FR-43 | 90-day guest data retention auto-purge | **P0** |
| FR-44 | Right-to-erasure extension to chat tables | **P0** |
| FR-45 | Consent strings via existing CMP for EU | **P0** |

---

## Appendix C — Rollout Plan

| Phase | Timing | Audience | Exit Criteria |
|-------|--------|----------|---------------|
| **0 — Internal alpha** | Wk 5 | GiftMind team (10 ppl) | All AC pass on staging |
| **1 — Closed beta** | Wk 6 | 200 invited users | NPS ≥ 30 on chat; no P0 bugs |
| **2 — 10% rollout** | Wk 7 | Random 10% of traffic | Conversion lift > +50% landing→result; cost/retrieval < $0.01 |
| **3 — 50% rollout** | Wk 8 | 50% of traffic | Wizard usage drop ≤ 10% absolute |
| **4 — 100% GA** | Wk 9 | All traffic | Sustained guardrails for 7 days |

---

## Appendix D — Engineering Hand-off Checklist

- [ ] DB migrations for `chat_threads`, `chat_messages`, `guest_credits`, `gift_guides`, `occasion_playbooks` reviewed.
- [ ] `pgvector` extension confirmed enabled.
- [ ] Edge Functions: `chat-turn`, `chat-retrieve`, `chat-finalize` scaffolded.
- [ ] Provider chain entry `chat_finder` registered in `_shared/ai-providers.ts` (PRD 13).
- [ ] Feature flag `feature_chat_finder` registered.
- [ ] Frontend: `ChatWidget`, `ChatDrawer`, `ChatMessage`, `ChatGiftCard` (compact), `GuestSignupGate` components.
- [ ] Auth integration: `useAuth` exposed to widget; SSR-safe.
- [ ] Cookie middleware: signed `guest_id`.
- [ ] Eval harness wired to CI (regression on retrieval metrics).
- [ ] Storybook entries + Playwright E2E flows.
- [ ] Lighthouse / a11y audits in CI.

---

**End of PRD 17.**

This document is intended to be sufficient for engineering, design, and QA to begin a sprint-zero kickoff. Open questions §28 require resolution before sprint planning. Cross-references to PRDs 03–16 are non-negotiable: any deviation from the existing wizard pipeline contract must come back as an addendum.