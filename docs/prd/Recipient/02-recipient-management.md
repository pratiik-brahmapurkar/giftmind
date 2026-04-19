# PRD: Recipient Management ("My People")

**Feature:** Recipient Management  
**User-facing name:** My People  
**Owner:** Pratik Brahmapurkar  
**Version:** 1.1  
**Status:** In Development  
**Last updated:** 2026-04-19  

---

## Section 0: Current State Audit

> This section documents every finding from the Phase 1 codebase audit. Engineers must read this before starting any implementation work.

### 0.1 Recipients Table Schema (actual, from types.ts + migrations)

The live schema as reflected in `src/integrations/supabase/types.ts` (Row type):

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid | NO | PK, gen_random_uuid() |
| `user_id` | uuid | NO | FK → auth.users(id) ON DELETE CASCADE |
| `name` | text | NO | Required |
| `relationship` | text | YES | Was originally `relationship_type` enum; migrated to plain text |
| `relationship_depth` | text | YES | 'very_close' / 'close' / 'acquaintance' |
| `age_range` | text | YES | 'under_18' / '18_25' / '25_35' / '35_50' / '50_65' / '65_plus' |
| `gender` | text | YES | 'male' / 'female' / 'non_binary' / 'prefer_not_to_say' |
| `country` | text | YES | ISO 3166-1 alpha-2, added via migration 20260406142115 |
| `cultural_context` | text | YES | Stored as single string enum value ('indian_hindu', 'western' etc.) — **NOT structured jsonb** |
| `interests` | text[] | YES | Array of free-text tags, no DB-level max constraint |
| `notes` | text | YES | Free text |
| `important_dates` | jsonb | YES | Array of `{label, date (MM-DD), recurring}` objects |
| `last_gift_date` | timestamptz | YES | Manually updated or via gift_sessions |
| `created_at` | timestamptz | NO | DEFAULT now() |
| `updated_at` | timestamptz | NO | DEFAULT now(), updated by trigger |

**Missing columns that need migration:**
- `is_archived` boolean DEFAULT false — needed for V2 soft-delete, add now for free
- `session_count` int DEFAULT 0 — currently computed client-side via gift_sessions join
- `gift_count` int DEFAULT 0 — currently computed client-side

**Column mismatch bug (CRITICAL):**
The original migration (`20260405151541`) created column `relationship_type` as a PG enum. A later migration changed it to `relationship` as plain text. The TypeScript layer (`src/lib/recipients.ts:48`) now maps `formData.relationship_type → relationship` correctly via `buildRecipientWritePayload`. This is the root cause of past 400 errors — the fix is in place but must not be reverted.

**`cultural_context` structural issue:**
Currently stored as a single enum string ('indian_hindu', 'western', etc.). The PRD upgrades this to a structured jsonb object `{ religion, dietary: string[], notes }`. This requires a migration and TypeScript type change.

### 0.2 Current UI Structure

**Files:**
- `src/pages/MyPeople.tsx` — Main page: queries, state management, mutations, delete dialog, upgrade modal
- `src/components/recipients/RecipientCard.tsx` — Card UI with avatar, badge, interests, dates, gift count, locked overlay
- `src/components/recipients/RecipientFormModal.tsx` — Dialog with 5 sections: Basic Info, Interests, Cultural Context, Important Dates, Notes
- `src/components/recipients/constants.ts` — Enums, colors, filter groups, form types

**What's fully working:**
- Three-layer plan limit enforcement (UI + API pre-check + DB trigger)
- Locked card overlay for over-limit recipients (opacity 0.6 + blur + lock badge)
- Sort by recently added / upcoming dates / most gifted (client-side)
- Filter chips: All / Partners / Family / Friends / Colleagues
- Search by name (substring, case-insensitive)
- Interest chip input with preset suggestions + custom entry
- Country flag display when recipient country differs from user country
- CRUD mutations with toast feedback
- Skeleton loading states

**What's missing or broken:**
- No `useRecipients.ts` hook — all Supabase queries are inline in `MyPeople.tsx` (violates separation of concerns)
- No recipient detail/expanded view panel — clicking a card goes directly to edit
- `cultural_context` is a flat string not a structured object (limits AI input quality)
- `important_dates` in the form has no label dropdown (free-text label) — UX is unclear
- Notes `maxLength` in form is `1000` but stated spec is `500` — inconsistency
- No `is_archived` column (soft-delete not possible in V1 as designed)
- `interests` has no DB-level constraint (max 10 is only frontend-enforced)
- No dedicated empty state component for "filtered to zero" vs "no recipients at all"
- Age ranges in DB (`25_35`, `35_50`) differ from component constants (`25_35` is correct but PRD said `26_35` — stay with DB values)
- `reminderNote` prop in `RecipientFormModal` is plan-aware but only renders generic text

### 0.3 Plan Enforcement (Current State)

Three layers are **already implemented**:

**Layer 1 (UI):** `atLimit` check in `MyPeople.tsx:241` → opens upgrade modal instead of add modal.

**Layer 2 (API pre-check):** `createMutation` in `MyPeople.tsx:261-272` re-counts recipients from DB before insert, calls `canAddRecipientForPlan()`, shows upgrade modal if at limit.

**Layer 3 (DB trigger):** `check_recipient_limit()` in `supabase/migrations/recipient_limit_rls_hardening.sql:7-46`. BEFORE INSERT trigger, reads `active_plan` from users table, blocks if count ≥ max.

**Plan limits:**
| Plan | Max Recipients |
|------|---------------|
| spark | 1 |
| thoughtful | 5 |
| confident | 15 |
| gifting-pro | Unlimited (-1) |

**Soft-lock behavior:** Active recipients = first N by `created_at ASC`; remaining are visually locked (cannot be used in gift flow, but profile can still be edited).

### 0.4 RLS Policies (from recipient_limit_rls_hardening.sql)

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `recipients_select` | SELECT | `auth.uid() = user_id` |
| `recipients_insert` | INSERT | `WITH CHECK auth.uid() = user_id` |
| `recipients_update` | UPDATE | `USING auth.uid() = user_id` + `WITH CHECK auth.uid() = user_id` |
| `recipients_delete` | DELETE | `auth.uid() = user_id` |
| `superadmin_select_all_recipients` | SELECT | `is_superadmin(auth.uid())` |

The UPDATE policy correctly uses both `USING` and `WITH CHECK` to prevent user_id tampering. No superadmin INSERT/UPDATE/DELETE — support is read-only on recipients.

### 0.5 Known Bugs from Prior Context

1. **400 errors when adding recipients** — Root cause: `relationship_type` column renamed to `relationship`. Fixed via `buildRecipientWritePayload` mapping. Must not be reverted.
2. **4/1 limit violation** — Historical: plan limit trigger was not yet deployed. Now deployed in `recipient_limit_rls_hardening.sql`. Verify trigger is active in production.
3. **`important_dates` not fully built out** — Schema supports it; form allows free-text label + MM-DD date + recurring checkbox. Missing: label dropdown (Birthday/Anniversary/etc.), structured reminder tracking fields (`reminder_sent_14`, `reminder_sent_7`, `reminder_sent_2`).

### 0.6 What Needs to Be Built / Rebuilt

