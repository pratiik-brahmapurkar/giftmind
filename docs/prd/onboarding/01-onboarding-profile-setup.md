# 01 — Onboarding & Profile Setup PRD

> **Feature:** Onboarding Wizard & Profile Completion  
> **Owner:** Pratik Brahmapurkar  
> **Version:** 1.0  
> **Status:** Ready for Engineering  
> **Target:** v2.1 (post recommendation-engine v2 launch)  
> **Last Updated:** 2026-04-18

---

## Phase 1 Audit: What Exists Today

Before any specification, here is an honest inventory of what is built, what is broken, and what is missing.

### What exists

| Component | File | Status |
|-----------|------|--------|
| 3-step informational wizard | `src/pages/Onboarding.tsx` | Built, but data-free |
| `has_completed_onboarding` column | `users` table | Exists |
| Profile page | `src/pages/Profile.tsx` | Built, partial fields |
| Email → onboarding routing | `src/pages/Signup.tsx:148` | Works |
| Login onboarding check | `src/pages/Login.tsx:31` | Works |
| `handle_new_user` trigger | multiple migrations | Works |

### What is broken

| Issue | Location | Impact |
|-------|----------|--------|
| Google OAuth skips onboarding | `src/pages/Signup.tsx:159` — `redirectTo: '/dashboard'` | All Google signups never see onboarding |
| No onboarding gate in AuthGuard | `src/components/AuthGuard.tsx` | Users can navigate directly to `/gift-flow` without onboarding |
| Login Google OAuth also redirects to dashboard without check | `src/pages/Login.tsx:74` | Same bypass for returning users |

### What is missing

- `onboarding_state` jsonb (resume support, audience, gift style tracking)
- `birthday` column on users
- `profile_completion_percentage` column
- Data-collection steps (audience, first recipient, country confirmation)
- Profile completion banner on Dashboard
- Step-level PostHog events (only `onboarding_completed` fires today)
- Re-prompt logic (show banner on 2nd/5th session)
- Bonus credit grant for completion
- Gifting preferences fields on Profile page

### Current users table columns

```
id, email, full_name, avatar_url, country, language,
active_plan, credits_balance, has_completed_onboarding,
referral_code, referred_by, role, notification_prefs,
last_active_at, created_at, updated_at
```

---

## Section 1: Overview

### Feature Name
Onboarding Wizard & Profile Setup — GiftMind v2.1

### One-Paragraph Description

Onboarding & Profile Setup is the first experience a new GiftMind user encounters after signup. It replaces the current 3-step informational slideshow (which collects no data and has no resume capability) with a 5-step wizard that collects the user's gifting audience, adds their first recipient, confirms their country, and sets gift-style preferences — all while communicating GiftMind's value proposition. After wizard completion, a `/profile` page (already partially built) provides a persistent home for editing all collected data. A completion-percentage banner on the Dashboard nudges users who skipped back into the flow.

### Why This Feature Matters

**Activation.** A new user who adds at least one recipient is 4x more likely to complete their first gift session than one who doesn't. The current wizard never asks users to do this. Every day the gap remains open is lost activation.

**Data quality.** The gift recommendation engine (v2) uses `country`, cultural context, and recipient data as core inputs. If users land in the system with `country = null` and zero recipients, the engine either fails silently or produces generic output. Onboarding is the right time to collect this data — users are motivated, haven't yet been disappointed.

**Retention.** Users who experience value in their first session (found a gift they liked) retain at D1/D7 at 2–3x the rate of users who bounced without a session. Onboarding reduces friction to that first value moment.

**Business.** Profile completion unlocks accurate PostHog segmentation, better-targeted email sequences, and the foundation for future personalization features (birthday reminders, occasion alerts).

### Where It Fits

Onboarding is the first feature a new user touches — it runs immediately after signup (both email and Google OAuth) and gates nothing (users can skip). It is the zero-to-one bridge between auth and the product's core value loop.

```
Signup / OAuth
    ↓
Onboarding Wizard (5 steps, skippable)
    ↓
Dashboard (first-time state)
    ↓
Gift Flow (first value moment)
```

### Scope: What Is IN This PRD

- Fix Google OAuth to route new signups to `/onboarding`
- Replace the 3-step informational wizard with a 5-step data-collection wizard
- `onboarding_state` jsonb column for persistent resume
- `birthday` and `profile_completion_percentage` columns
- Profile completion banner on Dashboard
- Profile page additions: birthday field, gifting preferences section
- PostHog event instrumentation (9 new events)
- Bonus credit grant on wizard completion (optional, gated by flag)
- SQL migration for all schema changes
- `complete-onboarding` Supabase Edge Function for service-role operations

### Explicit Non-Goals

1. **Email welcome sequence** — out of scope; belongs in a separate lifecycle emails PRD
2. **Forced onboarding** — users can always skip; no hard gates
3. **Social features** — no "import contacts," no shared gift lists
4. **Notification preferences** — separate settings PRD
5. **Avatar upload redesign** — Profile page already handles this; not changing upload logic
6. **Account deletion flow** — existing Danger Zone button not in scope for this PRD
7. **Multi-language support** — language field stays but localization is a separate effort
8. **Recipient management overhaul** — Step 3 uses a simplified form only; full recipient management is its own PRD
9. **Admin onboarding analytics** — admin dashboard metrics are separate
10. **Paid plan upsell during onboarding** — not shown during wizard; post-activation only

---

## Section 2: User Problem & Goals

### The User Problem

A new GiftMind user signs up, lands on a card saying "Welcome to GiftMind," sees a How-It-Works screen, sees a Credits screen, and clicks "Go to Dashboard." The dashboard shows an empty state: "Add Your First Person." They're back to where they started — figuring out what to do on their own, with no guidance, no data in the system, and no demonstration of value. The product has done nothing to earn their continued engagement.

The current wizard is a marketing brochure, not a setup experience. It tells users what GiftMind does but never helps them do it.

### The Business Problem

Without recipient data, the gift recommendation engine cannot run. Without country data, store links are wrong. Without knowing the user's gifting context (family? colleagues? partner?), personalization is shallow. Every data point missed at signup is a data point that must be collected via interruption later — a worse experience at a worse time.

The activation funnel today is:
```
Signup → 3-step slideshow → Dashboard → "Add Your First Person" (cold CTA)
```

The gap between "I signed up" and "I completed my first gift session" is too wide, too cold, and too undirected.

### Target Users

- **Primary:** New signups (0 sessions, 0 recipients). They see the full wizard.
- **Secondary:** Existing users who have sessions and recipients but never completed profile fields (country, birthday, preferences). They see the Dashboard banner.
- **Edge case:** Users who signed up via Google OAuth and were incorrectly routed to dashboard — they should be soft-prompted retroactively.

### Jobs To Be Done

1. **"When I sign up, I want to immediately understand what GiftMind does for me specifically, so that I have a reason to add someone right now rather than closing the tab."**

2. **"When I'm about to use GiftMind for the first time, I want to add the person I'm thinking of gifting in <60 seconds, so that I can go straight to finding them a gift without detours."**

3. **"When I give GiftMind basic information about myself (country, preferences), I want the product to feel like it 'knows' me, so that the gift recommendations feel tailored rather than generic."**

4. **"When I skip an onboarding step, I want to know I can come back to it later without losing what I've already done, so that I don't feel locked in."**

5. **"When I return to GiftMind after completing onboarding, I want to update my profile (country, preferences) without having to re-do the full wizard, so that the data stays accurate as my life changes."**

6. **"When I've been using GiftMind for a while and haven't filled in my country or preferences, I want a gentle reminder (not an interruption) so that I can improve my recommendations at a time that suits me."**

### Success Metrics

| Metric | Target | Baseline | How Measured |
|--------|--------|----------|--------------|
| Activation rate (signup → first recipient added) | ≥60% | ~10% est. | PostHog funnel: `user_signup` → `recipient_created` |
| Time to first recipient (median) | <3 min | Unknown | Event timing: `onboarding_started` → `onboarding_step_3_completed` |
| Onboarding wizard completion rate | ≥70% | 0% (no wizard) | `onboarding_completed` / `onboarding_started` |
| Profile completion rate (full_name + country + 1 recipient) | ≥50% | Unknown | `calculate_profile_completion()` > 60% |
| D1 retention (completed onboarding vs. skipped) | ≥35% vs ≤15% | Unknown | PostHog retention cohort split |
| D7 retention | ≥15% vs ≤7% | Unknown | PostHog retention cohort split |
| Google OAuth onboarding routing fix | 100% of new OAuth signups see wizard | 0% today | `onboarding_started` with `method: 'google'` |

---

## Section 3: User Journey & UX

### 3.1 Entry Points

Every entry into the onboarding flow must be handled explicitly.

#### Entry Point A: New signup via email

**File:** `src/pages/Signup.tsx:148`  
**Current behavior:** After `signUp()` succeeds, `setTimeout(() => navigate("/onboarding"), 2000)`.  
**State on arrival:** User exists in `auth.users` and `public.users`. `has_completed_onboarding = false`, `onboarding_state = null`.  
**Data available:** `full_name` (from signup form), `email`. No country, no recipient.  
**Action needed:** None — routing already works. Extend wizard to collect missing data.

#### Entry Point B: New signup via Google OAuth

**File:** `src/pages/Signup.tsx:159`, `src/pages/Login.tsx:74`  
**Current behavior:** `redirectTo: '/dashboard'` — onboarding entirely skipped.  
**Fix required:**  
```typescript
// src/pages/Signup.tsx — handleGoogleSignup()
// Change redirectTo to '/onboarding' for new users.
// Problem: OAuth redirects to a fixed URL, so we can't know at click-time
// whether this is a new or returning user.
// Solution: Set redirectTo to '/dashboard' but fix the AuthContext SIGNED_IN handler
// to check has_completed_onboarding and redirect accordingly.
```

