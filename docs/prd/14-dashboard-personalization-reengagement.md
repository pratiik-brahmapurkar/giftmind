# PRD 14 — Dashboard Personalization & Re-engagement UX

**Document status:** Draft
**Author:** Product
**Last updated:** 2026-04-30
**Related PRDs:** 03 (Gift Flow Orchestration), 07 (Occasion Reminders), 09 (Plans & Limits), 12 (Analytics & Telemetry)

---

## 1. Overview

The GiftMind dashboard (`/dashboard`) is the primary surface users return to after signup. It currently renders one of three states — empty (no recipients), near-empty (recipients but no sessions), or a generic "normal" view — all with a static layout. The dashboard does not adapt to user context, lifecycle stage, or behaviour patterns.

The result: re-engagement is incidental. Users who haven't gifted in 30 days see the same layout as daily-active users. Users with 3 upcoming occasions in 5 days see the same priority hierarchy as users with none. Low-credit users receive no proactive nudge until they hit the paywall mid-flow.

This PRD defines a **contextual, data-driven dashboard** with:

1. **Smart greeting & hero section** — personalised to the user's lifecycle stage and current context.
2. **Urgency-ranked Occasions Strip** — occasions sorted by urgency, always above the fold.
3. **Action Cards** — a dynamic set of contextual cards ranked by the system based on user state.
4. **Re-engagement Nudges** — targeted banners for dormant users, low credits, incomplete sessions, and profile gaps.
5. **Credit Health Widget** — a persistent, non-intrusive credit balance indicator with top-up CTA.
6. **Improved Empty States** — state-specific empty states with clear first-action paths.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Increase 7-day return rate by surfacing the most relevant action for each user on every visit. |
| G2 | Reduce gift-flow abandonment by proactively surfacing in-progress sessions. |
| G3 | Drive occasion-to-gift-flow conversion — occasions should be the highest-urgency CTA when within 14 days. |
| G4 | Reduce surprise credit exhaustion by showing credit health at all times. |
| G5 | Improve profile completion rate by making the completion path contextual, not generic. |
| G6 | Re-engage dormant users (>14 days inactive) with a dedicated state on next visit. |

### Non-goals

- Notification system or push notifications (email reminders are covered in PRD 07).
- Fully customisable dashboard layout (widget dragging, user-defined order).
- Social/sharing features.
- Mobile app — this is the web dashboard.

---

## 3. Current State Analysis

### 3.1 Dashboard States

| State | Trigger | Current UX |
|-------|---------|-----------|
| Empty | `recipientCount === 0` | Generic EmptyState with "Add your first person" CTA |
| Near-empty | `sessionCount === 0` | EmptyState with "Find a Gift" CTA |
| Normal | Has recipients + sessions | Static layout: hero CTA → recent sessions → stat cards → occasions widget |

**Issues:**
- The "normal" state is identical for a DAU with 5 upcoming occasions and a user who last logged in 45 days ago.
- `ProfileCompletionBanner` dismisses to `sessionStorage` — it re-shows on every new browser tab. No persistent dismiss.
- Recent sessions show up to 5 cards, but all navigate to `/gift-history` — no quick "resume" or "regift" action per card.
- `UpcomingOccasionsWidget` is below stat cards in the sidebar — occasions with `daysUntil <= 7` should be elevated above everything else.
- Credits warning only appears as a label change ("Running low") when `credits <= 3` — no proactive top-up CTA.
- No re-engagement UX for dormant users (>14 days since `last_active_at`).

### 3.2 Data Available for Personalisation

| Signal | Source | Available now |
|--------|--------|---------------|
| `credits_balance` | `users.credits_balance` | ✅ |
| `profile_completion_percentage` | `users.profile_completion_percentage` | ✅ |
| `last_active_at` | `users.last_active_at` | ✅ |
| `onboarding_state` | `users.onboarding_state` (jsonb) | ✅ |
| Upcoming occasions (≤60 days) | Derived from `recipients.important_dates` | ✅ |
| In-progress sessions | `gift_sessions` where `status = 'active'` | ✅ fetched (but not surfaced) |
| Completed sessions count | `gift_sessions` count | ✅ |
| Last completed session | `gift_sessions` latest completed | ✅ |
| Recipients without sessions | Cross-join recipients × sessions | ❌ not computed |
| Feedback pending | Sessions completed but `feedback_rating IS NULL` | ❌ not surfaced |
| Plan / limits | `useUserPlan` | ✅ |

### 3.3 Missing Data Fetch