| Item | Status | Priority |
|------|--------|----------|
| `useRecipients.ts` hook (extract from page) | Missing | P1 |
| Recipient detail panel (read-only expanded view) | Missing | P1 |
| `cultural_context` migration to structured jsonb | Missing | P1 |
| `is_archived` column (for V2) | Missing | P1 (add now, don't implement logic) |
| `important_dates` label dropdown UX | Partial | P1 |
| `important_dates` reminder tracking fields | Missing | P2 |
| Notes maxLength fix (form says 1000, spec says 500) | Bug | P0 |
| DB constraint on interests max 10 | Missing | P1 |
| Dedicated empty states (filtered vs zero) | Partial | P1 |
| "Find a Gift" always-visible CTA on card | Hidden (hover only) | P1 |

---

## Section 1: Overview

**Feature name (internal):** Recipient Management  
**User-facing name:** My People  
**Owner:** Pratik Brahmapurkar  
**Version:** 1.1  
**Status:** In Development (migrating from MVP to production-ready)

### What this feature is

Recipient Management is the address book of GiftMind. It allows users to create and maintain structured profiles for the people they gift — capturing relationship type, demographics, interests, cultural context, important dates, and gift history. These profiles are the primary input to GiftMind's AI recommendation engine. Without a recipient, there is no gift recommendation.

The feature lives at `/my-people` and represents the second pillar of the product after onboarding. Every interaction in GiftMind eventually routes through a recipient: gift sessions reference a recipient, occasion reminders read a recipient's important dates, and the AI recommendation engine reads a recipient's interests and cultural context to generate personalized suggestions.

### Why this feature matters

**It is the foundation for everything.** A gift session without a recipient forces the user to re-type all context every time — age, interests, relationship, budget range. A recipient profile eliminates that re-entry. After month 12 of use, a user with 10 recipients has 10 × their monthly gifting intelligence stored in the system. The compounding value grows every time they add a recipient or return to use one.

**It drives retention.** The moment a user saves a birthday for their partner, they have given GiftMind a reason to contact them next March. The more complete the profile, the more occasions GiftMind can surface. Recipients with important dates have a direct line to the occasion reminder system, which is a key re-engagement surface.

**It justifies the paid tier.** The fact that Spark plan allows only 1 recipient is deliberate. Users who experience the value of a saved profile — fast gift sessions, remembered preferences, occasion prompts — will upgrade to save more people. The upgrade prompt appears at the exact moment of highest motivation: when a user wants to add their second person.

**It personalizes the AI output.** The recommendation engine reads interests, cultural context, age range, and past gift history from the recipient profile. A recipient with 10 interests, a dietary constraint, and a country flag produces dramatically better recommendations than an anonymous gift request.

### Where this feature fits in the product

1. Onboarding → creates first recipient in Step 3
2. **My People** → manages all recipients (this PRD)
3. Gift Flow → Step 1 selects a recipient from My People
4. Occasion Engine → reads important_dates from recipients
5. Gift History → filtered by recipient
6. Recipient Memory → AI reads past gifts per recipient to avoid repeats

### Scope (what's IN this PRD)

- CRUD for recipient profiles (Create, Read, Update, Delete)
- All form fields (name, relationship, country, age, gender, interests, notes, cultural_context, important_dates)
- Plan limit enforcement (UI + API + DB)
- Soft-lock visualization for over-limit recipients
- Search, filter, and sort on the list view
- Loading, empty, and error states
- All PostHog tracking events
- Migration to structured `cultural_context` jsonb
- Adding `is_archived` column (no logic yet, just schema)
- Recipient detail panel (expanded read-only view)
- Extracting `useRecipients` hook from `MyPeople.tsx`

### Explicit Non-Goals (NOT in this PRD)

1. **Shared recipient lists** (couples co-managing the same people) — V2
2. **Recipient groups / tags** (e.g. "Book Club" group) — V2
3. **Bulk CSV import** — V2
4. **Social media linking** (Instagram/Facebook profile scrape) — V2
5. **Birthday / anniversary calendar view** — V2 (dates stored in form, calendar visualization deferred)
6. **Contact sync from phone** (iOS Contacts / Android People API) — V2
7. **AI-suggested recipients** ("You should add your mom") — V2
8. **Group gifting** for a recipient (pooling contributions) — Separate PRD
9. **Gift wishlist management** (recipient requests gifts) — V2
10. **Notes from recipient → user** (2-way profile feature) — V2
11. **Reminder delivery system** — Separate PRD (this PRD stores dates; reminders are sent by the Occasion Engine)
12. **Recipient analytics dashboard** — Separate PRD

---

## Section 2: User Problem & Goals

### The User Problem

**Primary pain quote:**
> "I keep giving the same 3 people gifts. I can never remember what I gave them last year. I forget their birthdays. My spouse and I duplicated the same gift for my mom."

This is not a rare edge case — it is the default state of anyone who gifts more than 3 people. The root cause is that gifting context (what this person likes, what they've received, when their birthday is) lives entirely in the gifter's head. When it stays there, it degrades over time: you forget the food allergy, you buy the same cookbook twice, you miss the birthday.

**The business problem:**

Without recipient data, GiftMind is a generic gift-idea generator. It cannot differentiate from a simple ChatGPT prompt. Every recipient profile saved is a data moat that makes GiftMind:
- Faster (no re-typing context every session)
- Smarter (AI sees accumulated interest data + gift history)
- Stickier (user has invested data they don't want to lose)
- Billable (plan limits create natural upgrade pressure at the right moment)

Each saved recipient also creates a re-engagement hook via important dates. A recipient with a birthday saved is worth $X in LTV because they generate a reminder, which generates a gift session, which costs credits, which drives purchases.

### Jobs-to-be-Done (JTBD)

1. **When I sign up**, I want to quickly add the 3–5 people I gift most, so that I can use GiftMind immediately without re-entering context every session.

2. **When I'm finding a gift**, I want to select the recipient in 1 tap, so all their profile data flows automatically into the recommendation engine.

3. **When I add someone**, I want to capture their interests, relationship depth, and cultural context, so the AI can make better, more personalized suggestions than a generic prompt.

4. **When I remember it**, I want to save their birthday once, so I get a reminder every year going forward without manual effort.

5. **When a person changes** (new hobby, new life stage, new dietary restriction), I want to update their profile easily, so future recommendations stay relevant and don't suggest things from their past.

6. **When I'm on the list**, I want to see the most gift-relevant people first (upcoming occasions, recently gifted), so I can act quickly when a date is approaching.

7. **When I have many recipients**, I want to filter by relationship type (just Family, just Friends), so I can find who I'm thinking of without scrolling through everyone.

8. **When someone is no longer in my life**, I want to remove them cleanly, so my list doesn't become cluttered with stale entries that dilute the quality of the list.

### Success Metrics

| Metric | Target | Baseline | How Measured |
|--------|--------|----------|--------------|
| Activation: recipients added per user in first session | ≥ 2 | 1 (estimate) | `recipients_count > 2` per user in PostHog |
| D7 retention: adds 1+ more recipient by Day 7 | ≥ 35% | Unknown | PostHog funnel `recipient_add_completed` events |
| Profile completeness per recipient | ≥ 60% fields filled avg | Unknown | % of optional fields non-null, computed in analytics |
| Gift sessions per recipient per year | ≥ 2 avg | Unknown | `session_count / active_recipients` in Supabase |
| Recipients with birthday saved | ≥ 40% | Unknown | `important_dates` array length > 0 |
| Time to add first recipient (from "Add Person" click to save) | < 90s | Unknown | PostHog event delta `recipient_add_started` → `recipient_add_completed` |
| Upgrade conversion from "at limit" state | ≥ 15% | Unknown | Upgrade modal open → purchase, PostHog funnel |

---

## Section 3: User Journey & UX

### 3.1 List View (My People Page)

The My People page (`/my-people`) is the primary management surface. It is accessible from the bottom nav and sidebar. It shows all recipients in a responsive grid with search, filter, and sort controls at the top.

#### Desktop wireframe (≥ 768px, 2-column grid)

```
┌──────────────────────────────────────────────────────────────────────┐
│  My People                                        [+ Add Person]     │
│  3/5 people · Thoughtful 💝                                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ [🔍 Search by name...]              [Recently added       ▾]   │ │
│  │ [All (4)] [Partners (1)] [Family (0)] [Friends (2)] [Colleagues]│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────┐        │
│  │ ┌─V┐  Vinay 🇮🇳          │   │ ┌─S┐  Shaqeeb            │        │
│  │ └──┘  Close Friend       │   │ └──┘  Friend             │        │
│  │                          │   │                          │        │
│  │ Tech  Fashion  +2        │   │ (no interests yet)       │        │
│  │                          │   │                          │        │
│  │ 🎂 Birthday: Apr 3       │   │                          │        │
│  │ ⚡ Coming up! (14 days)  │   │ No gifts yet             │        │
│  │                          │   │                          │        │
│  │ 2 gifts · Last: Mar 2026 │   │ [🎁 Find a Gift →]       │        │
│  │ [🎁 Find a Gift →]       │   │                          │        │
│  └──────────────────────────┘   └──────────────────────────┘        │
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────┐        │
│  │ 🔒 Locked                │   │ 🔒 Locked                │        │
│  │ ┌─S┐  Shrikant  (blur)   │   │ ┌─P┐  Priya   (blur)    │        │
│  │ └──┘  Friend             │   │ └──┘  Colleague          │        │
│  │ London · Cooking         │   │                          │        │
│  │ ─────────────────        │   │ ─────────────────        │        │
│  │ 🔒 Upgrade to use        │   │ 🔒 Upgrade to use        │        │
│  └──────────────────────────┘   └──────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mobile wireframe (< 768px, 1-column)

```
┌────────────────────────────────────┐
│  My People              [+ Add]    │
│  3/5 people · Thoughtful 💝        │
│                                    │
│  [🔍 Search by name...]            │
│  [Recently added              ▾]   │
│  [All][Partners][Family][Friends]  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ ┌─V┐  Vinay 🇮🇳  Close Friend│  │
│  │ └──┘  Tech  Fashion  +2     │  │
│  │      🎂 Birthday: Apr 3     │  │
│  │      ⚡ Coming up!           │  │
│  │      2 gifts · Mar 2026     │  │
│  │      [🎁 Find a Gift →]     │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ ┌─S┐  Shaqeeb       Friend  │  │
│  │ └──┘  No interests           │  │
│  │      No gifts yet           │  │
│  │      [🎁 Find a Gift →]     │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ 🔒 [locked blur overlay]     │  │
│  │ ┌─S┐  Shrikant      Friend  │  │
│  │ └──┘  Upgrade to use        │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

#### Card Anatomy

Each `RecipientCard` renders these elements in order:

1. **Avatar circle** — 40×40px, colored by relationship type (colors from `RELATIONSHIP_AVATAR_COLORS` in `constants.ts`), shows first initial, white bold text
2. **Name** — `font-heading font-semibold text-lg`, truncated with ellipsis. Country flag emoji (from `COUNTRY_OPTIONS`) appended when recipient.country ≠ userCountry. No flag if same country (avoids visual noise for majority case)
3. **Relationship badge** — `Badge variant="outline"` with relationship-specific color class from `RELATIONSHIP_BADGE_COLORS`. Shows label (e.g. "Close Friend", "Partner")
4. **Three-dot menu (⋯)** — `DropdownMenu` with Edit, Find a Gift (disabled if locked), Delete
5. **Interest chips** — Show up to 3; `+N more` overflow badge. `Badge variant="secondary"` in muted colors
6. **Important dates** — Show up to 2, sorted by priority (Birthday/Anniversary first) then by days-until. Shows 🎂 for birthday, 💍 for anniversary/other. "Coming up!" warning badge when within 14 days
7. **Gift count line** — `N gifts chosen · Last gift: Mon YYYY` or "No gifts yet"
8. **Find a Gift CTA** — `Button variant="hero" size="sm"` — **always visible** (current implementation hides on hover only; fix to always show)

**Critical fix:** Remove `opacity-0 group-hover:opacity-100` from the Find a Gift button in `RecipientCard.tsx:199`. The primary action must always be visible, not hidden behind hover state.

#### Sort Order

Default: **Recently added** (`created_at DESC`).

Sort options (controlled by `<Select>` in header):
- **Recently added** — `created_at DESC`
- **Upcoming dates** — Sorts by `next_important_date_days ASC` (recipients with no dates go last). Secondary sort: `gift_count DESC`. Logic: `getNextImportantDate()` in `MyPeople.tsx:93`
- **Most gifted** — `gift_count DESC`. Secondary sort: `last_gift_date DESC`

Sort is client-side using `useMemo` (already implemented).

#### Filter Chips

Chip row below search/sort:

| Chip label | Relationship types included | Count badge |
|------------|----------------------------|-------------|
| All | (none — shows all) | total count |
| Partners | partner, new_relationship | count |
| Family | parent, sibling, child, in_law | count |
| Friends | close_friend, friend | count |
| Colleagues | colleague, boss, mentor, acquaintance | count |

Active chip: `bg-primary text-primary-foreground`. Inactive: `bg-muted text-muted-foreground`.

Count badges are computed client-side from unfiltered recipients list (not affected by active filter).

#### Loading State

4 skeleton cards (grid-responsive). Each card skeleton: circular avatar placeholder, 2 text lines, 1 shorter text line. Currently implemented in `MyPeople.tsx:379-393`.

#### Responsive Breakpoints

- Mobile (< 768px): 1 column
- Tablet / Desktop (≥ 768px): 2 columns (`grid-cols-1 md:grid-cols-2`)
- Large desktop (≥ 1280px): Consider 3 columns in V2. For V1, cap at 2 (keeps cards readable with longer interest lists)

### 3.2 Plan Limit Display & Enforcement UI

#### Capacity counter (header subtext)

Displayed when `recipients.length > 0`:

```
3/5 people (Thoughtful 💝)        ← green (under 80%)
4/5 people (Thoughtful 💝)        ← amber (≥ 80%)
5/5 people (Thoughtful 💝)        ← red (at limit)
3/15 people (Confident 🎯)        ← green
∞ people (Gifting Pro 🚀)         ← no color (unlimited)
```

Color logic:
- `capacityPct >= 1.0` → `text-destructive`
- `capacityPct >= 0.8` → `text-warning`
- otherwise → `text-muted-foreground`

Already implemented in `MyPeople.tsx:242-243`. No change needed.

#### Header button state at limit

When `atLimit === true`:
```
[🔒 Upgrade to add more]   ← variant="outline", muted
```

When `atLimit === false`:
```
[+ Add Person]             ← variant="hero"
```

Already implemented in `MyPeople.tsx:358-367`.

#### Upgrade modal content (per plan)

When Spark user at limit (1 recipient) clicks "+ Add Person":

```
┌───────────────────────────────────────────────────────┐
│  🔒 Ready to save more people?                        │
│                                                       │
│  You're on Spark ✨ — 1 saved profile included.       │
│                                                       │
│  Upgrade to Thoughtful 💝 ($2.99)                     │
│  → Save up to 5 people                               │
│  → 25 gift sessions                                   │
│  → 30-day validity                                    │
│                                                       │
│  [Upgrade to Thoughtful — $2.99]  [Maybe later]       │
└───────────────────────────────────────────────────────┘
```

The `UpgradeModal` component is already wired; `highlightPlan` is set via `getUpgradePlan(plan, "more_recipients")` in `MyPeople.tsx:254`.

#### Soft-lock visualization for over-limit recipients

When `isLocked === true` (recipient.id not in `activeRecipientIds`):

- Card has `opacity-60` class
- Absolute overlay: `bg-background/55 backdrop-blur-[1px]` covers entire card
- Centered message: Lock icon + "🔒 Upgrade to use this person in gift sessions"
- Find a Gift button: `disabled={true}`
- Three-dot menu Edit option: **still functional** (user can update profile even on locked recipients)
- Three-dot menu Delete option: **still functional**

**Active recipients determination:**
```typescript
// First N recipients by created_at ASC are active
const sortedForAccess = [...recipients].sort(
  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
);
const activeRecipientIds = new Set(
  (maxAllowed === -1 ? sortedForAccess : sortedForAccess.slice(0, maxAllowed))
    .map(r => r.id)
);
```

Already implemented in `MyPeople.tsx:244-251`.

### 3.3 Add Recipient Modal (Full Form)

#### Desktop wireframe

```
┌────────────────────────────────────────────────────────────────────┐
│  Add a Person ✨                                             [×]    │
│  The more you share, the better the gift recommendations.          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ╔══ 👤 Basic Info ══════════════════════════════════════════════╗  │
│  ║                                                              ║  │
│  ║  Name *                                                      ║  │
│  ║  [ Pratik                                              ]    ║  │
│  ║                                                              ║  │
│  ║  Relationship *                                              ║  │
│  ║  [ 💑 Partner                                          ▾ ]  ║  │
│  ║                                                              ║  │
│  ║  How close are you?                                          ║  │
│  ║  [ Very Close ] [ Close ] [ Acquaintance ]                   ║  │
│  ║                                                              ║  │
│  ║  Age Range              Gender                               ║  │
│  ║  [ 25–35          ▾ ]   [ Male             ▾ ]               ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
│                                                                    │
│  ╔══ ❤️ Interests (3) ═══════════════════════════════════════════╗  │
│  ║  [Reading ×][Cooking ×][Fitness ×]                           ║  │
│  ║  [Tech][Fashion][Travel][Music][Art][Gaming][Photography]    ║  │
│  ║  [+ Add custom interest]          [+ Add]                   ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
│                                                                    │
│  ╔══ 🌍 Cultural Context ════════════════════════════════════════╗  │
│  ║  [ Indian-Hindu                                        ▾ ]  ║  │
│  ║                                                              ║  │
│  ║  Where do they live?                                         ║  │
│  ║  [ 🇮🇳 India                                          ▾ ]  ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
│                                                                    │
│  ╔══ 📅 Important Dates ════════════════════════════════════════╗  │
│  ║  ┌────────────────────────────────────────────┐             ║  │
│  ║  │ [Birthday           ▾]  [03-16]  [☑ Yearly] [×]         │  ║  │
│  ║  └────────────────────────────────────────────┘             ║  │
│  ║  [+ Add Date]                                               ║  │
│  ║  📅 Date saved! Reminders available on Confident and above. ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
│                                                                    │
│  ╔══ 📝 Notes ════════════════════════════════════════════════════╗  │
│  ║  [ Loves watching football in person, allergic to nuts... ] ║  │
│  ║                                             247 / 500        ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
│                                                                    │
│                                       [Cancel]  [Add Person]       │
└────────────────────────────────────────────────────────────────────┘
```

#### Field Specification Table

| Field | Required | Input Type | Validation | Default | DB Column |
|-------|----------|------------|-----------|---------|-----------|
| `name` | YES | text input | 2–50 chars, trim whitespace | empty | `name` |
| `relationship_type` | YES | Select dropdown | from RELATIONSHIP_TYPES enum | "" | `relationship` |
| `relationship_depth` | NO | RadioGroup pills | 'very_close' / 'close' / 'acquaintance' | 'close' | `relationship_depth` |
| `age_range` | NO | Select | from AGE_RANGES | "" | `age_range` |
| `gender` | NO | Select | from GENDER_OPTIONS | "" | `gender` |
| `interests` | NO | Chip input | max 15 items, each ≤ 50 chars | [] | `interests` |
| `cultural_context` | NO | Select | from CULTURAL_CONTEXTS | "" | `cultural_context` |
| `country` | NO | Combobox search | from COUNTRY_OPTIONS | "" (= user's country) | `country` |
| `important_dates` | NO | Repeating row | MM-DD format, label required if date given | [] | `important_dates` |
| `notes` | NO | Textarea | max 500 chars (fix form maxLength from 1000 → 500) | "" | `notes` |

**Fix required:** `RecipientFormModal.tsx:439` has `maxLength={1000}` on the notes textarea. Change to `maxLength={500}` and add live character counter (e.g. `{form.notes.length} / 500`).

#### Relationship enum (complete list in RELATIONSHIP_TYPES)

```
partner, parent, sibling, close_friend, friend, colleague,
boss, acquaintance, in_law, child, mentor, new_relationship
```

Note: `grandparent` is in the PRD spec but NOT in the current codebase. Add to `RELATIONSHIP_TYPES` in `constants.ts` and to the DB enum via migration if strict DB enum is restored. Recommendation: keep `relationship` as plain text (current state) so adding new types requires no DB migration.

#### Interest chip input behavior

- Preset chips from `INTEREST_SUGGESTIONS` in `constants.ts` (toggle on click → selected state)
- Custom interest: type in input → Enter key or click `[+]` button → becomes chip
- Max 15 items (current frontend validation; reduce to 10 to match spec — change in `handleSubmit` sanitizeArray call)
- No duplicates (case-sensitive in current code; should be case-insensitive: `.toLowerCase()` comparison)
- Custom interests can be removed by clicking the chip (shows `X` icon)
- Preset suggestions that are selected also show in chip state (already implemented)

#### Important Dates UX

**Problem:** Current implementation uses a free-text input for `label`. This means users type "birthday" inconsistently ("Birthday", "bday", "B-day"). The date icon in RecipientCard checks `.toLowerCase().includes("birthday")` — this works but is fragile.

**Fix:** Change label field to a dropdown + custom option:

```
[ Birthday ▾ ]   [ 03-16 ]   [☑ Yearly]   [×]
```

Label options:
```
Birthday
Anniversary
Work Anniversary
Graduation
Housewarming
Other (free text)
```

When "Other" selected, show a secondary text input for custom label (max 30 chars).

The `date` field currently accepts free-text MM-DD. This is error-prone. Keep free text for V1 but add inline format hint: `placeholder="03-16 (MM-DD)"` and validate with regex `/^\d{2}-\d{2}$/` on blur. Show inline error "Use MM-DD format (e.g. 03-16)" if invalid.

Max 5 dates per recipient. If user tries to add a 6th, disable the "+ Add Date" button with tooltip "Maximum 5 dates per person".

`reminderNote` prop behavior (already implemented, verify text):
- spark/thoughtful: "📅 Date saved! Reminders available on Confident and above."
- confident: "📅 Reminders active. Up to 3 people get birthday/anniversary alerts."
- gifting-pro: "📅 Unlimited reminders active for all your people."
- undefined (gifting-pro): no note shown

#### Notes field

- `Textarea` with `rows={3}`
- `maxLength={500}` (fix from current 1000)
- Live character counter: `{notes.length} / 500` right-aligned below textarea
- Placeholder: "Anything that might help... e.g. 'loves anything with cats' or 'minimalist style, no clutter'"

#### Cultural Context

Current: single dropdown `[ Indian-Hindu / Indian-Muslim / Indian-Christian / Western / Mixed / Other ]`

**This field is underspecified for the AI.** The structured improvement (Section 5.1) stores it as jsonb. However, the form UI for V1 can remain as a single dropdown. The migration to structured jsonb happens at the DB layer only; the form sends a string and the insert payload maps it.

For V1.1 (this PRD), add a dietary preference field below cultural context (multi-select checkboxes):

```
Dietary preferences (helps the AI avoid bad gifts):
[☐ Vegetarian] [☐ Vegan] [☐ Halal] [☐ Kosher] [☐ No restrictions]
```

Store as part of `cultural_context` jsonb (see Section 5.1 migration).

### 3.4 Edit Recipient Modal

The edit modal reuses `RecipientFormModal` with `initialData` pre-populated.

**Title:** "Edit [Name] ✨" (currently "Edit Person ✨" — update to use name)

```typescript
// In RecipientFormModal.tsx DialogTitle:
{isEdit ? `Edit ${initialData?.name || 'Person'}` : "Add a Person"} ✨
```

**Stats strip** (add above first FormSection, only in edit mode):

```
┌──────────────────────────────────────────────────────────┐
│  ┌─P┐  Pratik  ·  Close Friend                           │
│  └──┘  Added April 1, 2026                               │
│                                                          │
│  📊 2 gifts chosen  ·  5 gift sessions                   │
│  📅 Last gift: Apr 11, 2026                              │
└──────────────────────────────────────────────────────────┘
```

Stats come from `recipientGiftStats` computed in `MyPeople.tsx`. Pass as props to the modal:

```typescript
interface RecipientFormModalProps {
  // existing...
  stats?: {
    giftCount: number;
    sessionCount: number;
    lastGiftDate: string | null;
    addedAt: string;
  };
}
```

**Save Changes button state:** Disabled when `form` deep-equals `initialData`. Use `JSON.stringify` comparison or `fast-deep-equal`.

**Delete button:** At the bottom of the form, below the save button. Uses destructive styling:

```
[Save Changes]
─────────────────────────────────
[Delete Pratik]   ← text-destructive, variant="ghost", triggers confirmation dialog
```

The delete confirmation dialog is already implemented in `MyPeople.tsx` as an `AlertDialog`. Keep it there (not in the form modal) to avoid nested dialog issues in some browsers.

**Delete confirmation dialog:**

```
┌───────────────────────────────────────────────────────┐
│  Remove Pratik?                                       │
│                                                       │
│  This will permanently delete their profile and all   │
│  associated data. This action cannot be undone.       │
│                                                       │
│  [Cancel]            [Yes, delete]                    │
└───────────────────────────────────────────────────────┘
```

Note: current dialog text says "all associated data" which is correct for hard-delete. For V1, gift sessions are CASCADE deleted. See Section 5.1 for the cascade discussion and the recommended solution (SET NULL not CASCADE on gift_sessions.recipient_id).

### 3.5 Recipient Detail View — Two Surfaces

**Decision (CONFIRMED):** The detail view exists as both a Sheet panel and a dedicated route — simultaneously. They share one component.

Clicking a recipient card:
1. Opens the `Sheet` side panel immediately (no navigation delay)
2. Pushes `/my-people/{id}` to browser history (URL updates, back button works, shareable link)

Navigating directly to `/my-people/{id}` (deep-link or browser back):
1. My People list renders with the Sheet pre-opened on that recipient

#### Routing

Add to `src/App.tsx` (or wherever routes are defined):

```typescript
// Both routes render MyPeople — the second passes an initialDetailId
<Route path="/my-people" element={<MyPeople />} />
<Route path="/my-people/:recipientId" element={<MyPeople />} />
```

`MyPeople` reads `useParams().recipientId` on mount:

```typescript
// In MyPeople.tsx:
const { recipientId: urlRecipientId } = useParams<{ recipientId?: string }>();
const [detailPanelId, setDetailPanelId] = useState<string | null>(urlRecipientId ?? null);

// Keep Sheet in sync with URL (browser back/forward):
useEffect(() => {
  setDetailPanelId(urlRecipientId ?? null);
}, [urlRecipientId]);

const openDetail = (id: string) => {
  navigate(`/my-people/${id}`, { replace: false });
  // useEffect above will set detailPanelId; or set directly for instant open:
  setDetailPanelId(id);
};

const closeDetail = () => {
  navigate("/my-people", { replace: false });
  setDetailPanelId(null);
};
```

This means the Sheet and the URL are always in sync. No separate full-page route component needed — same `MyPeople` page, Sheet open or closed.

#### Side panel wireframe (Sheet, desktop — 400px right drawer)

```
┌─ My People ─────────────────────┬────────────────────────────────────────┐
│                                 │ ← My People              [Edit] [⋯]   │
│  [+ Add Person]                 ├────────────────────────────────────────┤
│                                 │                                        │
│  ┌──────────────────────────┐   │  ┌─P┐  Pratik 🇮🇳                      │
│  │ ┌─P┐  Pratik 🇮🇳  ←focus │   │  └──┘  Close Friend  ·  Very Close    │
│  │ └──┘  Close Friend      │   │       Age: 26–35  ·  Male             │
│  │  2 gifts · Mar 2026     │   │       Added Apr 1, 2026               │
│  │  [🎁 Find a Gift →]     │   │                                        │
│  └──────────────────────────┘   │  ── About ──────────────────────────  │
│                                 │  [Cooking][Fitness][Tech][Running]+1  │
│  ┌──────────────────────────┐   │                                        │
│  │ ┌─S┐  Shaqeeb   Friend  │   │  Cultural: Indian-Hindu               │
│  │ └──┘  No interests      │   │  Dietary: Vegetarian                   │
│  │  No gifts yet           │   │  Location: India 🇮🇳                   │
│  │  [🎁 Find a Gift →]     │   │                                        │
│  └──────────────────────────┘   │  Notes: Loves watching football...    │
│                                 │                                        │
│  ┌──────────────────────────┐   │  ── Dates ─────────────────────────   │
│  │ 🔒 [Shrikant locked]     │   │  🎂 Birthday: March 16               │
│  └──────────────────────────┘   │     ⚡ 15 days away!                  │
│                                 │                                        │
│                                 │  ── Gift History ──────────────────   │
│                                 │  • Apr 11 — Recipe Journal  ✓         │
│                                 │  • Mar 16, 2025 — Silk scarf  ✓       │
│                                 │  • Dec 25, 2024 — Chocolate box  ✓    │
│                                 │                                        │
│                                 │  5 sessions · 3 gifts · 2 abandoned   │
│                                 │                                        │
│                                 │  ┌────────────────────────────────┐   │
│                                 │  │  [🎁 Find a Gift for Pratik →] │   │
│                                 │  └────────────────────────────────┘   │
└─────────────────────────────────┴────────────────────────────────────────┘
```

#### Mobile wireframe (full-screen overlay when Sheet opens)

```
┌────────────────────────────────────┐
│  ← My People          [Edit] [⋯]  │
├────────────────────────────────────┤
│  ┌─P┐  Pratik 🇮🇳                  │
│  └──┘  Close Friend  ·  Very Close│
│       Age: 26–35  ·  Male        │
│                                    │
│  ── About ───────────────────────  │
│  [Cooking][Fitness][Tech]+3        │
│  Cultural: Indian-Hindu            │
│  Dietary: Vegetarian               │
│                                    │
│  Notes: Loves watching football... │
│                                    │
│  ── Dates ───────────────────────  │
│  🎂 Birthday: March 16             │
│     ⚡ 15 days away!               │
│                                    │
│  ── Gift History ────────────────  │
│  • Apr 11 — Recipe Journal  ✓      │
│  • Mar 16, 2025 — Silk scarf  ✓    │
│  • Dec 25, 2024 — Chocolate box ✓  │
│                                    │
│  5 sessions · 3 gifts chosen       │
│                                    │
│  [🎁 Find a Gift for Pratik →]     │
└────────────────────────────────────┘
```

#### `RecipientDetailPanel` component props

```typescript
// src/components/recipients/RecipientDetailPanel.tsx
interface RecipientDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string | null;
  recipients: RecipientWithIntelligence[];  // pass from parent to avoid re-fetch
  onEdit: (id: string) => void;
  onFindGift: (id: string) => void;
}

// Sheet wrapper (always present — mode is always "sheet"):
// On desktop: 400px right side panel
// On mobile: SheetContent with side="bottom" or full-screen overlay
```

The component finds the recipient from the `recipients` array (already in memory from the list query) and makes a secondary query only for gift history.

#### Gift history secondary query

```typescript
// Inside RecipientDetailPanel:
const { data: giftHistory = [] } = useQuery({
  queryKey: ["recipient-gift-history", recipientId],
  queryFn: async () => {
    const { data } = await supabase
      .from("gift_sessions")
      .select("id, created_at, selected_gift_name, status, occasion")
      .eq("recipient_id", recipientId!)
      .order("created_at", { ascending: false })
      .limit(10);
    return data ?? [];
  },
  enabled: !!recipientId,
  staleTime: 60_000,
});
```

**History item rendering:**
- `selected_gift_name` not null → green "✓ Chosen" badge + gift name
- `selected_gift_name` null → muted "(no gift chosen)" text
- Date: `Apr 11, 2026` format

**Empty gift history:**

```
┌──────────────────────────────────────────────────────┐
│  🎁 No gifts chosen for Pratik yet.                  │
│                                                      │
│  [🎁 Find their first gift]                          │
└──────────────────────────────────────────────────────┘
```

**Primary CTA:** "Find a Gift for [Name]" button — sticky at bottom of Sheet, always visible. On click: `navigate(`/gift-flow?recipient=${id}`)` and close the Sheet.

**Click collision handling:**
```typescript
// In RecipientCard.tsx — stop propagation on interactive elements:
<DropdownMenuTrigger onClick={(e) => e.stopPropagation()} />
<Button onClick={(e) => { e.stopPropagation(); onFindGift(); }} />

// Card body click (the Card itself):
<Card onClick={() => onCardClick(id)} className="cursor-pointer" />
```

### 3.6 Search, Filter & Sort

#### Search

- Input: debounced 300ms (`useEffect` + `setTimeout`, or `useDeferredValue`)
- Search scope: **name only** (current implementation `r.name.toLowerCase().includes(q)`)
- V1.1 addition: also search **interests** (exact chip word match) and **notes** (substring)

```typescript
// Updated filter in MyPeople.tsx filtered memo:
if (cleanSearch) {
  const q = cleanSearch.toLowerCase();
  list = list.filter((r) =>
    r.name.toLowerCase().includes(q) ||
    r.interests.some(i => i.toLowerCase().includes(q)) ||
    (r.notes || "").toLowerCase().includes(q)
  );
}
```

- Empty result: "No one matches '[query]'." with a link "[+ Add [query] as a new person?]" that pre-fills the name field

#### Filter Chips

- Counts update live as user types in search (shows how many match within each group)
- "Clear filters" appears when any non-All filter is active
- Combined filters: relationship filter + search both active simultaneously (AND logic)

#### Sort

Already implemented. Sort options:
- **Recently added** (default, `created_at DESC`)
- **Upcoming dates** (next `important_date` days ascending; recipients with no dates last)
- **Most gifted** (`gift_count DESC`)

Sort persists across filter changes (stored in `sort` state in `MyPeople`).

### 3.7 Empty States

#### State 1: Zero recipients (new user)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                         🎁                                   │
│                                                              │
│              Let's add your first person                    │
│                                                              │
│    GiftMind works best when you save the people you gift.   │
│    Their profile helps us find smarter, more personal        │
│    matches — and remember what you've already given.        │
│                                                              │
│                  [+ Add Your First Person]                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Currently implemented via `EmptyState` component. Verify `actionLabel` and `description` match above text.

#### State 2: Filter returns zero results

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              No Family members saved yet.                    │
│                                                              │
│    [Clear filter]   or   [+ Add a family member]            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The filter group label is dynamic (e.g. "No Family members", "No Partners", "No Colleagues").

Currently the code shows `<p>No people match your search.</p>` — replace with this component for better UX and add the "Add [type]" shortcut.

#### State 3: Search returns zero results

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│           No one named "Rahul" in your list.                 │
│                                                              │
│              [+ Add Rahul as a new person]                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The `[+ Add Rahul]` button pre-fills `form.name = "Rahul"` before opening the add modal:

```typescript
const openCreate = (prefilledName?: string) => {
  if (atLimit) { setUpgradeOpen(true); return; }
  setEditingId(null);
  setPrefilledName(prefilledName ?? "");
  setModalOpen(true);
};
```

Pass `prefilledName` to `RecipientFormModal` as part of `initialData.name`.

#### State 4: At plan limit (can't add more)

When user clicks "+ Add Person" and `atLimit === true`, the upgrade modal fires. The list itself continues to show locked cards with visual affordance. No empty-state component needed for this case.

---

## Section 4: Logic & State Management

### 4.1 State Machine for Recipient Form

```
┌─────────────┐
│   CLOSED    │◄─────────── user presses Esc / clicks Cancel / clicks X
└──────┬──────┘
       │ user clicks "+ Add Person" or "Edit" on card
       ▼
┌─────────────┐
│  LIMIT      │ ← only when opening Add (not Edit)
│  CHECK      │ → atLimit? → open UpgradeModal, return CLOSED
└──────┬──────┘
       │ not at limit
       ▼
┌─────────────┐
│    OPEN     │ form renders, fields initialized
│  (IDLE)     │◄──────────────────────────────────┐
└──────┬──────┘                                   │
       │ user types / selects                      │
       ▼                                           │
┌─────────────┐                                   │
│   EDITING   │ ←→ user modifies any field        │
└──────┬──────┘                                   │
       │ user clicks Save / Add Person             │
       ▼                                           │
┌──────────────────┐                              │
│  VALIDATING      │ client-side Zod check         │
└────────┬─────────┘                              │
         │                                        │
    ┌────┴─────┐                                  │
    │  valid   │  invalid                         │
    ▼          ▼                                  │
┌───────┐  ┌────────────────┐                    │
│SAVING │  │ INLINE ERRORS  │───────────────────→┘
│       │  │ (field-level)  │ (user stays in form)
└───┬───┘  └────────────────┘
    │
    │  API call in-flight
    │
  success ──→ toast "Pratik added!" → CLOSED → invalidate query → list refreshes
    │
  failure ──→ toast error message → form stays OPEN → user can retry
```

**State held in `MyPeople.tsx`:**
```typescript
const [modalOpen, setModalOpen] = useState(false);
const [editingId, setEditingId] = useState<string | null>(null);
const [prefilledName, setPrefilledName] = useState("");  // ADD THIS
```

**State held in `RecipientFormModal.tsx`:**
```typescript
const [form, setForm] = useState<RecipientFormData>(defaultFormData);
const [customInterest, setCustomInterest] = useState("");
const [countryOpen, setCountryOpen] = useState(false);
const [error, setError] = useState("");
const [isSaving, setIsSaving] = useState(false);  // for disabling save during mutation
```

### 4.2 Plan Limit Enforcement — Three Layers

This is a security-critical feature. Plan limits must enforce at three independent layers so that no single bypass (browser manipulation, race condition, SDK call) can circumvent them.

#### Layer 1: UI (prevents wasted form fill)

```typescript
// MyPeople.tsx
const maxAllowed = getRecipientLimit(plan);
const atLimit = maxAllowed !== -1 && recipients.length >= maxAllowed;

// In openCreate():
const openCreate = () => {
  if (atLimit) { setUpgradeOpen(true); return; }
  setEditingId(null); setModalOpen(true);
};

// In header button:
{atLimit ? (
  <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
    <Lock className="w-3.5 h-3.5 mr-1" /> Upgrade to add more
  </Button>
) : (
  <Button variant="hero" size="sm" onClick={openCreate}>
    <Plus className="w-4 h-4 mr-1" /> Add Person
  </Button>
)}
```

**Purpose:** Prevents user from wasting time filling the form only to be rejected.

#### Layer 2: API pre-check (race condition guard)

```typescript
// MyPeople.tsx createMutation:
const createMutation = useMutation({
  mutationFn: async (form: RecipientFormData) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw createRecipientAuthError("You must be logged in");

    // Re-fetch live count from DB right before insert
    const [{ data: userData }, { count, error: countError }] = await Promise.all([
      supabase.from("users").select("active_plan").eq("id", authUser.id).single(),
      supabase.from("recipients").select("*", { count: "exact", head: true }).eq("user_id", authUser.id),
    ]);

    if (countError) throw countError;

    const activePlan = userData?.active_plan || "spark";
    if (!canAddRecipientForPlan(activePlan, count || 0)) {
      setUpgradeOpen(true);
      throw createRecipientAuthError(getRecipientLimitMessage(activePlan));
    }

    // Proceed with insert
    const payload = buildRecipientInsertPayload(authUser.id, form);
    const { data, error } = await supabase.from("recipients").insert(payload).select().single();
    if (error) throw createRecipientMutationError("insert", error, payload);
    return data;
  }
});
```

**Purpose:** Catches the race condition where user has two tabs open, adds a recipient in Tab 1, then tries to add another in Tab 2 before Tab 2's count refreshed.

#### Layer 3: Database trigger (unbypassable, security-critical)

```sql
-- supabase/migrations/recipient_limit_rls_hardening.sql (already deployed)
CREATE OR REPLACE FUNCTION public.check_recipient_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  SELECT active_plan INTO v_plan FROM public.users WHERE id = NEW.user_id;
  SELECT count(*) INTO v_count FROM public.recipients WHERE user_id = NEW.user_id;

  v_max := CASE v_plan
    WHEN 'spark' THEN 1
    WHEN 'thoughtful' THEN 5
    WHEN 'confident' THEN 15
    WHEN 'gifting-pro' THEN -1
    ELSE 1  -- Default: treat unknown plan as spark (safe fallback)
  END;

  IF v_max != -1 AND v_count >= v_max THEN
    RAISE EXCEPTION 'Recipient limit reached. Plan "%" allows % people.', v_plan, v_max;
  END IF;

  RETURN NEW;
END;
$$;
```

**Purpose:** Cannot be bypassed via browser devtools, compromised frontend code, or direct Supabase SDK calls. Fires BEFORE INSERT at the PostgreSQL level.

**Error handling for trigger rejection:**

```typescript
// In createRecipientMutationError:
if (lowerMessage.includes('recipient limit reached')) {
  userMessage = "You've reached your plan's recipient limit. Upgrade to add more people.";
}
```

#### Why all three layers are required

| Layer | What it prevents |
|-------|-----------------|
| UI | Wasted form fill; bad UX |
| API pre-check | Race condition (2 browser tabs) |
| DB trigger | Browser console attack; compromised frontend; server-side scripts |

**Verification:** After deploying `recipient_limit_rls_hardening.sql`, confirm the trigger is active:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'enforce_recipient_limit';
```

### 4.3 Data Validation Rules

All validation runs client-side first (immediate feedback), then server-side (DB constraints).

```typescript
// src/lib/recipientValidation.ts (new file)
import { z } from "zod";

export const importantDateSchema = z.object({
  label: z.string().min(1, "Label required").max(50),
  date: z.string().regex(/^\d{2}-\d{2}$/, "Use MM-DD format (e.g. 03-16)"),
  recurring: z.boolean().default(true),
});

export const recipientSchema = z.object({
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be 50 characters or fewer")
    .trim(),

  relationship_type: z.string().min(1, "Please select a relationship"),

  relationship_depth: z.enum(["very_close", "close", "acquaintance"]).default("close"),

  country: z.string().length(2).toUpperCase().nullable().or(z.literal("")).or(z.literal("OTHER")).transform(v => v || null),

  age_range: z.enum(["under_18", "18_25", "25_35", "35_50", "50_65", "65_plus"]).nullable().optional(),

  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).nullable().optional(),

  interests: z.array(z.string().min(1).max(50)).max(10, "Maximum 10 interests").default([]),

  notes: z.string().max(500, "Notes must be 500 characters or fewer").nullable().optional(),

  important_dates: z.array(importantDateSchema).max(5, "Maximum 5 dates per person").default([]),

  cultural_context: z.string().nullable().optional(),
});

export type RecipientFormSchema = z.infer<typeof recipientSchema>;
```

Validation fires in `handleSubmit` before calling `onSubmit`:

```typescript
const handleSubmit = (e: FormEvent) => {
  e.preventDefault();
  const result = recipientSchema.safeParse(form);
  if (!result.success) {
    const firstError = result.error.issues[0];
    setError(firstError.message);
    return;
  }
  setError("");
  onSubmit(result.data);
};
```

### 4.4 Edge Cases & Behaviors

1. **Duplicate name:** Two recipients with same name (e.g. two friends both named "Alex") — **allow**. Show both in list. No deduplication logic.

2. **Emoji in name:** Allow. The current `sanitizeString()` call trims to max length but does not strip emoji. This is fine — emoji in names is valid (e.g. "Mom 💕"). Strip only zero-width joiners and control characters if needed.

3. **User at Spark (1 person), signs out and back in:** Recipient count persists in DB. Returns to list with 1 active recipient. No re-onboarding needed.

4. **User upgrades from Spark → Confident:** All previously locked recipients become active immediately because `activeRecipientIds` is re-computed from the new `maxAllowed` on next render. No DB migration needed.

5. **User downgrades from Confident (15) → Spark (1):** 14 recipients become locked. They are NOT deleted. Locked overlay shows. User can still edit their profiles. Cannot be used in gift flow.

6. **Feb 29 birthday:** Store as "02-29". In `getDaysUntil()`, if `new Date(year, 1, 29)` is invalid (non-leap year), result is `NaN`. Fix:
   ```typescript
   const target = new Date(today.getFullYear(), mm - 1, dd);
   if (isNaN(target.getTime())) {
     // Leap day: use Feb 28 as proxy for reminder purposes
     return getDaysUntil(`02-28`);
   }
   ```

7. **User adds interest "cooking" when "Cooking" already exists:** Current code is case-sensitive, so both would be added. Fix: normalize to title-case or lowercase on input, compare case-insensitively before adding.

8. **User adds 11th interest:** Current `sanitizeArray(form.interests, 15)` allows up to 15. Reduce limit to 10. Show inline message "Maximum 10 interests" when user tries to add the 11th — disable the `[+]` button.

9. **Two tabs open, adds recipient in Tab 1:** Tab 2's `useQuery` cache is stale. Tab 2 still shows the old count. The API pre-check (Layer 2) re-queries the DB fresh, so the DB trigger (Layer 3) will catch it even if the UI doesn't.

10. **User's plan expires (Confident → Spark via expiry):** The `active_plan` column in users is updated by the expiry cron. On next page load, `useUserPlan()` returns 'spark', `maxAllowed` becomes 1, and the 14 over-limit recipients become locked.

11. **Delete recipient — what happens to gift_sessions?**  
    **Current behavior:** `ON DELETE CASCADE` on `recipients_user_id_fkey` propagates to nothing (gift_sessions has its own FK). Check `gift_sessions.recipient_id` FK. If it cascades, gift history is deleted.  
    **Decision:** `gift_sessions.recipient_id` should be SET NULL on recipient delete, not CASCADE. This preserves analytics and gift history even when the person is removed. Requires a migration:
    ```sql
    ALTER TABLE public.gift_sessions
      DROP CONSTRAINT IF EXISTS gift_sessions_recipient_id_fkey,
      ADD CONSTRAINT gift_sessions_recipient_id_fkey
        FOREIGN KEY (recipient_id) REFERENCES public.recipients(id) ON DELETE SET NULL;
    ```

12. **User adds recipient with only name:** Valid. All optional fields can be null/empty. Minimum viable recipient = name + relationship.

13. **Form save fails (network error):** Form data stays in local state (already the case — `useState` in modal). Show toast "Something went wrong. Try again." with retry. Do not close the modal.

14. **`active_plan` is NULL in DB:** `getRecipientLimit(null)` returns `RECIPIENT_LIMITS.spark = 1` via the `?? RECIPIENT_LIMITS.spark` fallback in `planLimits.ts`. Safe.

15. **Bulk import 50 recipients at once (V2):** Not in scope for V1. When implemented: batch insert → validate each row client-side → show summary of accepted/rejected.

### 4.5 Sort & Filter Logic

**Decision rule:**
- Users with ≤ 50 recipients: fetch ALL on page load, sort/filter/search entirely client-side
- Users with > 50 recipients (future): paginate with `LIMIT 20 OFFSET n`

For V1, all users have ≤ 50 recipients (Gifting Pro = unlimited but practically rare to exceed 50 in early months). Keep client-side approach.

**Gift count enrichment:** `recipientGiftStats` is computed in `MyPeople.tsx` from a separate `gift_sessions` query. This is a client-side JOIN. For V1 with small data sets this is fine. For V2 with large lists, add `session_count` and `gift_count` columns to the recipients table and maintain them via trigger.

---

## Section 5: System Design & Backend

### 5.1 Database Schema — Complete Target State

```sql
-- =============================================================
-- Migration: 02-recipient-management-v1.1.sql
-- =============================================================

-- Step 1: Ensure the recipients table has all required columns
ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_count_cached int DEFAULT 0;

-- Step 2: Add check constraint on name length (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'recipients' AND constraint_name = 'recipients_name_length'
  ) THEN
    ALTER TABLE public.recipients
      ADD CONSTRAINT recipients_name_length CHECK (length(name) >= 2 AND length(name) <= 50);
  END IF;
END $$;

-- Step 3: Add check constraint on notes length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'recipients' AND constraint_name = 'recipients_notes_length'
  ) THEN
    ALTER TABLE public.recipients
      ADD CONSTRAINT recipients_notes_length CHECK (notes IS NULL OR length(notes) <= 500);
  END IF;
END $$;

-- Step 4: Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_recipients_user_id
  ON public.recipients(user_id);

CREATE INDEX IF NOT EXISTS idx_recipients_user_created
  ON public.recipients(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipients_user_last_gift
  ON public.recipients(user_id, last_gift_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_recipients_user_archived
  ON public.recipients(user_id, is_archived);

-- GIN index for searching interests array
CREATE INDEX IF NOT EXISTS idx_recipients_interests_gin
  ON public.recipients USING GIN(interests);

-- Step 5: Change gift_sessions.recipient_id FK to SET NULL on delete
-- (preserves gift history when recipient is deleted)
ALTER TABLE public.gift_sessions
  DROP CONSTRAINT IF EXISTS gift_sessions_recipient_id_fkey;

ALTER TABLE public.gift_sessions
  ADD CONSTRAINT gift_sessions_recipient_id_fkey
    FOREIGN KEY (recipient_id)
    REFERENCES public.recipients(id)
    ON DELETE SET NULL;

-- Step 6: Trigger to update session_count / gift_count_cached on recipients
-- when gift_sessions are inserted/updated
CREATE OR REPLACE FUNCTION public.update_recipient_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id uuid;
BEGIN
  v_recipient_id := COALESCE(NEW.recipient_id, OLD.recipient_id);
  IF v_recipient_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.recipients
  SET
    session_count = (
      SELECT count(*) FROM public.gift_sessions
      WHERE recipient_id = v_recipient_id
    ),
    gift_count_cached = (
      SELECT count(*) FROM public.gift_sessions
      WHERE recipient_id = v_recipient_id
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    ),
    last_gift_date = (
      SELECT max(created_at) FROM public.gift_sessions
      WHERE recipient_id = v_recipient_id
        AND (status = 'completed' OR selected_gift_name IS NOT NULL)
    )
  WHERE id = v_recipient_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gift_sessions_update_recipient_stats ON public.gift_sessions;
CREATE TRIGGER gift_sessions_update_recipient_stats
  AFTER INSERT OR UPDATE ON public.gift_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_recipient_stats();
```

**Column rationale:**

| Column | Why it exists |
|--------|--------------|
| `is_archived` | Enables V2 soft-delete without schema migration later. For V1 always false. |
| `session_count` | Avoids COUNT query on every list render. Updated by trigger. |
| `gift_count_cached` | Avoids COUNT + WHERE query on every list render. Updated by trigger. |
| `interests text[]` | GIN-indexed array enables fast `@>` containment queries for future AI queries |
| `important_dates jsonb` | Flexible schema without a join table for V1. Up to 5 dates per person. |
| `cultural_context text` | V1: single enum string. V2: migrate to jsonb. |
| FK SET NULL on gift_sessions | Preserves user's gift history analytics when they delete a contact |

**Why NOT a separate `important_dates` table for V1:**
- Join table adds complexity (two tables, two RLS policies, cascade rules) for a feature that stores ≤ 5 items per recipient
- JSONB with GIN index is fast enough for the access pattern (read all dates for a single recipient)
- V2 can migrate if reminder logic becomes complex enough to warrant it

### 5.2 RLS Policies (Current State — No Changes Needed)

Policies are already correctly defined in `supabase/migrations/recipient_limit_rls_hardening.sql`. Full policy set:

```sql
-- SELECT: own recipients only
CREATE POLICY recipients_select ON public.recipients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: only for own user_id
CREATE POLICY recipients_insert ON public.recipients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: own recipients, WITH CHECK prevents user_id tampering
CREATE POLICY recipients_update ON public.recipients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: own recipients only
CREATE POLICY recipients_delete ON public.recipients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admin read-only
CREATE POLICY superadmin_select_all_recipients ON public.recipients
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));
```

**Why separate policies (not one `FOR ALL`):**
- `FOR ALL` with only `USING` does not apply a check during INSERT (INSERT has no pre-existing row to check)
- Explicit `WITH CHECK` on UPDATE is required to prevent `user_id` tampering attacks (user updating a row to point to another user's ID)
- Superadmin is SELECT only — no INSERT/UPDATE/DELETE; support sees data, cannot modify it

### 5.3 Plan Limit Trigger (Already Deployed)

The `check_recipient_limit()` function and `enforce_recipient_limit` trigger are deployed in `recipient_limit_rls_hardening.sql`. No changes needed.

**Verification query (run in production):**
```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'check_recipient_limit';

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'recipients'
  AND trigger_name = 'enforce_recipient_limit';
```

Both must return rows. If `enforce_recipient_limit` is missing, the DB-layer limit is not enforced.

### 5.4 API Contracts (Direct Supabase Calls)

No Edge Functions needed for recipient CRUD. All operations go through Supabase client with RLS.

```typescript
// src/hooks/useRecipients.ts (NEW — extract from MyPeople.tsx)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RecipientFormData } from "@/components/recipients/constants";
import {
  buildRecipientInsertPayload,
  buildRecipientUpdatePayload,
  createRecipientAuthError,
  createRecipientMutationError,
} from "@/lib/recipients";
import { canAddRecipientForPlan, getRecipientLimit, getRecipientLimitMessage } from "@/lib/planLimits";

export function useRecipients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_archived", false)         // Filter out archived (V2 prep)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,  // 30s — recipients don't change that frequently
  });

  const createMutation = useMutation({
    mutationFn: async ({
      form,
      onAtLimit,
    }: {
      form: RecipientFormData;
      onAtLimit: () => void;
    }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in");

      const [{ data: userData }, { count, error: countError }] = await Promise.all([
        supabase.from("users").select("active_plan").eq("id", authUser.id).single(),
        supabase.from("recipients").select("*", { count: "exact", head: true }).eq("user_id", authUser.id),
      ]);
      if (countError) throw countError;

      const activePlan = userData?.active_plan || "spark";
      const maxAllowed = getRecipientLimit(activePlan);
      if (!canAddRecipientForPlan(activePlan, count ?? 0)) {
        onAtLimit();
        throw createRecipientAuthError(getRecipientLimitMessage(activePlan, maxAllowed));
      }

      const payload = buildRecipientInsertPayload(authUser.id, form);
      const { data, error } = await supabase
        .from("recipients").insert(payload).select().single();
      if (error) throw createRecipientMutationError("insert", error, payload);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipients", user?.id] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: RecipientFormData }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in");

      const payload = buildRecipientUpdatePayload(form);
      const { error } = await supabase
        .from("recipients").update(payload)
        .eq("id", id).eq("user_id", authUser.id);
      if (error) throw createRecipientMutationError("update", error, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipients", user?.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in");
      const { error } = await supabase
        .from("recipients").delete()
        .eq("id", id).eq("user_id", authUser.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipients"] }),
  });

  return { query, createMutation, updateMutation, deleteMutation };
}