**Fix in `src/contexts/AuthContext.tsx` (line 41, inside SIGNED_IN handler):**
```typescript
if (event === 'SIGNED_IN' && session) {
  supabase.from("users")
    .select("has_completed_onboarding, active_plan, country, created_at")
    .eq("id", session.user.id)
    .single()
    .then(({ data }) => {
      if (data) {
        // Existing PostHog identification
        const normalizedPlan = normalizePlan(data.active_plan);
        identifyUser(session.user.id, { ... });
        setSentryUser(session.user.id, normalizedPlan);

        // NEW: Route new users to onboarding
        if (!data.has_completed_onboarding) {
          // Only redirect if currently on /dashboard or /
          const currentPath = window.location.pathname;
          if (currentPath === '/dashboard' || currentPath === '/') {
            window.location.replace('/onboarding');
          }
        }
      }
    });
}
```

**State on arrival:** Same as email signup but `full_name` and `avatar_url` populated from Google meta.  
**Data available:** `full_name` (from Google), `email`, `avatar_url`.  

#### Entry Point C: Existing user who skipped previously

**Detection:** User is authenticated, `has_completed_onboarding = false` or `null`.  
**Entry:** Dashboard banner "Complete your profile" → `/onboarding?resume=true`.  
**State on arrival:** May have some recipients already. May have country set.  
**Behavior:** Wizard detects existing data and pre-fills fields. Step 3 skipped if recipient_count > 0.

#### Entry Point D: User invited via referral link

**Detection:** `?ref=ABC123` in URL.  
**Persistence:** Already handled — `sessionStorage.setItem("gm_referral_code", ...)` in `Signup.tsx`.  
**Special behavior on Step 1:** Show "🎉 You were referred by [code]! You'll get 5 free credits instead of 3." banner below the value prop.  
**Implementation:** Read `sessionStorage.getItem("gm_referral_code")` in `Step1Welcome.tsx`.

#### Entry Point E: Direct navigation to /onboarding after completion

If user navigates to `/onboarding` after `has_completed_onboarding = true`, redirect them to `/dashboard`. This is already implemented in the current `Onboarding.tsx` (`useEffect` on line 102–115 checks and redirects).

---

### 3.2 The 5-Step Onboarding Wizard

The wizard replaces the current 3-step slideshow. The new structure:

| Step | Name | Purpose | Data Collected |
|------|------|---------|----------------|
| 1 | Welcome | Set expectations, show value prop | None |
| 2 | Gifting Context | Understand who the user gifts for | `audience[]` |
| 3 | First Person | Get one recipient into the system | Recipient row |
| 4 | About You | Confirm name + country, get birthday | `full_name`, `country`, `birthday` |
| 5 | You're All Set | Celebrate, CTA to first gift | None |

#### Progress Indicator

5 dots, top-center of card. Active dot is wider (pill shape). Back/Next navigation. Dot click is NOT supported (would allow jumping ahead before saving data).

```
● ─ ○ ─ ○ ─ ○ ─ ○    (Step 1 active)
○ ─ ● ─ ○ ─ ○ ─ ○    (Step 2 active)
```

---

#### Step 1: Welcome & Value Prop

```
┌─────────────────────────────────────────────────────┐
│                    [skip]              (top right)  │
│                                                     │
│          ┌────────────────────┐                     │
│          │  🎁  (bouncing)    │   ← GiftBoxAnim     │
│          └────────────────────┘    (reuse existing) │
│                                                     │
│       Welcome, Pratik! 👋                            │
│                                                     │
│   Stop second-guessing. GiftMind tells you WHY      │
│   a gift is right — and where to buy it locally.   │
│                                                     │
│   ┌──────────────────────────────────────────────┐  │
│   │  ① Tell us about the people you care about  │  │
│   │  ② Pick an occasion you're planning for     │  │
│   │  ③ Get 3 gift ideas with confidence scores  │  │
│   └──────────────────────────────────────────────┘  │
│                                                     │
│   🪙 You already have 3 free credits!               │
│                                                     │
│   [Referral banner if ?ref= detected]               │
│   🎉 Referred by a friend: you get 5 credits        │
│                                                     │
│              [ Let's Set Up My Account → ]          │
│                                                     │
│  ● ─ ○ ─ ○ ─ ○ ─ ○                                 │
└─────────────────────────────────────────────────────┘
```

**Purpose:** Orient the user, surface the credits they already have, earn 30 seconds of attention.  
**Required fields:** None.  
**Skip behavior:** Skip button (top-right) → jumps to Step 5 (Complete), marks all steps as skipped in `onboarding_state`.  
**Back button:** None (first step).  
**Next:** "Let's Set Up My Account →" → Step 2.  

**Personalization:** Read `user?.user_metadata?.full_name` from `useAuth()`. If blank (some Google accounts return email prefix), show "Welcome!" without a name. Do not block on this.

**Credits display:** Read `credits_balance` from a quick Supabase query on mount. Show actual balance (usually 3, or 5 if referral).

---

#### Step 2: Gifting Context — Who Do You Gift For?

```
┌─────────────────────────────────────────────────────┐
│                    [skip]                            │
│                                                     │
│   Who do you usually buy gifts for?                 │
│   (select all that apply)                           │
│                                                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │ 👨‍👩‍👧‍👦 Family │  │ 👫 Friends│  │ 💑 Partner│         │
│   └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │ 💼 Work  │  │ 👶 Kids  │  │ 🌐 Online│         │
│   └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│   Selected chips show filled/highlighted state      │
│                                                     │
│   ← Back          Step 2 of 5       [ Next → ]      │
│  ○ ─ ● ─ ○ ─ ○ ─ ○                                 │
└─────────────────────────────────────────────────────┘
```

**Purpose:** Understand the user's gifting universe for future personalization, occasion prompts, and content targeting.  
**Options (multi-select chips):**
```typescript
const AUDIENCE_OPTIONS = [
  { value: "family",    label: "Family",    emoji: "👨‍👩‍👧‍👦" },
  { value: "friends",   label: "Friends",   emoji: "👫" },
  { value: "partner",   label: "Partner",   emoji: "💑" },
  { value: "work",      label: "Work",      emoji: "💼" },
  { value: "kids",      label: "Kids",      emoji: "👶" },
  { value: "online",    label: "Online Friends", emoji: "🌐" },
] as const;
```
**Required:** No — zero selections is valid (stored as `[]`).  
**Skip behavior:** Skip button advances to Step 3. `audience` saved as `[]`.  
**Validation:** Max 6 selections (all available). No minimum.  
**Storage:** `onboarding_state.audience` jsonb field (not a separate column).  
**Persistence:** Save to DB when "Next →" is clicked, not on chip toggle (reduces write frequency).  
**Back:** Goes to Step 1.

---

#### Step 3: Add Your First Person

```
┌─────────────────────────────────────────────────────┐
│                    [skip]                            │
│                                                     │
│   Who's first on your gift list?                    │
│   Add one person now — takes 30 seconds.            │
│                                                     │
│   Name *                                            │
│   [ ________________________________ ]              │
│                                                     │
│   Relationship                                      │
│   [ Partner ▾ ]  (dropdown from RELATIONSHIP_TYPES) │
│                                                     │
│   What are they into? (optional, up to 5 tags)      │
│   [ Reading ] [ Cooking ] [+ Add ]                  │
│   Suggestions: Tech  Fashion  Travel  Music  Art    │
│                                                     │
│   ⚡ You can add full details (age, notes, country) │
│      on the People page later.                      │
│                                                     │
│   ← Back          Step 3 of 5       [ Next → ]      │
│  ○ ─ ○ ─ ● ─ ○ ─ ○                                 │
└─────────────────────────────────────────────────────┘
```

**Purpose:** Get at least one recipient into the system, which unlocks the core gift flow.  
**Fields:**

| Field | Required? | Validation | Type |
|-------|-----------|------------|------|
| Name | Yes | Min 2 chars, max 50 chars | text |
| Relationship | No | Must be from `RELATIONSHIP_TYPES` enum | select |
| Interests | No | Max 5 tags, each max 30 chars | string[] |

**Skip behavior:** Skip button → no recipient created, Step 4 next. Store `onboarding_state.skipped_recipient = true`.  
**Condition to skip this step automatically:** If `recipient_count > 0` on the user's account when they reach Step 3, skip it automatically and show: "You already have [N] people saved! We'll go straight to the next step." — advance to Step 4 after 1.5 seconds.  
**Recipient creation:** On "Next →" click, if name field is filled, call:
```typescript
await supabase.from("recipients").insert({
  user_id: user.id,
  name: name.trim(),
  relationship: relationship || null,
  interests: interests.length > 0 ? interests : null,
});
```
If insert fails, show inline error: "Couldn't save [Name]. Continue anyway?" with two buttons: [Retry] [Continue Without Saving].  
**Interests input:** Free-text with suggestions. User types or clicks suggestion chips. Enter/comma adds a tag. Backspace on empty input removes last tag.  
**Imported from constants:** `RELATIONSHIP_TYPES` from `src/components/recipients/constants.ts`, `INTEREST_SUGGESTIONS` from same file.  
**Back:** Goes to Step 2. If recipient was already saved (previous Next press), do NOT delete it on Back — data persists.

---

#### Step 4: About You

```
┌─────────────────────────────────────────────────────┐
│                    [skip]                            │
│                                                     │
│   Almost done — a bit about you                     │
│                                                     │
│   Your name *                                       │
│   [ Pratik Brahmapurkar         ]  (prefilled)      │
│                                                     │
│   Where do you live? *                              │
│   [ 🇮🇳 India                   ▾ ]                 │
│   (auto-detected from browser locale on first load)  │
│                                                     │
│   Your birthday (optional)                          │
│   [ Month ▾ ] [ Day ▾ ] [ Year ▾ ]                 │
│                                                     │
│   What kind of gifts do you usually give?           │
│   (optional, helps personalize your feed)           │
│   ┌──────────────┐  ┌──────────────┐               │
│   │ 💡 Thoughtful │  │ 🔧 Practical │               │
│   └──────────────┘  └──────────────┘               │
│   ┌──────────────┐  ┌──────────────┐               │
│   │ 💎 Extravagant│  │ 😂 Funny    │               │
│   └──────────────┘  └──────────────┘               │
│   ┌──────────────┐  ┌──────────────┐               │
│   │ 🌿 Experience │  │ 🎨 Creative  │               │
│   └──────────────┘  └──────────────┘               │
│                                                     │
│   ← Back          Step 4 of 5       [ Next → ]      │
│  ○ ─ ○ ─ ○ ─ ● ─ ○                                 │
└─────────────────────────────────────────────────────┘
```