The dashboard currently does **not** fetch:
- In-progress (`status = 'active'`) sessions — these exist but are not retrieved.
- `users.last_active_at` — not in the current `dashboard-profile` query.
- Which recipients have never had a gift session.

---

## 4. User Lifecycle Segments

The dashboard renders differently based on the user's lifecycle segment, computed from available signals at page load:

| Segment | Conditions | Priority action |
|---------|-----------|----------------|
| `new_user` | No recipients | Add first person |
| `exploring` | Has recipients, 0 sessions | Start first gift flow |
| `dormant` | `last_active_at` > 14 days ago, has history | "Welcome back" re-engagement |
| `occasion_urgent` | Any occasion with `daysUntil <= 7` | Gift for that person NOW |
| `in_progress` | Any active session | Resume that session |
| `low_credits` | `credits_balance <= 1` | Top up before running out |
| `active` | None of the above | Standard personalised dashboard |

Segments are evaluated in priority order — a user who is both `dormant` and `occasion_urgent` is treated as `occasion_urgent` (highest urgency wins).

**Priority stack (highest → lowest):**
`occasion_urgent` > `in_progress` > `low_credits` > `dormant` > `exploring` > `new_user` > `active`

---

## 5. Feature Specifications

### 5.1 Smart Greeting & Hero Section

**Location:** Top of dashboard, above all content.

**Current:**
> "Hi Pratik, ready for the next thoughtful pick?"

**New behaviour — greeting adapts to segment:**

| Segment | Greeting | Subtext |
|---------|---------|---------|
| `new_user` | "Welcome to GiftMind, {name}!" | "Add someone you'd like to gift — GiftMind will remember what matters to them." |
| `exploring` | "Hi {name}! Ready to find your first gift?" | "You've added {N} people. Let's find something perfect." |
| `dormant` | "Welcome back, {name}! It's been a while." | "A lot has happened since your last visit. Here's what needs attention." |
| `occasion_urgent` | "Hi {name} — {recipient}'s {occasion} is in {N} days." | "Don't leave it to the last minute." |
| `in_progress` | "Hi {name}, you have a gift in progress." | "You were finding something for {recipient}. Pick up where you left off." |
| `low_credits` | "Hi {name}! You're almost out of credits." | "Top up to keep finding thoughtful gifts." |
| `active` | "Hi {name}, ready for the next thoughtful pick?" | "Start a new recommendation, check upcoming dates, or revisit recent sessions." |

**Hero CTA button** adapts:

| Segment | Primary CTA |
|---------|-------------|
| `occasion_urgent` | "Find a Gift for {recipient}" → pre-fills recipient + occasion |
| `in_progress` | "Resume Session" → navigates to `/gift-flow?resume={sessionId}` |
| `low_credits` | "Top Up Credits" → navigates to `/credits` |
| `dormant` | "Start a New Gift" → `/gift-flow` |
| All others | "Find a Gift" → `/gift-flow` |

### 5.2 Urgency-Ranked Occasions Strip

**Replaces:** `UpcomingOccasionsWidget` in sidebar.

**New location:** Full-width section directly below the greeting, above the main grid. Only shown when there are occasions within 60 days.

**Urgency tiers:**

| Tier | Days until | Visual treatment |
|------|-----------|-----------------|
| Critical | ≤ 7 days | Red/amber border, pulsing dot, "X days left!" badge |
| Soon | 8–21 days | Orange border, countdown badge |
| Upcoming | 22–60 days | Neutral border, date badge |

**Layout:**
- Horizontal scrollable strip of occasion cards (on mobile), grid on desktop.
- Each card: recipient avatar initial, name, occasion label, countdown, "Find a Gift" button.
- Up to 5 occasions shown. "See all" link navigates to `/my-people` filtered by upcoming.
- If `isLocked` (plan limit), show upgrade CTA instead of "Find a Gift".
- Occasions sorted: critical first, then by days ascending.

**Component:** `OccasionsStrip` — replaces `UpcomingOccasionsWidget`.

```tsx
// src/components/dashboard/OccasionsStrip.tsx
interface OccasionCard {
  recipientId: string;
  recipientName: string;
  occasion: string;
  emoji: string;
  daysUntil: number;
  urgencyTier: 'critical' | 'soon' | 'upcoming';
}
```

### 5.3 Dynamic Action Cards

**Replaces:** Static recent sessions list and batch mode upsell card.

A ranked grid of action cards, each representing one contextual action. The system selects up to 4 cards per visit, ranked by relevance.

**Card catalogue:**