// Separate hook for gift session intelligence (keep separate — different cache key)
export function useRecipientGiftSessions(userId: string | undefined) {
  return useQuery({
    queryKey: ["recipient-intelligence", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("recipient_id,created_at,status,selected_gift_name")
        .eq("user_id", userId!)
        .not("recipient_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
```

**When an Edge Function IS needed (V2):**
- Bulk CSV import (validate, batch insert, return error summary)
- Force-delete with full cross-table cleanup (admin use)
- Export recipient data as PDF/CSV (generate at edge, return blob)

### 5.5 Error Handling

Map every known error to a user-friendly message:

```typescript
// Extension of createRecipientMutationError in src/lib/recipients.ts
export function mapRecipientError(error: PostgrestError | Error): string {
  const msg = error.message.toLowerCase();

  // DB constraint violations
  if ('code' in error) {
    if (error.code === '23514') {
      if (msg.includes('name')) return 'Name must be 2–50 characters';
      if (msg.includes('notes')) return 'Notes must be under 500 characters';
      return 'One of the fields has an invalid value';
    }
    if (error.code === '23503' && msg.includes('user_id')) {
      return 'Session expired. Please log in again.';
    }
    if (error.code === '23505') {
      return 'This person already exists in your list';
    }
  }

  // Custom trigger error
  if (msg.includes('recipient limit reached')) {
    return "You've reached your plan's limit. Upgrade to add more people.";
  }

  // RLS denial
  if (msg.includes('row-level security') || msg.includes('violates row-level security')) {
    return 'Permission denied. Please log out and back in.';
  }

  // Network / timeout
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'Connection issue. Check your internet and try again.';
  }

  return 'Something went wrong. Please try again.';
}
```

**Error display hierarchy:**
1. Inline field error (for `name` length, `notes` length): shown below the specific field
2. Form-level error banner: shown above submit button for non-field errors (plan limit, permission)
3. Toast error: shown for network failures after the form closes or for delete failures

### 5.6 Analytics Events

All events fire via `trackEvent()` in `src/lib/posthog.ts`.

| Event Name | Properties | When Fired |
|-----------|------------|------------|
| `recipient_list_viewed` | `recipients_count`, `plan`, `locked_count` | Page load, after query resolves |
| `recipient_add_started` | `recipients_current_count`, `plan` | "+ Add Person" button click (not at limit) |
| `recipient_add_completed` | `relationship_type`, `has_interests`, `has_dates`, `has_notes`, `fields_filled_count`, `plan` | Save success |
| `recipient_add_abandoned` | `time_spent_ms`, `last_field_touched`, `fields_filled_count` | Modal closed without save (after any field was touched) |
| `recipient_edit_started` | `recipient_id`, `is_locked` | Edit click |
| `recipient_edit_completed` | `recipient_id`, `changed_fields` | Save changes success |
| `recipient_deleted` | `recipient_id`, `had_gift_history`, `was_locked` | Delete confirmed |
| `recipient_limit_reached` | `plan`, `current_count`, `max_allowed` | At-limit upgrade prompt shown |
| `recipient_upgrade_clicked` | `plan`, `upgrade_to`, `trigger_action` | Upgrade modal CTA clicked |
| `recipient_filter_applied` | `filter_label`, `result_count` | Filter chip clicked |
| `recipient_sort_changed` | `sort_option` | Sort dropdown changed |
| `recipient_search_performed` | `query_length`, `result_count` | Debounced search fires (300ms) |
| `recipient_card_clicked` | `recipient_id`, `is_locked` | Card body click (opens detail panel) |
| `recipient_find_gift_clicked` | `recipient_id`, `from` | "Find a Gift" CTA clicked |
| `recipient_detail_opened` | `recipient_id` | Detail panel opens |

**Implementation note:** `recipient_add_abandoned` requires tracking whether any field was touched. Use a `formTouched` flag that sets to `true` on first `onChange` event. Fire the event in the `onOpenChange(false)` handler only if `formTouched && !submitSucceeded`.

### 5.7 Performance Considerations

| Concern | Target | Approach |
|---------|--------|----------|
| List load time | < 300ms p95 | Index on `(user_id, created_at)` |
| Gift session join | Avoid on list | Client-side enrichment from pre-fetched query |
| Sort/filter | Instant (no network) | Client-side `useMemo` on fetched data |
| Form open | Instant | No async on open; data already in state |
| Delete response | < 500ms p95 | Direct DELETE query, optimistic UI |
| Skeleton duration | ≤ 200ms typical | Supabase local cache (staleTime 30s) |

**Stale-while-revalidate:** `staleTime: 30_000` on recipients query means navigating away and back shows cached data immediately, then background refetches. Acceptable for a list that changes infrequently.

**No N+1 queries:** `recipientGiftStats` is a single query fetching all sessions for the user, then reduced to a map client-side. This is `O(sessions)` not `O(recipients × sessions)`.

---

## Section 6: Component Breakdown

### Target File Structure

```
src/
├── pages/
│   └── MyPeople.tsx                     (main page, owns global state)
├── components/
│   └── recipients/
│       ├── RecipientCard.tsx            (individual card — update Find a Gift visibility)
│       ├── RecipientFormModal.tsx       (add/edit form modal — update notes maxLength, add stats strip)
│       ├── RecipientDetailPanel.tsx     (NEW: expanded read-only view using Sheet)
│       └── constants.ts                (enums, colors, form types — add label dropdown options)
├── hooks/
│   └── useRecipients.ts                (NEW: extract CRUD from MyPeople.tsx)
└── lib/
    ├── recipients.ts                   (payload builders — no changes needed)
    ├── planLimits.ts                   (plan limit helpers — no changes needed)
    └── recipientValidation.ts          (NEW: Zod schema for client-side validation)
```

### Component Specifications

#### MyPeople.tsx (updated)

```typescript
// Responsibilities:
// - Owns search, filter, sort state
// - Renders RecipientList via RecipientCard grid
// - Manages modal open/close state
// - Delegates CRUD to useRecipients hook
// - Handles upgrade modal state

// Key state changes:
const [detailPanelId, setDetailPanelId] = useState<string | null>(null);  // NEW
const [prefilledName, setPrefilledName] = useState("");  // NEW

// Remove inline query logic (move to useRecipients hook)
const { query: { data: recipients, isLoading }, createMutation, updateMutation, deleteMutation } = useRecipients();
```

#### RecipientCard.tsx (updated)

```typescript
interface RecipientCardProps {
  recipient: RecipientWithIntelligence;
  userCountry: string;
  onEdit: () => void;
  onDelete: () => void;
  onFindGift: () => void;
  onCardClick: () => void;  // NEW: opens detail panel
  isLocked?: boolean;
}

// Fix: Remove opacity-0 / group-hover:opacity-100 from Find a Gift button
// Always show the CTA — it's the primary action
```

#### RecipientDetailPanel.tsx (NEW)

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecipientDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string | null;
  recipients: RecipientWithIntelligence[];
  onEdit: (id: string) => void;
  onFindGift: (id: string) => void;
}

// Responsibilities:
// - Read-only view of a single recipient
// - Fetches gift history via a secondary query (useQuery keyed on recipientId)
// - Shows profile fields, interests, cultural context, dates
// - Shows gift history timeline (last 10 sessions)
// - Primary CTA: Find a Gift button
// - Edit button in header opens edit modal
```

#### RecipientFormModal.tsx (updated)

```typescript
interface RecipientFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RecipientFormData) => void;
  onDelete?: () => void;       // NEW: triggers delete confirmation outside the modal
  initialData?: RecipientFormData;
  loading?: boolean;
  reminderNote?: string;
  stats?: {                    // NEW: edit-mode stats strip
    giftCount: number;
    sessionCount: number;
    lastGiftDate: string | null;
    addedAt: string;
  };
}

// Changes:
// 1. Update title to "Edit [Name] ✨" when isEdit
// 2. Add stats strip when stats prop is provided (isEdit only)
// 3. Fix notes maxLength: 1000 → 500
// 4. Add live character counter to notes field
// 5. Add "Delete [Name]" ghost button at bottom of form (calls onDelete prop)
// 6. Change important_dates label field from free-text to dropdown + custom
// 7. Add format hint and validation to date field
```

#### useRecipients.ts (NEW)

See full implementation in Section 5.4. Extracts `useQuery` for recipients, `useQuery` for gift sessions, and all three mutations from `MyPeople.tsx`. `MyPeople.tsx` calls this hook instead of defining queries inline.

#### constants.ts (updated)

```typescript
// Add label options for important dates
export const DATE_LABEL_OPTIONS = [
  { value: "Birthday", label: "Birthday", emoji: "🎂" },
  { value: "Anniversary", label: "Anniversary", emoji: "💍" },
  { value: "Work Anniversary", label: "Work Anniversary", emoji: "💼" },
  { value: "Graduation", label: "Graduation", emoji: "🎓" },
  { value: "Housewarming", label: "Housewarming", emoji: "🏠" },
  { value: "Other", label: "Other...", emoji: "📅" },
] as const;

// Add grandparent to RELATIONSHIP_TYPES (currently missing):
{ value: "grandparent", label: "Grandparent", emoji: "👴" },
```

---

## Section 7: Integration Points

### 7.1 Gift Flow (`/gift-flow`)

**Direction:** My People → Gift Flow (one-way data read)  
**How:** Gift flow Step 1 allows recipient selection. URL param: `/gift-flow?recipient={id}`. Gift flow reads recipient profile to pre-fill context (relationship, age, interests, country).

**Data flow:**
```typescript
// In gift flow (GiftCard.tsx or similar):
const recipientId = searchParams.get("recipient");
const { data: recipient } = useQuery({
  queryKey: ["recipient", recipientId],
  queryFn: () => supabase.from("recipients").select("*").eq("id", recipientId).single(),
  enabled: !!recipientId,
});
// recipient.interests, recipient.age_range, etc. pre-fill the session
```

**Fallback:** If `recipientId` is not found (deleted recipient, wrong URL), gift flow shows the manual entry form as if no recipient was provided.

**Testing:** After adding a recipient, click "Find a Gift" from My People → verify the recipient's name and relationship appear in gift flow Step 1.

### 7.2 Onboarding (Step 3)

**Direction:** Onboarding → creates recipient (one-time write)  
**How:** Onboarding Step 3 collects first recipient data and calls the same `createRecipient` mutation. The onboarding flow navigates to My People after completion.

**Fallback:** If onboarding Step 3 fails to create the recipient (DB error, plan limit hit), user still reaches My People. The empty state prompts them to add their first person.

**Testing:** Complete onboarding → verify recipient appears in My People with correct fields.

### 7.3 Occasion Engine (send-occasion-reminders)

**Direction:** Occasion Engine reads from recipients (one-way read)  
**How:** The Supabase Edge Function `send-occasion-reminders` queries `recipients.important_dates` for upcoming dates and sends emails.

**Data flow:**
```typescript
// In send-occasion-reminders/index.ts (existing):
const { data: recipients } = await supabase
  .from("recipients")
  .select("id, user_id, name, important_dates")
  .not("important_dates", "eq", "[]");

// For each recipient, parse important_dates and check if any date
// falls within reminder window (14 days, 7 days, 2 days)
```

**Fallback:** If `important_dates` is malformed JSON, log error per recipient but continue processing others.

**Testing:** Set a recipient birthday to 7 days from today → trigger the Edge Function manually → verify email is sent.

### 7.4 Gift History (`/gift-history`)

**Direction:** Bi-directional (gift_sessions reference recipients)  
**How:** Gift History page filters sessions by `recipient_id`. When a recipient is deleted, `recipient_id` becomes NULL (SET NULL FK) but the session remains in history.

**Fallback:** Sessions with `recipient_id = null` show as "Unknown person" or "(Recipient deleted)" in gift history.

**Testing:** Add recipient → run a gift session → view gift history → verify session appears under recipient's name. Then delete recipient → verify session still appears in history (with null recipient label).

### 7.5 Recipient Memory (AI Layer)

**Direction:** AI reads from recipients (one-way read)  
**How:** When generating gift recommendations, the AI prompt includes the recipient's `interests`, `age_range`, `cultural_context`, `notes`, and past `gift_sessions.selected_gift_name` to avoid repeating gifts.

**Data flow:**
```typescript
// In AI prompt builder (supabase/functions/_shared/ai-providers.ts or similar):
const context = {
  recipientName: recipient.name,
  relationship: recipient.relationship,
  age: recipient.age_range,
  interests: recipient.interests,
  culturalContext: recipient.cultural_context,
  notes: recipient.notes,
  pastGifts: pastSessions.map(s => s.selected_gift_name).filter(Boolean),
};
```

**Impact of this PRD:** Adding dietary preferences to `cultural_context` jsonb improves AI filtering (e.g. don't suggest food gifts that contain meat for a vegetarian).

**Fallback:** If recipient has minimal data (name + relationship only), AI still generates recommendations — they're just less personalized.

### 7.6 Plans & Credits

**Direction:** Plan data gates recipient count (read-only)  
**How:** `useUserPlan()` returns `plan` and `limits`. `getRecipientLimit(plan)` returns max count. DB trigger reads `active_plan` from `users` table.

**Critical:** The `active_plan` column in `users` must be kept in sync by the payment/expiry system. If `active_plan` is NULL or stale, recipient limits default to 'spark' (safest fallback).

**Testing:** Set `active_plan = 'spark'` for a user with 5 recipients → verify 4 become locked. Set `active_plan = 'confident'` → verify all become active.

### 7.7 Admin Dashboard

**Direction:** Superadmin reads recipients (no write)  
**How:** `superadmin_select_all_recipients` RLS policy allows superadmin users to SELECT any recipient. Admin pages can query all recipients for support purposes.

**Fallback:** Non-superadmin users have zero access to other users' recipients (RLS blocks it).

---

## Section 8: Edge Cases & Error States

### 8.1 Empty State (0 recipients)

**Condition:** `recipients.length === 0` and not loading  
**Display:** Large centered illustration (🎁 emoji), heading "Let's add your first person", 2-line description, primary CTA button  
**Currently implemented:** Yes, in `MyPeople.tsx:394-403` via `EmptyState` component  
**Fix needed:** Verify CTA button calls `openCreate()` (it does: `onAction={openCreate}`)

### 8.2 Loading State

**Condition:** `recipientsLoading || giftSessionsLoading`  
**Display:** Grid of 4 skeleton cards. Each has avatar circle placeholder, two text line placeholders  
**Currently implemented:** Yes, `MyPeople.tsx:378-393`  
**Note:** Use `staleTime` to avoid showing skeletons on repeat visits within 30s

### 8.3 Error State (DB failure)

**Condition:** `useQuery` throws error  
**Display:** Currently not handled (silently shows empty). Add:

```typescript
// In MyPeople.tsx:
const { data: recipients = [], isLoading, isError } = useQuery(...);

// In JSX:
if (isError) {
  return (
    <div className="py-12 text-center">
      <p className="text-muted-foreground">Couldn't load your people.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ["recipients"] })}>
        Try again
      </Button>
    </div>
  );
}
```

### 8.4 Filtered Empty State

**Condition:** `filtered.length === 0` but `recipients.length > 0`  
**Display (search):** "No one named '[query]'" + "[+ Add [query] as a new person]" button  
**Display (filter):** "No [Family/Friends/etc.] saved yet." + "[Clear filter]" + "[+ Add one]"  
**Currently implemented:** Shows plain text "No people match your search." — replace with described behavior

### 8.5 At-Limit State

**Condition:** `atLimit === true`  
**Display:** Header button changes to "🔒 Upgrade to add more". Upgrade modal on click.  
**Currently implemented:** Yes

### 8.6 Over-Limit (Locked Cards) State

**Condition:** `isLocked === true` for a card  
**Display:** Opacity 0.6, blur overlay, lock icon, "🔒 Upgrade to use this person in gift sessions"  
**Currently implemented:** Yes, `RecipientCard.tsx:105-112`

### 8.7 Offline State (PWA)

**Condition:** User has no internet connection  
**Display:** React Query returns cached data (staleTime 30s → then shows stale). After cache expires: `isError` state → "Couldn't load your people. Check your connection."  
**Note:** The app has a PWA install prompt (`InstallPrompt.tsx`). Offline behavior should show cached recipients if available. The `staleTime: 30_000` + React Query's cache-first behavior handles this implicitly.

### 8.8 Save Failure State

**Condition:** `createMutation` or `updateMutation` fails  
**Display:** Toast error message (already implemented). Form stays open with data intact.  
**Add:** Retry CTA in toast:

```typescript
toast.error(error.userMessage || "Failed to add person.", {
  action: { label: "Retry", onClick: () => createMutation.mutate(form) },
});
```

### 8.9 Validation Error State

**Condition:** Client-side Zod validation fails  
**Display:** `error` state in form shows above submit button. Field-specific errors shown inline below the relevant field (after migrating to Zod).  
**Current:** Shows a single `error` string above submit. Good enough for V1.

### 8.10 Permission Denied State

**Condition:** RLS policy blocks operation  
**Display:** Toast "Permission denied. Please log out and back in."  
**Currently implemented:** Via `createRecipientMutationError` mapping in `src/lib/recipients.ts:99`

### 8.11 Session Expired State

**Condition:** Supabase auth token expired during form fill  
**Display:** Toast "Session expired. Please log in again."  
**Currently implemented:** `createRecipientAuthError` in mutation fn checks `authUser`

---

## Section 9: Acceptance Criteria

### P0 — Must Have (release-blocking)

- [ ] User can add a recipient with name + relationship (minimum required fields) and it saves to DB
- [ ] User can edit any field on an existing recipient; changes persist after page refresh
- [ ] User can delete a recipient with a confirmation dialog; recipient is removed from DB
- [ ] After deleting a recipient, gift sessions for that recipient still exist in gift history (recipient_id = NULL)
- [ ] Recipients list loads in < 500ms for users with < 50 recipients (Chrome DevTools Network tab)
- [ ] Plan limit enforced at UI: Spark user with 1 recipient sees "🔒 Upgrade to add more" instead of "+ Add Person"
- [ ] Plan limit enforced at API: pre-check in mutation prevents race-condition bypass
- [ ] Plan limit enforced at DB: `enforce_recipient_limit` trigger is active and rejects over-limit inserts
- [ ] Spark users can save exactly 1 recipient; inserting a 2nd returns error
- [ ] Over-limit recipients display locked overlay (opacity/blur/lock icon) and cannot be used in gift flow
- [ ] Over-limit recipients can still be edited (profile updates) and deleted
- [ ] Interests chip input: max 10 chips enforced (not 15)
- [ ] Notes textarea: maxLength 500, not 1000
- [ ] Important dates accept MM-DD format and display correctly in RecipientCard
- [ ] Filter chips (All/Partners/Family/Friends/Colleagues) filter the visible list
- [ ] Search by name returns matching results; empty search shows all
- [ ] All RLS policies prevent cross-user data access (verified by attempting SELECT with mismatched user_id)
- [ ] `recipient_add_completed` PostHog event fires on successful save with `relationship_type` property
- [ ] Mobile responsive at 375px minimum width (no horizontal scroll on iPhone SE)
- [ ] "Find a Gift" CTA on card is always visible (not hidden behind hover state)

### P1 — Should Have (ship-blocker for full release, not for beta)

- [ ] `useRecipients.ts` hook extracted from `MyPeople.tsx`; page component is clean of inline Supabase queries
- [ ] Recipient detail panel opens on card click (Sheet/drawer, shows profile + gift history)
- [ ] Edit modal title uses recipient's name: "Edit Pratik ✨" not "Edit Person ✨"
- [ ] Edit modal shows stats strip: gifts chosen, sessions, last gift date
- [ ] Country flag displays next to name when recipient country ≠ user country
- [ ] Avatar circle uses relationship-appropriate color
- [ ] Card shows last gift date in "Mon YYYY" format
- [ ] Important dates: label field uses dropdown (Birthday/Anniversary/Work Anniversary/etc.) not free text
- [ ] Important dates: MM-DD validation with format hint on blur
- [ ] Inline error for Zod validation (not just a single error string above form)
- [ ] Filter empty state: "No [type] saved yet" with clear-filter + add shortcut
- [ ] Search empty state: "No one named 'X'" with pre-filled add CTA
- [ ] Error state: DB failure shows retry button, not silent empty
- [ ] Sort by "Upcoming dates" correctly surfaces recipients with dates coming up within 14 days
- [ ] Sort by "Most gifted" correctly uses gift_count from gift_sessions data
- [ ] `recipient_list_viewed` PostHog event fires on page load
- [ ] `recipient_limit_reached` PostHog event fires when upgrade prompt shown

### P2 — Nice to Have (post-launch)

- [ ] Dietary preferences field in cultural context section
- [ ] `is_archived` column present in DB (even if no UI for archiving yet)
- [ ] `gift_count_cached` and `session_count` columns maintained by trigger (reduces client-side computation)
- [ ] `gift_sessions.recipient_id` FK changed to SET NULL on delete
- [ ] Live character counter on notes field (`{n} / 500`)
- [ ] "Save Changes" button disabled when form has no changes (requires deep equality check)
- [ ] Toast retry action on save failure
- [ ] `recipient_add_abandoned` event fires when modal closed after form was touched
- [ ] Case-insensitive duplicate detection on interests
- [ ] Keyboard shortcuts: Esc closes modal, Cmd+Enter submits form

---

## Section 10: Open Questions & Decisions

### 10.1 Hard Delete vs Soft Delete for V1

**Options:**
- A: Hard delete (current) — simple, clean, immediate
- B: Soft delete — set `is_archived = true`, never physically delete

**Decision (MADE):** Hard delete for V1. Add `is_archived` column (always false for now) so V2 can implement without migration. The delete dialog mentions "coming soon" for archive. Gift history preserved via SET NULL FK.

### 10.2 Cascade Behavior on gift_sessions.recipient_id

**Current state:** Unknown — FK constraint may CASCADE or RESTRICT. Must verify.

**Decision (MADE):** Change to `ON DELETE SET NULL`. Session history is valuable for analytics even when the person is deleted. Shows as "(Recipient deleted)" in gift history. Migration in Section 5.1.

**Action required:** Check current FK definition:
```sql
SELECT conname, confdeltype
FROM pg_constraint
WHERE conname = 'gift_sessions_recipient_id_fkey';
-- confdeltype: 'a' = NO ACTION, 'r' = RESTRICT, 'c' = CASCADE, 'n' = SET NULL, 'd' = SET DEFAULT
```

### 10.3 Should Locked Recipients Be Editable?

**Decision (MADE):** Yes, locked recipients can be edited (profile updates, interest changes). They cannot be selected in gift flow (button disabled, upgrade modal fires). Rationale: user paid for the data by entering it; locking edit would be punitive and would hurt data quality.

### 10.4 Maximum Recipients on Gifting Pro

**Marketing copy says "Unlimited."** Practical question: is there a soft cap?

**Decision (RECOMMENDED):** No cap for V1 (`-1 = unlimited` in plan config). Monitor. At 500+ recipients per user, evaluate pagination. No change needed now.

### 10.5 Gender Field — Required or Optional?

**Decision (MADE):** Optional (already implemented). The AI can generate good recommendations without it. Including "Prefer not to say" handles cases where user doesn't know or recipient hasn't disclosed. Do not add required validation.

### 10.6 Cultural Context — String vs Structured JSONB

**Decision (CONFIRMED — IN THIS SPRINT):** Migrate `cultural_context` from a single string enum to a structured jsonb object. Include dietary preferences.

```typescript
// Updated internal form type:
interface CulturalContext {
  category: string;    // 'indian_hindu' | 'western' | 'indian_muslim' | etc.
  dietary: string[];   // ['vegetarian'] | ['halal'] | ['kosher'] | etc.
}

// Stored in DB as: {"category": "indian_hindu", "dietary": ["vegetarian"]}
// Empty state:     {"category": null, "dietary": []}
```

**Form changes required:**

In `RecipientFormModal.tsx`, the Cultural Context section gains a dietary multi-select:

```tsx
{/* Cultural Context section */}
<FormSection icon={Globe} title="Cultural Context">
  {/* Existing category dropdown — no change */}
  <Select value={form.cultural_context_obj.category} onValueChange={...} />

  {/* NEW: Dietary preferences */}
  <div className="space-y-1.5">
    <Label className="text-xs">Dietary preferences</Label>
    <p className="text-xs text-muted-foreground">Helps the AI avoid unsuitable gifts</p>
    <div className="flex flex-wrap gap-2">
      {DIETARY_OPTIONS.map(opt => (
        <label key={opt.value} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-all",
          form.cultural_context_obj.dietary.includes(opt.value)
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        )}>
          <Checkbox
            checked={form.cultural_context_obj.dietary.includes(opt.value)}
            onCheckedChange={() => toggleDietary(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  </div>
</FormSection>
```

Add to `constants.ts`:

```typescript
export const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "no_pork", label: "No Pork" },
  { value: "no_alcohol", label: "No Alcohol" },
] as const;
```

**`RecipientFormData` type change:**

```typescript
// In constants.ts — update RecipientFormData:
export interface RecipientFormData {
  name: string;
  relationship_type: string;
  relationship_depth: string;
  age_range: string;
  gender: string;
  interests: string[];
  cultural_context: string;          // DEPRECATED — keep for backwards compat
  cultural_context_obj: {            // NEW
    category: string;
    dietary: string[];
  };
  country: string;
  notes: string;
  important_dates: ImportantDate[];
}

export const defaultFormData: RecipientFormData = {
  // ...existing fields...
  cultural_context: "",
  cultural_context_obj: { category: "", dietary: [] },
  // ...
};
```

**`buildRecipientWritePayload` change in `src/lib/recipients.ts`:**

```typescript
function buildRecipientWritePayload(formData: RecipientFormData) {
  const culturalCtx = formData.cultural_context_obj?.category
    ? JSON.stringify({
        category: formData.cultural_context_obj.category,
        dietary: formData.cultural_context_obj.dietary ?? [],
      })
    : null;

  return {
    name: formData.name.trim(),
    relationship: normalizeNullableString(formData.relationship_type),
    relationship_depth: normalizeNullableString(formData.relationship_depth),
    age_range: normalizeNullableString(formData.age_range),
    gender: normalizeNullableString(formData.gender),
    interests: normalizeInterests(formData.interests),
    notes: normalizeNullableString(formData.notes),
    cultural_context: culturalCtx,   // Now jsonb string
    country: normalizeNullableString(formData.country)?.toUpperCase() ?? null,
    important_dates: normalizeImportantDates(formData.important_dates),
  };
}
```

**Edit modal pre-fill change in `MyPeople.tsx`:**

```typescript
const editInitialData: RecipientFormData | undefined = editingRecipient
  ? {
      // ...existing fields...
      cultural_context: "",  // legacy — unused
      cultural_context_obj: (() => {
        const raw = editingRecipient.cultural_context;
        if (!raw) return { category: "", dietary: [] };
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && "category" in parsed) return parsed;
          // Legacy plain string value (e.g. "indian_hindu") — migrate on read
          return { category: raw, dietary: [] };
        } catch {
          return { category: raw ?? "", dietary: [] };
        }
      })(),
    }
  : undefined;
```

The legacy string read path (`category: raw`) means existing recipients with old plain-string values load correctly in the edit modal and resave in the new jsonb format — zero data loss during the transition.

**DB migration (02e):**

```sql
-- 02e-cultural-context-jsonb.sql
-- Backfill: convert plain strings to jsonb objects
-- Safe to run multiple times (idempotent via the IS NOT NULL + not-object check)

UPDATE public.recipients
SET cultural_context = jsonb_build_object(
  'category', cultural_context,
  'dietary', '[]'::jsonb
)
WHERE cultural_context IS NOT NULL
  AND cultural_context != ''
  AND (
    -- Check it's not already a jsonb object (already migrated)
    left(trim(cultural_context), 1) != '{'
  );
```

**Supabase types regeneration:**  
After running migration 02e, the `cultural_context` column type in the DB remains `text` (we're storing jsonb-serialized strings in a text column). No column type change is needed at the DB level — Postgres accepts this. If you want strict jsonb typing, run:

```sql
ALTER TABLE public.recipients
  ALTER COLUMN cultural_context TYPE jsonb USING cultural_context::jsonb;
```

Run this AFTER the backfill. Then regenerate types with `supabase gen types typescript --local > src/integrations/supabase/types.ts`.

**AI prompt integration point:**

```typescript
// In AI context builder — read the new structure:
const dietaryConstraints = (() => {
  if (!recipient.cultural_context) return [];
  try {
    const ctx = typeof recipient.cultural_context === "string"
      ? JSON.parse(recipient.cultural_context)
      : recipient.cultural_context;
    return ctx.dietary ?? [];
  } catch { return []; }
})();
// Pass to AI: "Dietary restrictions: Vegetarian, No Alcohol"
```

### 10.7 Default Country for New Recipients

**Decision (MADE):** Country defaults to empty string (""), which the form renders as "Same as my country". The `RecipientCard` shows no flag if `recipient.country === ""` or `recipient.country === userCountry`. Do not auto-fill the user's country into the DB field — leave null and let the gift flow inherit the user's country for recommendations.

### 10.8 Age Range Values — DB vs Form Mismatch

**DB enum values:** `under_18, 18_25, 25_35, 35_50, 50_65, 65_plus`  
**Form labels:** Under 18, 18–25, 25–35, 35–50, 50–65, 65+

**Decision (MADE):** These are already aligned. Do not change. The PRD's initial spec suggested `26_35` which was incorrect. The existing DB values are canonical.

### 10.9 Detail Panel — Sheet Only vs Sheet + Route

**Decision (CONFIRMED):** Both. Sheet opens immediately on card click for low-friction UX. URL simultaneously updates to `/my-people/{id}` for shareability, deep-linking, and browser back/forward support. Single `RecipientDetailPanel` component handles both contexts. `MyPeople` page handles both routes (`/my-people` and `/my-people/:recipientId`). See Section 3.5 for full implementation spec.

### 10.10 Cultural Context Migration — This Sprint vs Next

**Decision (CONFIRMED):** Include in this sprint. Migrate `cultural_context` from plain string to structured jsonb object `{ category, dietary[] }`. The AI pipeline benefits immediately from dietary constraint data. Legacy string values are handled gracefully via the edit modal's try/parse fallback. See Section 10.6 for full migration spec including the backfill SQL and TypeScript changes.

---

## Section 11: Rollout & Migration

### 11.1 Migration Order

Execute migrations in this order in production:

1. **`02a-recipient-schema-additions.sql`** — Adds `is_archived`, `session_count`, `gift_count_cached` columns; adds name/notes length constraints; adds indexes
2. **`02b-gift-sessions-set-null-fk.sql`** — Changes `gift_sessions.recipient_id` FK to SET NULL on delete
3. **`02c-recipient-stats-trigger.sql`** — Adds `update_recipient_stats()` trigger on `gift_sessions`
4. **`02d-backfill-recipient-stats.sql`** — Backfills `gift_count_cached` and `session_count` for existing rows
5. **`02e-cultural-context-jsonb.sql`** — Backfills `cultural_context` string → jsonb object (only if P1 cultural_context work is included in this sprint)

### 11.2 Backfill Script

```sql
-- 02d-backfill-recipient-stats.sql
UPDATE public.recipients r
SET
  session_count = (
    SELECT count(*) FROM public.gift_sessions gs
    WHERE gs.recipient_id = r.id
  ),
  gift_count_cached = (
    SELECT count(*) FROM public.gift_sessions gs
    WHERE gs.recipient_id = r.id
      AND (gs.status = 'completed' OR gs.selected_gift_name IS NOT NULL)
  ),
  last_gift_date = COALESCE(
    (SELECT max(gs.created_at) FROM public.gift_sessions gs
     WHERE gs.recipient_id = r.id
       AND (gs.status = 'completed' OR gs.selected_gift_name IS NOT NULL)),
    r.last_gift_date
  );
```

### 11.3 Feature Flag

No feature flag needed for this PRD — it's a hardening and improvement of an existing feature, not a new surface. Changes are backwards-compatible (new columns have defaults; new hooks are internal).

### 11.4 Rollback Plan

- If `02b` (FK change to SET NULL) causes issues: revert by restoring the original FK. No data is lost.
- If `02c` (stats trigger) has a bug: drop the trigger with `DROP TRIGGER IF EXISTS gift_sessions_update_recipient_stats ON public.gift_sessions`. Stats columns become stale but nothing breaks — client-side fallback still works.
- Frontend changes are fully reversible by reverting the PR.

### 11.5 Verification Checklist Post-Deploy

```
□ Run: SELECT count(*) FROM recipients WHERE is_archived IS NULL;  -- should be 0
□ Run: SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'recipients';
□ Run: SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'gift_sessions';
□ Test: Add recipient as Spark user → 400 on 2nd add (Layer 3 trigger fires)
□ Test: Add recipient as Thoughtful user → succeeds for ≤ 5
□ Test: Delete recipient → gift session for that recipient still exists with recipient_id = NULL
□ Test: Edit locked recipient → works (profile saves)
□ Test: Click Find a Gift on locked recipient → upgrade modal fires
□ Test: My People page loads in < 500ms (check Network tab)
□ Test: PostHog events fire (check PostHog Live Events)
```

---

## Section 12: Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| Recipient | A person saved by a user who they buy gifts for |
| Active recipient | A recipient whose index is within the user's plan limit (can be used in gift flow) |
| Locked recipient | A recipient whose index exceeds the plan limit (profile editable, cannot use in gift flow) |
| Gift session | A use of the AI recommendation engine for a specific recipient + occasion + budget |
| important_dates | An array of annual dates stored on a recipient (birthday, anniversary, etc.) |
| plan limit | Maximum number of recipients allowed per plan (Spark: 1, Thoughtful: 5, etc.) |
| cultural_context | A field capturing the recipient's religious/cultural background for AI personalization |
| soft-lock | Locking recipients visually without deleting them when a plan downgrades |

### 12.2 Files That Need Modification

| File | Change Type | Change Summary |
|------|------------|----------------|
| `src/pages/MyPeople.tsx` | Refactor | Extract queries to useRecipients hook; add detailPanelId state; add prefilledName state; improve filter empty states |
| `src/components/recipients/RecipientCard.tsx` | Bug fix + Enhancement | Remove hover-only visibility from Find a Gift button; add onCardClick prop |
| `src/components/recipients/RecipientFormModal.tsx` | Enhancement | Fix notes maxLength (1000→500); add stats strip; fix title; add delete button; add label dropdown to dates; add char counter |
| `src/components/recipients/constants.ts` | Enhancement | Add DATE_LABEL_OPTIONS; add grandparent to RELATIONSHIP_TYPES |
| `src/hooks/useRecipients.ts` | New file | CRUD hook extracted from MyPeople.tsx |
| `src/components/recipients/RecipientDetailPanel.tsx` | New file | Sheet-based expanded view (Section 3.5) |
| `src/lib/recipientValidation.ts` | New file | Zod schema |
| `supabase/migrations/02a-recipient-schema-additions.sql` | New migration | is_archived, stats columns, indexes, constraints |
| `supabase/migrations/02b-gift-sessions-set-null-fk.sql` | New migration | FK change on gift_sessions |
| `supabase/migrations/02c-recipient-stats-trigger.sql` | New migration | update_recipient_stats trigger |
| `supabase/migrations/02d-backfill-recipient-stats.sql` | New migration | Backfill stats columns |
| `supabase/migrations/02e-cultural-context-jsonb.sql` | New migration | Backfill cultural_context string → jsonb |
| `src/integrations/supabase/types.ts` | Update | Regenerate after migrations (`supabase gen types typescript`) |

### 12.3 Estimated Engineering Effort

| Task | Estimate |
|------|----------|
| DB migrations (02a–02e, including cultural_context jsonb) | 3h |
| Extract useRecipients hook | 2h |
| RecipientCard fix (always-visible CTA + onCardClick) | 1h |
| RecipientFormModal updates (title, stats, notes, dates, dietary) | 4h |
| RecipientDetailPanel (new component — Sheet + URL sync) | 5h |
| Route setup (`/my-people/:recipientId` → MyPeople with Sheet open) | 1h |
| constants.ts updates (DATE_LABEL_OPTIONS, DIETARY_OPTIONS, grandparent) | 1h |
| Zod validation schema | 1h |
| Filter/search empty states | 2h |
| PostHog event completeness audit | 1h |
| Error state for DB failure | 1h |
| Testing + QA | 3h |
| **Total** | **~25h (3–4 engineer-days)** |

### 12.4 Open Questions Requiring Human Input

1. **Grandparent relationship** — Should `grandparent` be added to the `RELATIONSHIP_TYPES` list in `constants.ts`? It was in the initial PRD spec but is absent from the codebase. Since `relationship` is now a plain text column (not a PG enum), adding it requires only a one-line change to `constants.ts`. **Recommend: add.**

2. **Stats trigger timing** — The `update_recipient_stats()` trigger fires AFTER INSERT on `gift_sessions`. `gift_count_cached` and `session_count` on recipients are updated within the same transaction. Is this acceptable or do we need a materialized view for scale? **Recommend: trigger is fine for V1 data volumes. Revisit at 10k users.**

3. **"Find a Gift" always visible vs hover** — Showing the CTA always takes vertical space on the card. Some users may prefer progressive disclosure (hover reveals). **Recommend: always visible. Revert to hover only if user research shows card scanability suffers.**

The following questions have been resolved:
- ✅ Cultural context jsonb migration — **in this sprint** (Section 10.6, 10.10)
- ✅ Detail view — **both Sheet and `/my-people/{id}` route** (Section 3.5, 10.9)
- ✅ Hard vs soft delete — **hard delete V1, `is_archived` column added for V2** (Section 10.1)
- ✅ FK cascade on gift_sessions — **SET NULL** (Section 10.2, migration 02b)
- ✅ Locked recipients editable — **yes** (Section 10.3)