**Purpose:** Collect the profile data that directly improves recommendation quality.  
**Fields:**

| Field | Required? | Validation | Default | Stored in |
|-------|-----------|------------|---------|-----------|
| full_name | Yes | Min 2 chars, max 100 | From `user_metadata.full_name` | `users.full_name` |
| country | Yes | Must be from `COUNTRY_OPTIONS` | Auto-detect from `navigator.language` | `users.country` |
| birthday | No | Valid date, min age 13, max age 120 | null | `users.birthday` |
| gift_style | No | Array from `GIFT_STYLE_OPTIONS`, max 3 | [] | `users.onboarding_state.gift_style` |

**Country auto-detection:**
```typescript
function detectCountryFromLocale(): string {
  const locale = navigator.language || 'en-US';
  const region = new Intl.Locale(locale).region;
  const match = COUNTRY_OPTIONS.find(c => c.value === region);
  return match?.value ?? 'US';
}
```
Show detected country pre-selected but allow user to change.

**Gift style options:**
```typescript
const GIFT_STYLE_OPTIONS = [
  { value: "thoughtful",   label: "Thoughtful",   emoji: "💡" },
  { value: "practical",    label: "Practical",    emoji: "🔧" },
  { value: "extravagant",  label: "Extravagant",  emoji: "💎" },
  { value: "funny",        label: "Funny",        emoji: "😂" },
  { value: "experience",   label: "Experiences",  emoji: "🌿" },
  { value: "creative",     label: "Creative",     emoji: "🎨" },
] as const;
```

**Skip behavior:** Skip button → `full_name` and `country` saved from whatever is currently in DB (may already exist from Google OAuth meta). `birthday` and `gift_style` stay null/[].  
**Validation on Next:**
- `full_name` empty → red outline, "Please enter your name"
- `country` empty → red outline, "Please select your country"  
- `birthday` partial (month but no day) → red outline, "Please enter a complete birthday or leave it blank"

**Birthday field:** Three separate selects (Month/Day/Year), not a date picker. Date pickers are broken on mobile and confusing for international users.

**Save on Next:**
```typescript
await supabase.from("users").update({
  full_name: fullName,
  country,
  birthday: birthday || null,
  updated_at: new Date().toISOString(),
}).eq("id", user.id);
// save gift_style to onboarding_state — see Section 5.2
```

---

#### Step 5: You're All Set!

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│          🎉 (confetti animation fires)              │
│                                                     │
│       You're all set, Pratik!                        │
│                                                     │
│   ✅ [Aarav] added to your people                   │
│      ↑ only shown if Step 3 was completed           │
│                                                     │
│   ✅ 3 credits ready — no card needed               │
│   ✅ Store links matched to 🇮🇳 India               │
│      ↑ uses country from Step 4                     │
│                                                     │
│         [ 🎁 Find a Gift for Aarav → ]              │
│              ↑ deep-links to gift-flow              │
│              with Aarav pre-selected                │
│                                                     │
│              [ Go to Dashboard ]                    │
│                                                     │
│  ○ ─ ○ ─ ○ ─ ○ ─ ●                                 │
└─────────────────────────────────────────────────────┘
```

**Purpose:** Celebrate completion, convert energy into immediate action.  
**Confetti:** Use existing `canvas-confetti` package (already imported in `Signup.tsx`).  
**Personalization:**
- Show recipient name from Step 3 if added: "Find a Gift for [Name] →"
- If Step 3 was skipped, show: "Find a Gift →" (routes to `/gift-flow` without pre-selection)
- Country flag shown if `country` was set in Step 4

**Primary CTA:** "Find a Gift for [Name] →" → navigates to `/gift-flow` (recipient pre-selected if added)  
**Secondary CTA:** "Go to Dashboard" → navigates to `/dashboard`  
**On render:** Call `complete()` which sets `has_completed_onboarding = true`, updates `onboarding_state.status = 'completed'`, fires `onboarding_completed` PostHog event. See Section 5.2 for bonus credit logic.  
**No skip button on Step 5** — user is already done.

---

### 3.3 Skip Behavior

Skip is always available, never punished.

**Skip button:** Top-right of card on Steps 1–4. Step 5 has no skip (it's the end).

**What "Skip" does at each step:**

| Step | Skip Action | Side Effect |
|------|------------|-------------|
| Step 1 | Jump to Step 5 | `onboarding_state.skipped_steps = [1,2,3,4]` |
| Step 2 | Advance to Step 3 | `audience = []` |
| Step 3 | Advance to Step 4 | No recipient created. `skipped_recipient = true` |
| Step 4 | Advance to Step 5 | `full_name`/`country` save with current DB values (may be null) |

**Skip ≠ abandon.** Skip advances to the next step (or completion). The user still sees Step 5 and completes the flow. This maximizes `onboarding_completed` event fires while collecting as much data as possible.

**Dashboard nudge after skip:** If profile completion < 60% after wizard, show banner (see Section 4.5).

---

### 3.4 Resume Logic

If a user closes the browser mid-wizard (after Step 2 but before Step 5), their progress is stored in `users.onboarding_state`. On next login:

**Detection in `Onboarding.tsx` `useEffect`:**
```typescript
const { data } = await supabase
  .from("users")
  .select("has_completed_onboarding, onboarding_state")
  .eq("id", user.id)
  .single();

if (data?.has_completed_onboarding) {
  navigate("/dashboard", { replace: true });
  return;
}

const state = data?.onboarding_state as OnboardingState | null;
if (state?.status === 'in_progress' && state.current_step > 1) {
  // Show resume dialog
  setShowResumeDialog(true);
  setResumeStep(state.current_step);
} else {
  setLoading(false); // Start from Step 1
}
```

**Resume dialog:**
```
┌─────────────────────────────────────┐
│  Pick up where you left off?        │
│                                     │
│  You were on Step 3 (Add a Person). │
│                                     │
│  [ Continue →  ]  [ Start Over ]    │
└─────────────────────────────────────┘
```

"Continue" → load `state.current_step`, pre-fill any saved field values from `onboarding_state`.  
"Start Over" → reset `onboarding_state` to defaults, start from Step 1.

**State persistence trigger:** Save to DB on every "Next →" or "Back" click — not on every keystroke. Debounce is not needed because transitions happen on explicit navigation.

---

### 3.5 Profile Page: Post-Onboarding Editing

`src/pages/Profile.tsx` (already exists, needs additions)

```
┌─────────────────────────────────────────────────────┐
│  Your Profile                                        │
│                                                     │
│  ┌── Avatar ──┐                                     │
│  │  [PB]  📷  │   Pratik Brahmapurkar               │
│  └────────────┘   pbrahmapurkar@gmail.com           │
│                   Member since April 2026           │
│                   🎁 8 gifts chosen                 │
│                                                     │
│  Profile Completion                                 │
│  [▓▓▓▓▓▓▓▓░░]  80%                                  │
│  Complete: birthday · gifting preferences           │
│                                                     │
│  ── Basic Info ──────────────────────────────────── │
│  Full Name      [ Pratik Brahmapurkar    ]          │
│  Country        [ 🇮🇳 India              ▾ ]        │
│  Birthday       [ Jan ▾ ] [ 15 ▾ ] [ 1990 ▾ ]      │
│                 (optional — used for reminders)     │
│                                                     │
│  ── Gifting Preferences ──────────────────────────  │
│  Who you gift for                                   │
│  [Family ✓] [Friends ✓] [Partner] [Work] [Kids]    │
│                                                     │
│  Gift style                                         │
│  [Thoughtful ✓] [Practical] [Extravagant] ...       │
│                                                     │
│  ── Account ─────────────────────────────────────── │
│  Email          pbrahmapurkar@gmail.com             │
│                 (from Google — cannot be changed)   │
│  Connected via  🔗 Google                           │
│  Language       [ English     ▾ ]                   │
│                                                     │
│  ── Referrals ───────────────────────────────────── │
│  [existing referral section — unchanged]            │
│                                                     │
│  ── Danger Zone ─────────────────────────────────── │
│  [ Delete Account ]                                 │
│                                                     │
│                          [ Save Changes ]           │
└─────────────────────────────────────────────────────┘
```

**Editable fields:** `full_name`, `country`, `birthday`, `audience` (from onboarding_state), `gift_style` (from onboarding_state), `language`.  
**Read-only fields:** `email` (from auth provider), `connected_via` (derived from auth metadata), `created_at`.  
**Avatar:** Already functional. User can upload via camera icon. In v1, Google avatar is used as default but can be overridden.  
**Profile completion bar:** Calls `calculateProfileCompletion()` (local version of the DB function for immediate display). Updates on every save.  
**Save behavior:** Single "Save Changes" button saves all dirty fields in one update. Disable button while saving. Show `toast.success("Profile saved!")` on success (existing pattern). Show `toast.error("Failed to save. Please try again.")` on failure.  
**Country change side effect:** None in v1. In v2+, could trigger re-fetching marketplace configs. For now, just save.  
**Birthday validation (profile page):** Same as Step 4 — three selects, complete or empty (not partial). Min age: 13. Max: 120.  
**Language field:** Keep existing `language` selector — adds no new behavior.

---

## Section 4: Logic & State Management

### 4.1 State Machine

```
                      ┌─────────────────┐
  New user lands ──►  │   NOT_STARTED   │
                      └────────┬────────┘
                               │  Onboarding.tsx mounts
                               ▼
                      ┌─────────────────┐
                      │   IN_PROGRESS   │◄───────────────────┐
                      │  current_step:1 │                    │
                      └────────┬────────┘                    │
                               │                             │ Resume
                    ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─             │
                   │           │ Next press   │             │
                    ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─             │
                               │                    ┌───────┴──────┐
                               │ (step 1 → 4)       │   ABANDONED  │
                               │                    │ browser close│
                               ▼                    │ mid-wizard   │
                      ┌─────────────────┐           └──────────────┘
                      │   COMPLETING    │
                      │  (Step 5 shown) │
                      └────────┬────────┘
                               │  complete() fires
                               ▼
                      ┌─────────────────┐
                      │    COMPLETED    │
                      │  → /dashboard   │
                      └─────────────────┘

  Any step → OPTED_OUT if user clicks "Skip" on Step 1
  (jumps directly to Step 5, marks status = 'opted_out')