| Card ID | Trigger | Title | CTA |
|---------|---------|-------|-----|
| `resume_session` | Active session exists | "Resume your gift search" | "Continue" → `/gift-flow?resume=…` |
| `regift_occasion` | Completed session + same recipient has upcoming occasion | "Gift for {name} again?" | "Start" → pre-fills recipient |
| `ungifted_recipient` | Recipient with no session history (oldest added first) | "You haven't gifted for {name} yet" | "Find a Gift" |
| `pending_feedback` | Completed session with no `feedback_rating` | "How did {gift name} go for {name}?" | "Leave feedback" → FeedbackModal |
| `low_credits_warning` | `credits_balance <= 2` | "Only {N} credits left" | "Get More Credits" → `/credits` |
| `profile_incomplete` | `profile_completion_percentage < 80` | "Improve your recommendations" | "Complete Profile" → `/onboarding?resume=true` |
| `add_person` | `recipientCount < plan limit` | "Add someone new to GiftMind" | "Add Person" → `/my-people?add=true` |
| `find_gift_generic` | Always shown as last fallback | "Start a new recommendation" | "Find a Gift" → `/gift-flow` |

**Card ranking algorithm (priority order):**
1. `resume_session` — if active session ≤ 24h old
2. `low_credits_warning` — if `credits_balance <= 1`
3. `regift_occasion` — if upcoming occasion ≤ 14 days for a previously gifted recipient
4. `pending_feedback` — if completed session < 7 days old with no feedback
5. `ungifted_recipient` — oldest recipient with no sessions
6. `profile_incomplete` — if < 80% complete
7. `add_person` — if under plan recipient limit
8. `find_gift_generic` — always last

Show max 3 cards in the main grid; show max 1 card in sidebar.

**Component:** `ActionCardGrid` with `ActionCard` sub-component.

```tsx
// src/components/dashboard/ActionCardGrid.tsx
interface ActionCard {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: () => void;
  icon: LucideIcon;
  urgency: 'high' | 'medium' | 'low';
  badge?: string;
}
```

### 5.4 Re-engagement Banner (Dormant Users)

Shown only when `lastActiveAt` > 14 days ago, replacing `ProfileCompletionBanner`.

**Visual treatment:** Full-width card with a warm gradient background. Shown once per session (sessionStorage dismiss key: `gm_reengagement_dismissed`).

**Content:**
```
🎁 Welcome back! Here's what happened while you were away.

[N] upcoming occasions in the next 60 days
[M] people haven't received a gift yet this year

[Find a Gift →]  [Dismiss]
```

Where N and M are computed from existing data.

**Tracking:** `trackEvent('reengagement_banner_shown', { days_since_active, upcoming_count, ungifted_count })`

### 5.5 Credit Health Widget

**Location:** Sidebar, always visible above the occasions widget (replaces the 3 stat cards).

**Layout:** Single compact card showing:
- Credit balance (large number)
- Progress bar: `credits / monthly_allowance` (monthly allowance = 15 for Spark)
- Status label: "Healthy" / "Running low" / "Almost empty" / "Empty"
- Renewal date: "Renews {date}" (computed from `credit_batches`)
- CTA: "Get More Credits" → `/credits` (shown only when `credits <= 3`)

**Visual states:**

| Balance | Bar colour | Label | CTA shown |
|---------|-----------|-------|-----------|
| > 8 | Green | "Healthy" | No |
| 4–8 | Amber | "Running low" | No |
| 1–3 | Orange | "Almost empty" | Yes |
| 0 | Red | "No credits" | Yes |

**Component:** `CreditHealthWidget`

```tsx
// src/components/dashboard/CreditHealthWidget.tsx
interface CreditHealthWidgetProps {
  creditsBalance: number;
  monthlyAllowance: number;
  renewalDate: Date | null;
  onTopUp: () => void;
}
```

### 5.6 Persistent Profile Completion Banner

**Current behaviour:** Dismisses to `sessionStorage` — re-shows on every new tab.

**New behaviour:**
- Dismiss stored in `localStorage` under `gm_profile_banner_dismissed_v2` with a timestamp.
- Re-shown after 30 days if profile still incomplete.
- Hidden permanently once `profile_completion_percentage >= 100`.
- Only shown if `segment !== 'dormant'` (dormant segment shows its own banner instead).

### 5.7 Improved Empty States

**Empty (no recipients):**
- Illustration: stylised gift box with dotted border.
- Headline: "Let's set up your gifting circle"
- Sub: "Add someone you care about — GiftMind will remember occasions and gift history for each person."
- CTAs: "Add your first person" (primary), "Import from contacts" (secondary, future feature stub).

**Near-empty (recipients, no sessions):**
- Illustration: recommendation card outline.
- Headline: "You're all set to find your first gift"
- Sub: Show recipient name(s) already added. "Pick one of your {N} people and get 3 gift ideas with confidence scores."
- CTA: Recipient selection chips (click → pre-fills gift flow), or "Browse all people".

---

## 6. Data Fetching Changes

### 6.1 Extended Dashboard Query

The current `dashboard-profile` query is extended to include `last_active_at`:

```ts
supabase
  .from('users')
  .select('credits_balance, profile_completion_percentage, full_name, country, birthday, onboarding_state, last_active_at')
  .eq('id', user.id)
  .single()
```

### 6.2 New: In-Progress Sessions Query

```ts
// New query in Dashboard.tsx
const { data: activeSessions = [] } = useQuery({
  queryKey: ['dashboard-active-sessions', user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('gift_sessions')
      .select('id, occasion, recipient_id, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: false })
      .limit(1);
    return data || [];
  },
  enabled: !!user,
});
```

### 6.3 New: Pending Feedback Query

```ts
const { data: pendingFeedback = [] } = useQuery({
  queryKey: ['dashboard-pending-feedback', user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('gift_sessions')
      .select('id, occasion, recipient_id, selected_gift_name, created_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .is('feedback_rating', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(3);
    return data || [];
  },
  enabled: !!user,
});
```

### 6.4 New: Credit Renewal Date Query

```ts
const { data: nextRenewal } = useQuery({
  queryKey: ['dashboard-credit-renewal', user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('credit_batches')
      .select('expires_at')
      .eq('user_id', user.id)
      .eq('is_expired', false)
      .eq('package_name', 'monthly_free')
      .order('expires_at', { ascending: true })
      .limit(1)
      .single();
    return data?.expires_at ? new Date(data.expires_at) : null;
  },
  enabled: !!user,
});
```

### 6.5 Computed: Recipients Without Sessions

```ts
const recipientIdsWithSessions = useMemo(
  () => new Set(sessions.map((s) => s.recipient_id).filter(Boolean)),
  [sessions]
);

const ungiftedRecipients = useMemo(
  () => recipients.filter((r) => !recipientIdsWithSessions.has(r.id)),
  [recipients, recipientIdsWithSessions]
);
```

---

## 7. Lifecycle Segment Hook

```ts
// src/hooks/useDashboardSegment.ts
export type DashboardSegment =
  | 'new_user'
  | 'exploring'
  | 'dormant'
  | 'occasion_urgent'
  | 'in_progress'
  | 'low_credits'
  | 'active';

interface SegmentInputs {
  recipientCount: number;
  sessionCount: number;
  creditsBalance: number;
  lastActiveAt: string | null;
  urgentOccasions: UpcomingOccasion[];  // daysUntil <= 7
  activeSessions: ActiveSession[];
}

export function useDashboardSegment(inputs: SegmentInputs): DashboardSegment {
  const {
    recipientCount, sessionCount, creditsBalance,
    lastActiveAt, urgentOccasions, activeSessions,
  } = inputs;

  if (recipientCount === 0) return 'new_user';
  if (sessionCount === 0) return 'exploring';

  // Priority order
  if (urgentOccasions.length > 0) return 'occasion_urgent';

  if (activeSessions.length > 0) return 'in_progress';

  if (creditsBalance <= 1) return 'low_credits';

  if (lastActiveAt) {
    const daysSinceActive = Math.floor(
      (Date.now() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceActive > 14) return 'dormant';
  }

  return 'active';
}
```

---

## 8. Analytics — New Events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `dashboard_segment_viewed` | Dashboard mount | `segment`, `recipient_count`, `session_count`, `credits_balance`, `urgent_occasions` |
| `action_card_clicked` | User clicks an action card | `card_id`, `segment`, `urgency` |
| `occasions_strip_occasion_clicked` | User clicks "Find a Gift" on an occasion | `recipient_id`, `days_until`, `urgency_tier` |
| `reengagement_banner_shown` | Dormant banner shown | `days_since_active`, `upcoming_count`, `ungifted_count` |
| `reengagement_banner_clicked` | User clicks "Find a Gift" on dormant banner | `days_since_active` |
| `credit_health_widget_topup_clicked` | User clicks "Get More Credits" | `credits_balance` |
| `resume_session_clicked` | User clicks resume on in-progress card | `session_id`, `session_age_hours` |
| `feedback_card_clicked` | User clicks feedback card | `session_id`, `days_since_session` |

---

## 9. Database Changes