```

**State values for `onboarding_state.status`:**

| Value | When Set | Meaning |
|-------|----------|---------|
| `not_started` | User row created, wizard not yet seen | Default |
| `in_progress` | User clicked "Let's Set Up" on Step 1 | Wizard active |
| `abandoned` | No DB update needed — detected by `status = in_progress` + staleness | Closed mid-wizard |
| `opted_out` | Clicked Skip on Step 1 | Jumped to completion |
| `completed` | Step 5 rendered, `complete()` called | Done |

**Note:** `abandoned` is not written to DB — it is the implicit state when `status = 'in_progress'` and `has_completed_onboarding = false`. On resume, we read the `current_step` and restore.

---

### 4.2 Data Collection Flow

Every field, where it comes from, and where it goes.

| Field | Step | Required? | Validation | Default | Stored In |
|-------|------|-----------|------------|---------|-----------|
| `full_name` | 4 | Yes | Min 2, max 100 chars | Google meta / signup form | `users.full_name` |
| `country` | 4 | Yes | From `COUNTRY_OPTIONS` | Browser locale detection | `users.country` |
| `birthday` | 4 | No | Complete or null; age 13–120 | null | `users.birthday` |
| `audience` | 2 | No | Array of `AUDIENCE_OPTIONS` values | [] | `users.onboarding_state.audience` |
| `gift_style` | 4 | No | Max 3 from `GIFT_STYLE_OPTIONS` | [] | `users.onboarding_state.gift_style` |
| First recipient `name` | 3 | No | Min 2, max 50 | — | `recipients.name` |
| First recipient `relationship` | 3 | No | From enum | null | `recipients.relationship` |
| First recipient `interests` | 3 | No | Max 5 tags, 30 chars each | [] | `recipients.interests` |
| `current_step` | 1–5 | n/a | 1–5 | 1 | `users.onboarding_state.current_step` |
| `status` | varies | n/a | enum | `not_started` | `users.onboarding_state.status` |
| `completed_steps` | varies | n/a | array of step numbers | [] | `users.onboarding_state.completed_steps` |
| `skipped_steps` | varies | n/a | array of step numbers | [] | `users.onboarding_state.skipped_steps` |
| `started_at` | Step 1 | n/a | ISO timestamp | null | `users.onboarding_state.started_at` |
| `completed_at` | Step 5 | n/a | ISO timestamp | null | `users.onboarding_state.completed_at` |

**Write strategy:** Write to DB on every step completion (Next press). Use a single update call per step transition. Do not write on every keystroke. This creates at most 4 DB writes during the wizard.

---

### 4.3 Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | User completes Step 3 (recipient saved), then presses Back | Recipient remains in DB. Step 2 shown. No delete on Back. |
| 2 | User's Google `full_name` is their email prefix ("john.doe") | Step 4 pre-fills the email prefix. Validation (min 2 chars) passes — user can leave it or fix it. |
| 3 | Google `full_name` contains no space (single name "Aarav") | `initials` logic handles — shows "A". Wizard works normally. |
| 4 | User presses browser Back button on Step 3 | `handleBrowserBack` listener detects; triggers Step 2 animation. Unsaved recipient form data is discarded. |
| 5 | User signs up via referral link but referral processing fails | Wizard still proceeds. `toast.error` for referral failure is shown non-blocking. Credits default to 3. |
| 6 | `recipient_count > 0` when user reaches Step 3 | Skip Step 3 automatically; show "You already have people saved!" message; advance after 1500ms. |
| 7 | User tries to add recipient with 1-char name | Validation blocks: "Name must be at least 2 characters". |
| 8 | DB write fails on Step 4 Next press | Show inline error toast. Keep wizard on Step 4. Retry button. Data not lost from local state. |
| 9 | Browser locale detection returns an unsupported country code | Fall back to "US". Country picker shows US pre-selected but fully editable. |
| 10 | User refreshes browser mid-wizard (e.g. on Step 3) | On remount, `onboarding_state.current_step = 3` loaded from DB; resume dialog shown: "Continue from Step 3?" |
| 11 | User has two tabs open simultaneously | Both tabs call the same DB endpoints. Last-write wins. On tab switch, state re-fetched from DB. |
| 12 | User selects birthday Month + Day but leaves Year blank | "Please complete all birthday fields or leave them all blank." Three-select validation check. |
| 13 | Google OAuth user signs in (not new — has_completed_onboarding = true) | AuthContext SIGNED_IN handler checks flag; does NOT redirect to onboarding. Normal dashboard load. |
| 14 | User exists but `onboarding_state` column is null (pre-migration user) | `onboarding_state ?? defaultOnboardingState` — treated as not_started. Wizard starts from Step 1. |
| 15 | Step 3 recipient insert is too slow (network lag) | Show spinner on "Next →" button while insert is in flight. Do not navigate until insert resolves or fails. |

---

### 4.4 Incentive Logic

**Option A: No bonus credits (recommended for v1)**  
Onboarding is its own reward — the user adds a recipient they can immediately use. This avoids the complexity of a service-role Edge Function and doesn't create expectations that "more profile completions = more credits" (which would be exploitable).

**Option B: Bonus 3 credits on completion (available via feature flag)**  
If `VITE_ONBOARDING_BONUS_ENABLED=true`:
1. Step 5 triggers `supabase.functions.invoke("complete-onboarding")`
2. Edge Function verifies `onboarding_bonus_granted = false`
3. Inserts `credit_transactions` row: `type='onboarding_bonus', amount=3`
4. Updates `users.credits_balance += 3`
5. Sets `users.onboarding_bonus_granted = true`
6. Returns `{ credits_granted: 3 }`
7. Step 5 shows "🎁 +3 bonus credits added!" banner

**Abuse prevention:** `onboarding_bonus_granted` boolean column (one-time flag). Edge Function checks before granting. Idempotent — calling twice grants nothing the second time.

**Recommendation:** Start with Option A. Enable Option B at D30 if completion rates are below 50%.

---

### 4.5 Profile Completion Calculation

Profile completion % drives the Dashboard banner visibility.

**Scoring breakdown:**

| Condition | Points |
|-----------|--------|
| `full_name` not null and length ≥ 2 | 20 |
| `country` not null | 20 |
| At least 1 recipient in `recipients` table | 25 |
| `onboarding_state.audience` array length > 0 | 15 |
| `birthday` not null | 10 |
| `onboarding_state.gift_style` array length > 0 | 10 |
| **Total** | **100** |

**Computed:** Both as a SQL function (`calculate_profile_completion`) for backend use, and as a TypeScript function in `src/features/onboarding/hooks/useProfileCompletion.ts` for frontend display. Keep both in sync.

```typescript
// src/features/onboarding/hooks/useProfileCompletion.ts
export function calculateProfileCompletion(params: {
  full_name: string | null;
  country: string | null;
  birthday: string | null;
  recipient_count: number;
  audience: string[];
  gift_style: string[];
}): number {
  let score = 0;
  if (params.full_name && params.full_name.length >= 2) score += 20;
  if (params.country) score += 20;
  if (params.recipient_count >= 1) score += 25;
  if (params.audience.length > 0) score += 15;
  if (params.birthday) score += 10;
  if (params.gift_style.length > 0) score += 10;
  return Math.min(score, 100);
}
```

**Dashboard banner:** Show if `completion < 100%` AND user has NOT dismissed it in the last 7 days (localStorage key: `gm_dismissed_profile_banner_ts`).

```
┌──────────────────────────────────────────────────────┐
│ 📋 Complete your profile to get better gift ideas    │
│ [▓▓▓▓▓▓░░░░░░] 55%   [ Finish Setup → ]  [ × ]      │
└──────────────────────────────────────────────────────┘
```

Dismiss behavior:
1. User clicks `×` → store `localStorage.setItem("gm_dismissed_profile_banner_ts", Date.now())`.
2. On Dashboard mount: if `Date.now() - stored_ts < 7 * 24 * 60 * 60 * 1000`, hide banner.
3. Re-shown after 7 days if still incomplete.
4. If completion reaches 100%, never show banner again (check completion first).

**Re-prompt logic:** Show banner again (ignoring dismiss) on the user's 2nd and 5th login if profile < 80%. Tracked via `sessionStorage.getItem("gm_session_count")` — incremented on each `SIGNED_IN` event.

---

## Section 5: System Design & Backend

### 5.1 Database Schema

All changes go in a new migration file: `supabase/migrations/20260501000700_add_onboarding_profile_fields.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Add onboarding and profile fields to users table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_completion_percentage integer NOT NULL DEFAULT 0
    CHECK (profile_completion_percentage >= 0 AND profile_completion_percentage <= 100),
  ADD COLUMN IF NOT EXISTS onboarding_bonus_granted boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update handle_new_user to initialize onboarding_state
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id, email, full_name, avatar_url, referral_code,
    credits_balance, active_plan, onboarding_state
  )
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    3,
    'spark',
    jsonb_build_object(
      'status', 'not_started',
      'current_step', 1,
      'completed_steps', '[]'::jsonb,
      'skipped_steps', '[]'::jsonb,
      'audience', '[]'::jsonb,
      'gift_style', '[]'::jsonb,
      'skipped_recipient', false,
      'started_at', null,
      'completed_at', null
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    avatar_url = CASE
      WHEN public.users.avatar_url IS NULL OR public.users.avatar_url = ''
      THEN EXCLUDED.avatar_url
      ELSE public.users.avatar_url
    END,
    onboarding_state = CASE
      WHEN public.users.onboarding_state IS NULL
      THEN EXCLUDED.onboarding_state
      ELSE public.users.onboarding_state
    END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Profile completion function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_profile_completion(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_score integer := 0;
  v_user record;
  v_recipient_count integer;
  v_audience_len integer;
  v_style_len integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF v_user IS NULL THEN RETURN 0; END IF;

  -- Name: 20 points
  IF v_user.full_name IS NOT NULL AND length(trim(v_user.full_name)) >= 2 THEN
    v_score := v_score + 20;
  END IF;

  -- Country: 20 points
  IF v_user.country IS NOT NULL AND v_user.country != '' THEN
    v_score := v_score + 20;
  END IF;

  -- Recipient: 25 points
  SELECT count(*) INTO v_recipient_count
    FROM public.recipients WHERE user_id = p_user_id;
  IF v_recipient_count >= 1 THEN v_score := v_score + 25; END IF;

  -- Audience: 15 points
  v_audience_len := COALESCE(
    jsonb_array_length(v_user.onboarding_state->'audience'), 0);
  IF v_audience_len > 0 THEN v_score := v_score + 15; END IF;

  -- Birthday: 10 points
  IF v_user.birthday IS NOT NULL THEN v_score := v_score + 10; END IF;

  -- Gift style: 10 points
  v_style_len := COALESCE(
    jsonb_array_length(v_user.onboarding_state->'gift_style'), 0);
  IF v_style_len > 0 THEN v_score := v_score + 10; END IF;

  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.calculate_profile_completion(uuid)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger to keep profile_completion_percentage denormalized (fast reads)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_profile_completion()
RETURNS trigger AS $$
BEGIN
  NEW.profile_completion_percentage :=
    public.calculate_profile_completion(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_completion_on_user_update ON public.users;
CREATE TRIGGER sync_profile_completion_on_user_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_completion();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: allow users to update only their own safe fields
-- Users cannot update credits_balance, role, or onboarding_bonus_granted
-- via the profile update path (those require service role)
-- ─────────────────────────────────────────────────────────────────────────────

-- The existing update policy likely allows full column access.
-- We add a more restrictive policy for onboarding_bonus_granted:
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent self-granting bonus
    AND onboarding_bonus_granted = (
      SELECT onboarding_bonus_granted FROM public.users WHERE id = auth.uid()
    )
    -- Prevent self-modifying credits
    AND credits_balance = (
      SELECT credits_balance FROM public.users WHERE id = auth.uid()
    )
    -- Prevent self-promoting role
    AND role = (
      SELECT role FROM public.users WHERE id = auth.uid()
    )
  );
```

**Why `onboarding_state` is jsonb:**
- Avoids schema migrations every time we add a new onboarding step or preference field
- All onboarding-specific data lives in one column; profile page reads/writes individual keys
- PostgreSQL jsonb supports partial updates via `jsonb_set()` — no need to overwrite entire object
- Easy to extend: add `gift_style`, `audience`, new step data without a migration

**Why `profile_completion_percentage` is a trigger-maintained column:**
- Dashboard queries need to show banner without calling a separate function per request
- A plain column is O(1) to read; a function call requires joining recipients table
- Kept in sync automatically on every user row update

---

### 5.2 API Contracts

All onboarding writes can be done directly with the Supabase JS client (user RLS). The only exception is the bonus credit grant (requires service role).

#### Direct Client Operations (no Edge Function needed)

**Save onboarding step data (Steps 2–4):**
```typescript
// Step 2: audience
await supabase.from("users").update({
  onboarding_state: supabase.rpc("jsonb_set_nested", ...) // see below
}).eq("id", user.id);

// Simpler: read current state, merge, write back
const { data } = await supabase
  .from("users")
  .select("onboarding_state")
  .eq("id", user.id)
  .single();

const newState = {
  ...(data?.onboarding_state ?? defaultOnboardingState),
  audience: selectedAudience,
  current_step: 3,
  completed_steps: [...completedSteps, 2],
};

await supabase.from("users")
  .update({ onboarding_state: newState })
  .eq("id", user.id);
```

**Mark onboarding complete:**
```typescript
await supabase.from("users").update({
  has_completed_onboarding: true,
  onboarding_state: {
    ...currentState,
    status: 'completed',
    completed_at: new Date().toISOString(),
  },
}).eq("id", user.id);
```

**Update profile (Profile page):**
```typescript
await supabase.from("users").update({
  full_name: fullName,
  country,
  birthday: birthday || null,
  language,
  onboarding_state: {
    ...currentState,
    audience: selectedAudience,
    gift_style: selectedStyle,
  },
  updated_at: new Date().toISOString(),
}).eq("id", user.id);
```

#### Edge Function: `complete-onboarding`

Only needed if `VITE_ONBOARDING_BONUS_ENABLED=true`.

**Location:** `supabase/functions/complete-onboarding/index.ts`

**Request:**
```typescript
POST /functions/v1/complete-onboarding
Authorization: Bearer <user_jwt>
Content-Type: application/json
{}
```

**Response:**
```typescript
// Success
{
  success: true,
  credits_granted: 3,    // or 0 if already granted
  new_balance: 6,
  onboarding_status: 'completed'
}

// Already granted
{
  success: true,
  credits_granted: 0,
  message: 'Bonus already granted'
}

// Error
{ error: 'UNAUTHORIZED' }   // 401
{ error: 'USER_NOT_FOUND' } // 404
{ error: 'INTERNAL_ERROR' } // 500
```

**Logic:**
```typescript
// supabase/functions/complete-onboarding/index.ts
import { createClient } from "@supabase/supabase-js";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });

  // Service-role client for privileged writes
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("credits_balance, onboarding_bonus_granted, onboarding_state")
    .eq("id", user.id)
    .single();

  if (!profile) return new Response(JSON.stringify({ error: 'USER_NOT_FOUND' }), { status: 404 });

  let creditsGranted = 0;

  if (!profile.onboarding_bonus_granted) {
    const BONUS = 3;
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: user.id,
      type: 'onboarding_bonus',
      amount: BONUS,
      description: 'Onboarding completion bonus',
    });

    await supabaseAdmin.from("users").update({
      credits_balance: (profile.credits_balance ?? 0) + BONUS,
      onboarding_bonus_granted: true,
      has_completed_onboarding: true,
      onboarding_state: {
        ...(profile.onboarding_state ?? {}),
        status: 'completed',
        completed_at: new Date().toISOString(),
      },
    }).eq("id", user.id);

    creditsGranted = BONUS;
  } else {
    // Already granted — just mark completed
    await supabaseAdmin.from("users").update({
      has_completed_onboarding: true,
    }).eq("id", user.id);
  }

  return new Response(JSON.stringify({
    success: true,
    credits_granted: creditsGranted,
    new_balance: (profile.credits_balance ?? 0) + creditsGranted,
    onboarding_status: 'completed',
  }), { status: 200 });
});
```

---

### 5.3 Analytics Events (PostHog)

Every interaction fires a PostHog event. All events use `trackEvent` from `src/lib/posthog.ts`.

| Event Name | Properties | When Fired |
|-----------|------------|------------|
| `onboarding_started` | `method: 'email'\|'google', has_referral: bool` | Step 1 first render |
| `onboarding_step_viewed` | `step: 1–5` | Each step component mounts |
| `onboarding_step_completed` | `step: 1–5, duration_ms: number, was_skipped: bool` | Next click or skip on each step |
| `onboarding_completed` | `total_duration_ms, skipped_steps: number[], audience: string[], has_recipient: bool, completion_pct: number` | `complete()` called in Step 5 |
| `onboarding_skipped` | `from_step: 1–4` | Skip button click on any step (full skip from Step 1) |
| `onboarding_resumed` | `resumed_from_step: number` | User clicks "Continue" in resume dialog |
| `profile_updated` | `fields_changed: string[], completion_before: number, completion_after: number` | Profile page "Save Changes" success |
| `profile_banner_shown` | `completion_percentage: number, session_number: number` | Banner renders on Dashboard |
| `profile_banner_dismissed` | `completion_percentage: number` | Banner × click |
| `profile_banner_clicked` | `completion_percentage: number` | Banner "Finish Setup →" click |

**Implementation helper:**
```typescript
// src/features/onboarding/hooks/useOnboardingAnalytics.ts
import { trackEvent } from "@/lib/posthog";