No schema changes required. All personalisation is derived from existing tables:
- `users` — add `last_active_at` to dashboard query (already a column).
- `gift_sessions` — filter by `status = 'active'` and `feedback_rating IS NULL`.
- `credit_batches` — query for next renewal date.
- `recipients.important_dates` — already parsed by `parseRecipientImportantDates`.

**`last_active_at` update:** This column should be updated on every meaningful user action. Currently it may not be reliably written. Verify the `complete-onboarding` and Supabase Auth sign-in triggers update this column.

---

## 10. Component Architecture

```
Dashboard.tsx
  ├── useDashboardSegment()           [new hook]
  ├── SmartGreeting                   [new component]
  │     └── HeroCTA (segment-aware)
  ├── ReengagementBanner              [new — shown for dormant segment]
  ├── ProfileCompletionBanner         [existing — updated dismiss logic]
  ├── OccasionsStrip                  [new — replaces UpcomingOccasionsWidget]
  │     └── OccasionCard × N
  ├── [main grid]
  │     ├── ActionCardGrid             [new]
  │     │     └── ActionCard × 3
  │     └── RecentSessionsList        [existing — keep, but add per-card resume CTA]
  └── [sidebar]
        ├── CreditHealthWidget         [new — replaces 3 stat cards]
        └── QuickStats (Gifts, People) [simplified, 2 stats only]
```

---

## 11. Implementation Checklist

### Phase 1 — Data Layer
- [ ] Extend `dashboard-profile` query to include `last_active_at`.
- [ ] Add `dashboard-active-sessions` query (active sessions ≤ 24h old).
- [ ] Add `dashboard-pending-feedback` query (completed, no rating, ≤ 7 days).
- [ ] Add `dashboard-credit-renewal` query (next monthly batch expiry).
- [ ] Compute `ungiftedRecipients` from sessions × recipients cross-join.
- [ ] Create `useDashboardSegment` hook.

### Phase 2 — Occasions Strip
- [ ] Create `OccasionsStrip` component with urgency tiers.
- [ ] Move from sidebar to full-width section below greeting.
- [ ] Show top 5 occasions sorted by urgency tier then days ascending.
- [ ] Add urgency visual states (critical/soon/upcoming).

### Phase 3 — Smart Greeting
- [ ] Create `SmartGreeting` component with segment-aware copy.
- [ ] Segment-aware hero CTA (pre-fill navigation params for `occasion_urgent`, `in_progress`).

### Phase 4 — Action Cards
- [ ] Create `ActionCard` and `ActionCardGrid` components.
- [ ] Implement card ranking algorithm.
- [ ] Build all 8 card types with correct CTAs.
- [ ] Track `action_card_clicked` on each card interaction.

### Phase 5 — Re-engagement Banner
- [ ] Create `ReengagementBanner` component.
- [ ] Show when `segment === 'dormant'`, hide `ProfileCompletionBanner`.
- [ ] localStorage dismiss (re-shows after 30 days).

### Phase 6 — Credit Health Widget
- [ ] Create `CreditHealthWidget` with progress bar, status label, renewal date.
- [ ] Replace 3 stat cards in sidebar with `CreditHealthWidget` + 2-stat summary.

### Phase 7 — Improved Empty States
- [ ] Replace generic `EmptyState` in `new_user` state with illustrated version.
- [ ] Replace `exploring` state with recipient chips + pre-filled gift flow navigation.

### Phase 8 — ProfileCompletionBanner Persistence Fix
- [ ] Migrate dismiss key from `sessionStorage` to `localStorage` with 30-day TTL.
- [ ] Hide banner permanently at 100% completion.

### Phase 9 — Analytics
- [ ] Instrument all new events listed in Section 8.
- [ ] Add `dashboard_segment_viewed` on mount.

---

## 12. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should `resume_session` deep-link into the exact gift flow step, or restart with pre-filled context? | Engineering | Open — recommend restart with pre-filled recipient/occasion for simplicity |
| Q2 | Should the re-engagement banner show if the user has 0 upcoming occasions? | Product | Open — recommend yes, but change copy to focus on adding dates |
| Q3 | Should `CreditHealthWidget` show a "Refer a friend" CTA when credits are low as an alternative to purchase? | Product | Open |
| Q4 | What is the right dormancy threshold — 14 days or 21 days? | Product | Open — 14 days recommended; adjust based on median session frequency data |
| Q5 | Should the `pending_feedback` action card include an inline 1-tap rating (👍👎) instead of opening the full modal? | Product/Engineering | Open — recommend yes for engagement |
| Q6 | Should occasion cards in the strip show the full gift flow inline (drawer) or navigate to `/gift-flow`? | Product | Open — recommend navigation for now, inline as a future enhancement |