export function useOnboardingAnalytics() {
  const stepStartTime = useRef<number>(Date.now());

  const trackStepViewed = (step: number) => {
    stepStartTime.current = Date.now();
    trackEvent('onboarding_step_viewed', { step });
  };

  const trackStepCompleted = (step: number, wasSkipped = false) => {
    trackEvent('onboarding_step_completed', {
      step,
      duration_ms: Date.now() - stepStartTime.current,
      was_skipped: wasSkipped,
    });
  };

  return { trackStepViewed, trackStepCompleted };
}
```

---

### 5.4 Security & RLS

The new `users_update_own` policy (in migration above) prevents users from granting themselves credits, changing their role, or setting `onboarding_bonus_granted = true` via a direct update. Bonus credit grant MUST go through the `complete-onboarding` Edge Function which uses the service role key.

**Fields safe to update via client:** `full_name`, `country`, `birthday`, `language`, `avatar_url`, `onboarding_state`, `has_completed_onboarding`, `notification_prefs`, `updated_at`.  
**Fields requiring service role:** `credits_balance`, `role`, `onboarding_bonus_granted`, `active_plan`.

**`onboarding_state` injection risk:** A malicious client could set `onboarding_state` to arbitrary JSON. This is acceptable — the `onboarding_state` field is informational only and does not gate credits or features. No server-side logic should trust `onboarding_state` for security decisions.

---

### 5.5 Error Handling

Every failure point has a defined behavior.

| Failure | User-Facing Behavior | Technical Behavior |
|---------|---------------------|-------------------|
| Network timeout on Step 4 save | "Couldn't save. Retrying…" toast + auto-retry (3x, 1s intervals) | Local state preserved; retries via `retryWithBackoff()` helper |
| DB error creating recipient (Step 3) | Inline: "Couldn't save [Name]. Continue without saving?" [Retry] [Continue] | If Continue: `skipped_recipient = true`, advance. If Retry: re-attempt insert. |
| Bonus grant Edge Function fails | Show Step 5 success anyway; log error | Background retry is NOT done — bonus is non-critical. `onboarding_bonus_granted` stays false; user can re-trigger by navigating to profile. |
| `calculate_profile_completion` returns wrong % | Banner shows stale %; user sees inconsistency | The trigger-maintained column should always be accurate after any update. If stale: refresh on next profile save. |
| Google OAuth SIGNED_IN fires but no users row yet | `has_completed_onboarding` query returns null | Treat null as `false` — route to onboarding. Handle in AuthContext null check. |
| Step 3 recipient insert succeeds but Next press navigates anyway | Duplicate recipient on retry | Use `skipDuplicates: true` in insert options, or check recipient_count before inserting. |
| User submits partial birthday (month only) | Validation blocks | "Please complete all birthday fields or clear them all." |
| Profile page save with `full_name = ""` | Validation blocks | "Name cannot be empty." — disable Save button if name field is blank. |

---

## Section 6: Component Breakdown

### File Tree

```
src/features/onboarding/
├── OnboardingFlow.tsx
├── OnboardingLayout.tsx
├── steps/
│   ├── Step1Welcome.tsx
│   ├── Step2Audience.tsx
│   ├── Step3FirstRecipient.tsx
│   ├── Step4AboutYou.tsx
│   └── Step5Complete.tsx
├── components/
│   ├── ProgressDots.tsx
│   ├── SkipButton.tsx
│   ├── AudienceChip.tsx
│   ├── GiftStyleChip.tsx
│   ├── InterestTagInput.tsx
│   ├── BirthdayPicker.tsx
│   └── ProfileCompletionBanner.tsx
├── hooks/
│   ├── useOnboarding.ts
│   ├── useProfileCompletion.ts
│   └── useOnboardingAnalytics.ts
└── types/
    └── onboarding.types.ts
```

---

### Types

```typescript
// src/features/onboarding/types/onboarding.types.ts

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'opted_out';

export interface OnboardingState {
  status: OnboardingStatus;
  current_step: 1 | 2 | 3 | 4 | 5;
  completed_steps: number[];
  skipped_steps: number[];
  audience: string[];
  gift_style: string[];
  skipped_recipient: boolean;
  started_at: string | null;
  completed_at: string | null;
}

export const defaultOnboardingState: OnboardingState = {
  status: 'not_started',
  current_step: 1,
  completed_steps: [],
  skipped_steps: [],
  audience: [],
  gift_style: [],
  skipped_recipient: false,
  started_at: null,
  completed_at: null,
};

export type AudienceValue = 'family' | 'friends' | 'partner' | 'work' | 'kids' | 'online';
export type GiftStyleValue =
  | 'thoughtful' | 'practical' | 'extravagant'
  | 'funny' | 'experience' | 'creative';
```

---

### `OnboardingFlow.tsx`

```typescript
interface OnboardingFlowProps {
  // No external props — reads all state from DB on mount
}
```

**Responsibilities:**
- On mount: fetches `has_completed_onboarding` + `onboarding_state` from `users`
- If `has_completed_onboarding = true` → `navigate("/dashboard", { replace: true })`
- If `onboarding_state.current_step > 1` → show `ResumeDialog`
- Manages `currentStep` local state (1–5)
- Manages `direction` for slide animation (1 = forward, -1 = back)
- Passes `onNext`, `onBack`, `onSkip`, `onComplete` handlers to step components
- Wraps step content in `AnimatePresence` + `motion.div` (existing `slideVariants` pattern from `Onboarding.tsx`)
- Browser back button listener: `window.addEventListener('popstate', handleBrowserBack)`
- Keyboard: `ArrowRight` = Next, `ArrowLeft` = Back (accessibility)

**State:**
```typescript
const [currentStep, setCurrentStep] = useState(1);
const [direction, setDirection] = useState(1);
const [loading, setLoading] = useState(true);
const [showResumeDialog, setShowResumeDialog] = useState(false);
const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultOnboardingState);
const [savedRecipientName, setSavedRecipientName] = useState<string | null>(null);
```

---

### `OnboardingLayout.tsx`

**Responsibilities:**
- Renders the outer shell: full-screen gradient background, centered card
- Renders `SkipButton` (top-right)
- Renders `ProgressDots` (bottom of card)
- Accepts `currentStep`, `totalSteps`, `onSkip`, `showSkip` as props

```typescript
interface OnboardingLayoutProps {
  currentStep: number;
  totalSteps: number;
  onSkip: () => void;
  showSkip: boolean; // false on Step 5
  children: ReactNode;
}
```

---

### `ProgressDots.tsx`

```typescript
interface ProgressDotsProps {
  total: number;   // 5
  current: number; // 1-indexed
}
```

Renders: `[● ─ ○ ─ ○ ─ ○ ─ ○]` with Tailwind transitions.  
Active dot: `w-6 h-2 rounded-full bg-primary`  
Inactive dot: `w-2 h-2 rounded-full bg-muted-foreground/30`

---

### `Step1Welcome.tsx`

```typescript
interface Step1WelcomeProps {
  onNext: () => void;
  creditsBalance: number;
  hasReferral: boolean;
  userName: string | null;
}
```

Renders: `GiftBoxAnim` (reused from existing `Onboarding.tsx`), value prop, 3-step list, credits display, referral banner if `hasReferral`, "Let's Set Up My Account →" button.

---

### `Step2Audience.tsx`

```typescript
interface Step2AudienceProps {
  onNext: (selectedAudience: AudienceValue[]) => void;
  onBack: () => void;
  initialValue: AudienceValue[];
}
```

**State:** `const [selected, setSelected] = useState<AudienceValue[]>(initialValue);`  
Toggle logic: if in array → remove; if not → add.  
Renders: grid of `AudienceChip` components + Back/Next nav.

---

### `Step3FirstRecipient.tsx`

```typescript
interface Step3FirstRecipientProps {
  onNext: (recipient: { name: string; relationship: string | null; interests: string[] } | null) => void;
  onBack: () => void;
  shouldAutoSkip: boolean; // recipient_count > 0
}
```

**State:** `name`, `relationship`, `interests`, `saving`, `error`.  
If `shouldAutoSkip`: shows auto-skip message, calls `onNext(null)` after 1500ms.  
Renders: name Input, relationship Select, `InterestTagInput`, Back/Next with spinner state.

---

### `Step4AboutYou.tsx`

```typescript
interface Step4AboutYouProps {
  onNext: (data: {
    full_name: string;
    country: string;
    birthday: string | null;
    gift_style: GiftStyleValue[];
  }) => void;
  onBack: () => void;
  initialValues: {
    full_name: string;
    country: string;
    birthday: string | null;
    gift_style: GiftStyleValue[];
  };
}
```

Renders: name Input, country Select (using `COUNTRY_OPTIONS`), `BirthdayPicker`, gift style chips, validation messages.

---

### `Step5Complete.tsx`

```typescript
interface Step5CompleteProps {
  recipientName: string | null;
  country: string | null;
  creditsBalance: number;
  onFindGift: () => void;
  onDashboard: () => void;
}
```

On mount: fires confetti (`canvas-confetti`), calls `onComplete()` parent handler.  
Renders: celebration content, checklist of what was set up, two CTAs.

---

### `BirthdayPicker.tsx`

```typescript
interface BirthdayPickerProps {
  value: { month: string; day: string; year: string } | null;
  onChange: (value: { month: string; day: string; year: string } | null) => void;
  error?: string;
}
```

Three `Select` components. Validates that all three are filled or none. Converts to `YYYY-MM-DD` ISO string for DB storage.

---

### `InterestTagInput.tsx`

```typescript
interface InterestTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  maxTags: number; // default 5
}
```

Text input + tag chips + suggestion pills below. Enter/comma adds tag. Backspace on empty removes last tag.

---

### `ProfileCompletionBanner.tsx`

```typescript
interface ProfileCompletionBannerProps {
  completionPct: number;
  missingFields: string[]; // e.g. ["birthday", "gifting preferences"]
  onFinishSetup: () => void;
  onDismiss: () => void;
}
```

Rendered in `Dashboard.tsx`, just below the `<h1>` greeting. Only mounts if `shouldShow` (computed in `useProfileCompletion`).

---

### `useOnboarding.ts`

```typescript
interface UseOnboardingReturn {
  onboardingState: OnboardingState;
  loading: boolean;
  saveStep: (step: number, data: Partial<OnboardingState>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  skipToEnd: () => Promise<void>;
}
```

Encapsulates all DB reads/writes for onboarding flow. Called by `OnboardingFlow.tsx`. Returns stable references to avoid re-render loops.

---

### `useProfileCompletion.ts`

```typescript
interface UseProfileCompletionReturn {
  completionPct: number;
  missingFields: string[];
  shouldShowBanner: boolean;
  dismissBanner: () => void;
}
```

Calls `calculateProfileCompletion()` (TypeScript version). Reads/writes localStorage for dismiss state. Used by `Dashboard.tsx` and `Profile.tsx`.

---

## Section 7: Integration Points

### Auth → Onboarding

**Direction:** Auth fires `SIGNED_IN` → AuthContext reads `has_completed_onboarding` → redirects.  
**Fix required:** Add redirect logic to `src/contexts/AuthContext.tsx` SIGNED_IN handler (lines 41–67).  
**Fallback:** If DB query fails, don't redirect — user lands on dashboard. On next navigation to dashboard, onboarding check in `Onboarding.tsx` will catch them.

### Dashboard → Profile Completion Banner

**Direction:** `Dashboard.tsx` queries `users` row including `profile_completion_percentage`, passes to `ProfileCompletionBanner`.  
**Trigger:** On every Dashboard mount, read `profile_completion_percentage` from `supabase.from("users").select("profile_completion_percentage")`.  
**Fallback:** If query fails, hide banner (assume 0 — no banner shown when data is unavailable).

### Onboarding Step 3 → Recipient Management

**Direction:** Step 3 writes directly to `recipients` table. Recipient Management page (`src/pages/MyPeople.tsx`) reads the same table.  
**Contract:** Only `name`, `relationship`, `interests` are set in Step 3. All other fields (age_range, gender, cultural_context, notes) default to null.  
**Conflict:** A race condition exists if user opens My People in another tab while in Step 3. Low probability; acceptable in v1.

### Onboarding → Credits System

**Direction:** `complete-onboarding` Edge Function writes to `credit_transactions` and updates `users.credits_balance`.  
**Trigger:** Step 5 `onComplete` handler calls Edge Function (only if `VITE_ONBOARDING_BONUS_ENABLED=true`).  
**Fallback:** If Edge Function fails, `has_completed_onboarding` is set anyway via direct client update. User loses bonus but is not stuck.

### Signup → Onboarding

**Existing (email):** `Signup.tsx:148` already navigates to `/onboarding` after email signup. No change.  
**Fix (Google):** AuthContext `SIGNED_IN` handler redirects to `/onboarding` for new users with `has_completed_onboarding = false`.

### Profile Page → Onboarding State

**Direction:** Profile page reads `onboarding_state.audience` and `onboarding_state.gift_style` to show pre-filled chips.  
**Write:** Profile save updates these keys within `onboarding_state` jsonb (merge strategy, not replace).  
**Concern:** Profile page currently only selects `select("*")` — this will include the new `birthday` and `onboarding_state` columns without any additional query changes. Cast types may need updating in `Profile.tsx` (currently uses `(profile as any).country`).

### Referral → Onboarding

**Existing:** `Signup.tsx` reads `?ref=` and stores in `sessionStorage`.  
**New:** `Step1Welcome.tsx` reads `sessionStorage.getItem("gm_referral_code")` and shows referred banner if present.  
**No code change needed** beyond adding the read in Step1Welcome.

---

## Section 8: Edge Cases & Error States

### Empty State: Brand New User

**Scenario:** User just signed up. `onboarding_state` is default (`not_started`). No recipients. Credits = 3.  
**UI:** Full 5-step wizard from Step 1. Skip available top-right.

### Loading State: Fetching onboarding_state on mount

```
┌─────────────────────────────────────────────┐
│          (full-screen gradient bg)          │
│                                             │
│   ┌───────────────────────────────────────┐ │
│   │                                       │ │
│   │   [pulse animation skeleton]          │ │
│   │                                       │ │
│   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

Spinner duration: max 3 seconds. If still loading after 3s, show error state.

### Error State: Failed to Load Onboarding State

```
┌─────────────────────────────────────────────┐
│   Something went wrong loading your setup.  │
│                                             │
│   [ Try Again ]   [ Go to Dashboard ]       │
└─────────────────────────────────────────────┘
```

"Try Again" re-fetches. "Go to Dashboard" bypasses onboarding entirely (does not mark as completed).

### Skipped State: User opted out on Step 1

User sees Step 5 immediately. Checklist shows only credits. `skipped_steps = [1, 2, 3, 4]` recorded. Dashboard banner will show.

### Completed State: Returning to /onboarding after completion

`useEffect` on Onboarding mount detects `has_completed_onboarding = true` → `navigate("/dashboard", { replace: true })` immediately. User never sees wizard again.

### Partial State: Step 2 done, Step 3 abandoned mid-fill

Resume dialog: "Continue from Step 3?" — `name` field is empty (no partial saves on keystrokes). User starts Step 3 fresh.

### Network-Offline State

```
┌─────────────────────────────────────────────┐
│   Slow connection?                          │
│   Your progress is saved when online.       │
│   [ Continue working offline... ]           │
└─────────────────────────────────────────────┘
```

Using `navigator.onLine` and `window.addEventListener('offline', ...)`. If offline when clicking Next, show an alert toast: "You appear to be offline. Changes will be saved when you reconnect." Local state is preserved; sync on reconnect.

### Validation Error State: Invalid Birthday

```
   Your birthday (optional)
   [ Jan ▾ ] [    ▾ ] [ 1990 ▾ ]
              ↑ error
   ⚠ Please complete all birthday fields or clear them all.
```

Red border on the empty select. Error message below the field group. "Next" button is NOT disabled — if the user wants to continue with the error showing, clicking Next triggers validation and prevents navigation.

### Double-Submit State: User clicks Next rapidly

"Next →" button shows loading spinner and is disabled (`disabled={saving}`) from the moment it's first clicked until the DB write resolves. `saving` state set to `true` on click, `false` on response. Prevents double writes.

### Permission Error State: RLS blocks update

```
toast.error("Couldn't save your changes. Please refresh and try again.");
```

Log the error to console/Sentry. Do not expose SQL error messages to the user.

---

## Section 9: Acceptance Criteria

### Must Have (P0) — Cannot ship without

- [ ] New Google OAuth signups are routed to `/onboarding` (not `/dashboard`)
- [ ] New email signups are still routed to `/onboarding` (regression test)
- [ ] All 5 steps render correctly with correct content on desktop (>768px) and mobile (<768px)
- [ ] Swipe left/right gesture navigates steps on mobile (existing `onDragEnd` handler)
- [ ] Skip button appears on Steps 1–4, is absent on Step 5
- [ ] Step 3 recipient is inserted to `recipients` table when name is provided
- [ ] Step 3 is auto-skipped if `recipient_count > 0` with 1500ms message
- [ ] `users.full_name` and `users.country` are saved when Step 4 is completed
- [ ] `users.birthday` is saved when Step 4 is completed (if provided)
- [ ] `users.onboarding_state.audience` and `gift_style` are saved
- [ ] `has_completed_onboarding = true` set after Step 5
- [ ] Confetti fires on Step 5 render
- [ ] Profile completion % is calculated correctly (verified against scoring breakdown)
- [ ] Dashboard banner appears if `profile_completion_percentage < 100`
- [ ] Dashboard banner dismisses and does not reappear for 7 days
- [ ] Banner reappears after 7 days if still incomplete
- [ ] All 10 PostHog events fire at the correct times with correct properties
- [ ] Resume works: closing browser mid-wizard → next login shows resume dialog → continues from correct step
- [ ] `users_update_own` RLS policy prevents self-grant of credits or role

### Should Have (P1)

- [ ] Birthday validation: partial birthday (only month filled) blocks Next with error message
- [ ] Country auto-detected from `navigator.language` and pre-filled on Step 4
- [ ] ProgressDots animate smoothly on step transition (Tailwind transition, 300ms)
- [ ] Browser Back button on wizard navigates to previous wizard step (not browser history)
- [ ] Keyboard ArrowLeft/ArrowRight navigates steps
- [ ] Profile page shows `birthday` field (three selects matching Step 4 UI)
- [ ] Profile page shows `audience` and `gift_style` chips (editable, synced to `onboarding_state`)
- [ ] Profile completion bar on Profile page (same logic as Dashboard banner)
- [ ] `complete-onboarding` Edge Function grants 3 bonus credits (if flag enabled)
- [ ] "Find a Gift for [Name] →" on Step 5 pre-selects recipient in gift flow

### Nice to Have (P2)

- [ ] Lottie/Rive animation for Step 5 confetti instead of canvas-confetti
- [ ] Email sent after onboarding completion ("Welcome to GiftMind — you're ready!")
- [ ] Personalized copy on Step 5 based on `audience` selection (e.g., "🎁 Ready to surprise your family?")
- [ ] Video walkthrough option on Step 1 (YouTube embed in modal)
- [ ] Batch-save step data to DB on Next (currently saving after each step — fine for now)

---

## Section 10: Open Questions & Decisions Needed

**Q1: Bonus credits on completion — yes or no?**  
Current recommendation: Start with NO bonus (Option A). The primary incentive is adding a recipient and getting to first value faster. Add bonus credits at D30 A/B test if completion rate < 50%. This avoids Edge Function complexity at launch.  
→ **Decision needed:** Yes or No before engineering starts.

**Q2: Google OAuth redirect — AuthContext fix vs. callback URL change?**  
Two approaches:  
- (A) `redirectTo: '/onboarding'` for Google OAuth. Breaks returning users (they always go to onboarding). Requires checking in Onboarding if already done.  
- (B) Keep `redirectTo: '/dashboard'` but fix AuthContext `SIGNED_IN` handler to redirect new users.  
Recommendation: **Option B** — more elegant, doesn't break returning user UX. AuthContext already queries the users table on SIGNED_IN.  
→ **Decision needed:** Confirm Option B is acceptable before implementing.

**Q3: Should `birthday` be collected during onboarding or profile-only?**  
Current spec: Step 4 includes birthday. Alternative: Skip birthday in wizard, only show on profile page (less intimidating in onboarding). Privacy concern: not everyone wants to share birthday during signup.  
Recommendation: Keep birthday in Step 4 but clearly marked optional with explanation: "Used for birthday reminders — never shared."  
→ **Decision needed:** Keep in Step 4 or move to profile-only?

**Q4: What is the "gifting occasion reminder" feature that `birthday` unlocks?**  
The spec references birthday for "future features" but doesn't define them. If there's no roadmap for birthday-based reminders in the next 6 months, collecting birthday adds friction with no near-term payoff.  
→ **Decision needed:** Is birthday needed for a planned v2.2 feature?

**Q5: How should profile completion % behave for pre-migration users?**  
Existing users (before this migration) have `onboarding_state = null`, but may have `full_name` and `country` filled from the existing Profile page. Their completion % should be calculated correctly (using the DB function which handles null `onboarding_state`). The DB trigger will auto-calculate on their next profile update.  
For the first login after migration, existing users with complete profiles would show 60% because `audience` and `gift_style` are new fields — the banner would incorrectly show. We could set a migration script to grant `profile_completion_percentage = 60` to all existing users who have `full_name` + `country` + 1 recipient.  
→ **Decision needed:** Run a backfill script on deploy to set baseline completion for existing users?

**Q6: Should the Dashboard banner be shown to users who completed onboarding but have low completion?**  
A user who completed all 5 steps but skipped Step 2 and Step 3 has `has_completed_onboarding = true` but low `profile_completion_percentage`. Should they see the banner? Current spec says: yes (banner checks % not onboarding status).  
→ **Confirmation needed:** Confirm this is the desired behavior.

**Q7: Where does the wizard live in the routing tree?**  
Current: `<Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />` in `App.tsx`. The new `OnboardingFlow.tsx` should replace `src/pages/Onboarding.tsx` entirely (same route, different component tree). Or `Onboarding.tsx` can be refactored in-place.  
Recommendation: Refactor `Onboarding.tsx` in place — rename the default export content but keep the same file. This avoids touching `App.tsx`.  
→ **Confirmation needed:** Refactor in place or create new page file?

**Q8: Should the `language` field in the users table map to anything yet?**  
The Profile page shows a Language selector but "Hindi (coming soon)" is disabled. Is there a concrete plan to use `language` in the recommendation engine or UI in the next 6 months? If not, the field can stay as-is but shouldn't be prominently featured in onboarding.  
→ **No decision needed** (existing behavior maintained) — but good to confirm with product.

---

## Section 11: Rollout & Migration

### Migration Safety

**New columns are nullable or have defaults.** `birthday` is nullable. `onboarding_state` defaults to null (handled in code with `?? defaultOnboardingState`). `profile_completion_percentage` defaults to 0. `onboarding_bonus_granted` defaults to false. No existing queries break.

**`handle_new_user` trigger update:** The trigger is updated with `CREATE OR REPLACE` — idempotent. Existing users are unaffected. New users get `onboarding_state` initialized.

**Existing users' `profile_completion_percentage`:** Starts at 0 for all existing users until their next profile update. If we want accurate initial values, run a one-time backfill:

```sql
-- Run once after migration
UPDATE public.users u
SET profile_completion_percentage = public.calculate_profile_completion(u.id);
```

This triggers the `sync_profile_completion` trigger — but since the trigger is `BEFORE UPDATE`, we need to run the function manually in a loop or a single UPDATE statement. The SQL above is safe.

### Feature Flag Strategy

Add to `.env`:
```
VITE_ONBOARDING_BONUS_ENABLED=false   # Enable once metrics confirm value
VITE_ONBOARDING_V2_ENABLED=true       # New wizard vs. old 3-step
```

If `VITE_ONBOARDING_V2_ENABLED=false`, the old `Onboarding.tsx` (3-step) is used. This lets us roll back to the old wizard without a code deploy.

```typescript
// src/pages/Onboarding.tsx
const V2_ENABLED = import.meta.env.VITE_ONBOARDING_V2_ENABLED === 'true';

const Onboarding = () => {
  if (V2_ENABLED) return <OnboardingFlow />;
  return <OnboardingV1 />; // existing 3-step component
};
```

### Rollout Phases

**Phase 1 — Internal testing (Week 1):**
- Deploy migration to production
- Enable `VITE_ONBOARDING_V2_ENABLED=true` in staging only
- Test all 5 steps, both email and Google OAuth paths, resume logic
- Verify PostHog events arriving

**Phase 2 — 10% rollout (Week 2):**
- PostHog feature flag `onboarding-v2`: 10% of new signups
- Monitor: completion rate, time-to-first-session, D1 retention
- Watch for DB errors, RLS policy failures

**Phase 3 — 50% rollout (Week 3):**
- If Phase 2 metrics are ≥ targets: expand to 50%
- Continue monitoring
- Address any UX feedback from first cohort

**Phase 4 — 100% rollout (Week 4):**
- Remove feature flag; new wizard is default for all new users
- Backfill existing users with profile completion banner nudge

### Rollback Plan

**Instant rollback (no deploy):** Set `VITE_ONBOARDING_V2_ENABLED=false` in Vercel env vars → redeploy in 30 seconds.  
**DB rollback:** Not needed — new columns are additive and nullable. Old code ignores `onboarding_state`, `birthday`, `profile_completion_percentage` columns.  
**Edge Function rollback:** `complete-onboarding` function can be disabled by setting `VITE_ONBOARDING_BONUS_ENABLED=false`.

---

## Section 12: Appendix

### Design References

- **Notion Onboarding (2023):** 5 steps, similar chip-selection for "what will you use Notion for?" (audience selection). Sets user type to personalize templates shown.
- **Linear Onboarding:** Minimal, 3 steps. Each step has one clear CTA and no optional fields. Moves fast. GiftMind's Step 3 follows this principle.
- **Superhuman Onboarding:** Personalized, high-touch. We're not doing this — too complex for v1.
- **Duolingo Onboarding:** Gamified, progress-focused. CoinDrop animation in existing Step 3 is inspired by this.

### Competitor Analysis (brief)

| Competitor | Onboarding Style | What We Adopt |
|------------|-----------------|---------------|
| Giftagram | Skip wizard, straight to browse | We do offer skip, but nudge more |
| Wrappily | Email required, long form | We keep it short (5 steps, all skippable) |
| Prezola | Wedding-specific wizard | Genre-specific; we're general. Audience selection is inspired. |
| Amazon Gift Registry | No onboarding — dive into catalog | Different product model entirely |

### Glossary

| Term | Definition |
|------|-----------|
| `onboarding_state` | jsonb column on `users` that stores wizard progress, audience selection, gift style preferences, and timestamps |
| Profile completion % | A 0–100 score computed from filled profile fields (name, country, recipient, audience, birthday, gift style) |
| Audience | The group of people a user primarily buys gifts for (family, friends, partner, etc.) — used for future content personalization |
| Gift style | The user's preferred gifting approach (thoughtful, practical, extravagant, etc.) — stored as an array, max 3 selections |
| JTBD | Jobs To Be Done — a framework for understanding user motivation in terms of outcomes they're trying to achieve |
| Step | One screen in the 5-step wizard. Steps are 1-indexed in code and in analytics events |
| Resume | Loading a user's saved `onboarding_state` after an interrupted wizard session and continuing from `current_step` |
| Banner | The Dashboard notification strip showing profile completion % and a CTA to finish setup |

---

## Delivery Report

**Total word count:** ~9,800 words  
**Number of wireframes (ASCII):** 9  
**Number of SQL blocks:** 3 (migration, completion function, trigger)  
**Number of TypeScript interfaces/types:** 14  
**Number of open questions requiring human input:** 8 (Sections 10, Q1–Q8)  

**Files requiring modification:**

| File | Change Type |
|------|-------------|
| `src/contexts/AuthContext.tsx` | Add redirect-to-onboarding in SIGNED_IN handler |
| `src/pages/Onboarding.tsx` | Full refactor to 5-step wizard (or replace with `OnboardingFlow`) |
| `src/pages/Profile.tsx` | Add birthday field, audience/gift_style chips, completion bar |
| `src/pages/Dashboard.tsx` | Add `ProfileCompletionBanner` component |
| `src/App.tsx` | Add feature flag wrapper for OnboardingFlow |
| `src/integrations/supabase/types.ts` | Add new columns: `birthday`, `onboarding_state`, `profile_completion_percentage`, `onboarding_bonus_granted` |
| `supabase/migrations/` | New file: `20260501000700_add_onboarding_profile_fields.sql` |
| `supabase/functions/complete-onboarding/index.ts` | New Edge Function (only if bonus enabled) |

**New files to create:**

```
src/features/onboarding/OnboardingFlow.tsx
src/features/onboarding/OnboardingLayout.tsx
src/features/onboarding/steps/Step1Welcome.tsx
src/features/onboarding/steps/Step2Audience.tsx
src/features/onboarding/steps/Step3FirstRecipient.tsx
src/features/onboarding/steps/Step4AboutYou.tsx
src/features/onboarding/steps/Step5Complete.tsx
src/features/onboarding/components/ProgressDots.tsx
src/features/onboarding/components/SkipButton.tsx
src/features/onboarding/components/AudienceChip.tsx
src/features/onboarding/components/GiftStyleChip.tsx
src/features/onboarding/components/InterestTagInput.tsx
src/features/onboarding/components/BirthdayPicker.tsx
src/features/onboarding/components/ProfileCompletionBanner.tsx
src/features/onboarding/hooks/useOnboarding.ts
src/features/onboarding/hooks/useProfileCompletion.ts
src/features/onboarding/hooks/useOnboardingAnalytics.ts
src/features/onboarding/types/onboarding.types.ts
```

**Estimated engineering effort:**

| Task | Estimate |
|------|----------|
| DB migration + types.ts update | 2 hours |
| `OnboardingFlow` + layout + steps (1–5) | 2 days |
| Hooks (`useOnboarding`, `useProfileCompletion`, analytics) | 1 day |
| Sub-components (chips, BirthdayPicker, InterestTagInput, banner) | 1 day |
| AuthContext fix (Google OAuth routing) | 2 hours |
| Profile page additions (birthday, prefs, completion bar) | 4 hours |
| Dashboard banner integration | 2 hours |
| `complete-onboarding` Edge Function (if bonus enabled) | 3 hours |
| PostHog event instrumentation | 2 hours |
| QA: desktop, mobile, both auth methods, resume, skip, edge cases | 1 day |
| **Total** | **~6.5 days** |
