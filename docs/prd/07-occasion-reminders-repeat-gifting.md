# PRD 07 — Occasion Reminders & Repeat Gifting Workflow

**Feature name (internal):** Occasion Reminders + Repeat Gifting  
**Feature name (user-facing):** Never Miss a Moment  
**Owner:** Product  
**Version:** 1.0  
**Status:** Partially implemented — audit + design PRD  
**Date:** 2026-04-24

---

## Section 0 — Audit of Existing Implementation

### What Exists Today

GiftMind has two distinct reminder systems that are architecturally separate but serve a connected retention loop:

1. **Occasion Reminders** — Date-based email system. Users save important dates on recipient profiles (`recipients.important_dates`). A daily cron job scans for upcoming dates and sends email alerts at **14 days** and **3 days** before the occasion.

2. **Feedback Reminders** — Post-gift follow-up system. When a user selects a gift ("I'll Pick This One"), they can opt in to a reminder that fires **2 days after the occasion date** asking them how the gift was received. Results feed back into the gift history and Signal Check comparison.

These are different concepts that converge at the point where a user re-enters the gift flow from a reminder:

```
Occasion Reminder → email → "Find a Gift for [Name]" CTA → /gift-flow?recipient=UUID
Feedback Reminder → email → "How did [Gift] land?" → gift history feedback modal
```

There is no "Repeat Gifting" system as a distinct feature. Repeat gifting is implicit: a user who returns from an occasion reminder and runs the gift flow for a previously-gifted recipient is, by definition, repeat gifting. The gift engine's past_gift_retriever LangGraph node uses `gift_history` to avoid recommending past gifts.

---

### 0.1 Occasion Reminder System — Deep Audit

#### Data Source: `recipients.important_dates`

Dates are stored as a JSONB array on the `recipients` table:

```ts
// Type from src/components/recipients/constants.ts (inferred from form)
interface ImportantDate {
  label: string;  // e.g. "Birthday", "Anniversary", "Custom label"
  date: string;   // "MM-DD" format — year-agnostic, recurring by default
  recurring: boolean;
}
```

**Format:** `MM-DD` only (no year component). This makes dates inherently recurring every year, regardless of the `recurring` flag. The `recurring` checkbox in the UI is present but the cron job ignores it — it always treats dates as recurring.

**Limit:** Up to 5 dates per recipient (enforced in `RecipientFormModal.tsx`: `form.important_dates.length >= 5`).

**Date label options** (from `DATE_LABEL_OPTIONS` in `constants.ts`): Birthday, Anniversary, Graduation, Work Anniversary, Valentine's Day, Eid, Diwali, Christmas, Hanukkah, Other.

#### Edge Function: `send-occasion-reminders`

| Property | Value |
|---|---|
| Trigger | `pg_cron` daily at 03:30 UTC (9 AM IST) |
| Auth | `x-cron-secret` header check |
| Email provider | Resend API (`noreply@giftmind.in`) |
| Reminder windows | 14 days before, 3 days before |

**Logic walkthrough:**

1. Compute `fourteenDaysTarget` and `threeDaysTarget` from `new Date()`.
2. Fetch ALL recipients that have `important_dates IS NOT NULL`, along with their user's `email`, `full_name`, `active_plan`, `notification_prefs`.
3. For each recipient, for each date entry:
   - Parse `MM-DD` string to `[month, day]`.
   - If `month === fourteenMonth && day === fourteenDay` → send 14-day reminder.
   - If `month === threeMonth && day === threeDay` → send 3-day reminder.
4. Track `remindersSentByUser` map. For Confident plan: limit to 3 per run. For Gifting Pro: unlimited.
5. Send via `sendReminderEmail()` → Resend API with HTML email.

#### Email Template (current)

```html
Subject (14 day): 🎂 [Name]'s [Occasion] is in 2 weeks
Subject (3 day):  ⏰ [Name]'s [Occasion] is in just 3 days!

Body:
  Hi [UserName],
  [Name]'s [Occasion] is coming up on [date]. Start planning...
  
  [Find a Gift for [Name] →]  ← links to /gift-flow?recipient=[UUID]
  
  You saved [Name]'s [Occasion] in GiftMind.
  [Manage reminders]  ← links to /settings
```

**Plan access:**

| Plan | Gets Reminders? | Limit |
|---|---|---|
| Spark ✨ | ❌ No | 0 |
| Thoughtful 💝 | ❌ No | 0 |
| Confident 🎯 | ✅ Yes | 3 per daily cron run |
| Gifting Pro 🚀 | ✅ Yes | Unlimited |

**Note:** The `PLANS_WITH_REMINDERS` gate checks `active_plan` at send time — not at date-entry time. A user who saves dates on Thoughtful and upgrades to Confident will have their dates automatically picked up on the next cron run. Correct behavior.

---

### 0.2 Feedback Reminder System — Deep Audit

#### DB Table: `feedback_reminders`

```sql
-- From migration 20260419224500_gift_flow_orchestration_foundation.sql
CREATE TABLE public.feedback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  occasion text NOT NULL,
  occasion_date date,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'dismissed'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)  -- one feedback reminder per gift session
);
```

#### `calculateFeedbackReminderAt` (from `giftSessionShared.ts`)

```ts
export function calculateFeedbackReminderAt(occasionDate: string | null | undefined) {
  if (!occasionDate) {
    // No date? Remind in 7 days (fallback)
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback.toISOString();
  }

  // Remind 2 days AFTER the occasion date
  const date = new Date(`${occasionDate}T12:00:00.000Z`);
  date.setDate(date.getDate() + 2);
  return date.toISOString();
}
```

#### Two creation paths

**Path 1: Gift Selection Dialog (`GiftCard.tsx`)**
- User clicks "I'll Pick This One" → Selection Dialog opens
- Checkbox: "Ask me after the occasion how it went" (`createReminder`, default = `Boolean(occasionDate)`)
- On confirm → `onSelect(index, giftName, { note, createReminder, occasion, occasionDate, recipientId })` 
- → `giftSession.selectGift(index, giftName, options)` in `useGiftSession.ts`
- → If `options.createReminder && options.occasion` → calls `upsertFeedbackReminder()`
- → Inserts into `feedback_reminders` with `remind_at = occasionDate + 2 days`

**Path 2: Success Screen (`StepResults.tsx` → `SuccessState`)**
- After selection is saved and `giftSession.isComplete === true`
- Shows "Save for next year?" card
- User clicks "Save reminder" → `handleSaveReminder()` → directly calls Supabase upsert on `feedback_reminders`
- Uses `calculateFeedbackReminderAt(occasionDate)` — same logic as Path 1
- Both paths UPSERT with `onConflict: "session_id"` — idempotent

#### What happens after a feedback reminder fires?

**Critical gap: The feedback reminder email does NOT exist.** There is no Edge Function that reads `feedback_reminders` with `status = 'pending'` and `remind_at <= NOW()` and sends emails. The `feedback_reminders` table is populated but never consumed.

The only cron functions are:
- `expire-credits-and-warn` → `send-expiry-warnings`
- `send-occasion-reminders`

There is no `send-feedback-reminders` cron job or Edge Function.

---

### 0.3 Repeat Gifting Intelligence — Audit

**Past gift avoidance** is handled inside `generate-gifts` by the `past_gift_retriever` LangGraph node, which queries `gift_sessions` for the recipient's prior completed sessions. The AI is instructed to avoid recommending the same gift.

**What "repeat gifting" means in the UI today:**

1. **Gift History → "Try Again" / "Shop Again":** In `GiftHistory.tsx`, completed sessions have a "Shop Again" button (opens product link) and no-selection sessions have "Try Again" (re-navigates to `/gift-flow?recipient=UUID&occasion=OCCASION`). No "Repeat Gift" flow.

2. **Recipient card "Find a Gift":** Always starts a fresh gift flow session. No pre-population of the previous gift.

3. **Post-selection deep link (`/gift-flow?recipient=UUID`):** The occasion reminder email links here. When the user opens this link, Step 1 is pre-filled with the recipient. The user then re-runs the full wizard.

**What "repeat gifting" is NOT:**
- Automatically ordering the same gift again (no purchase integration)
- Gifting the same item with a note update (no re-select-last-gift flow)
- Batch gifting to multiple recipients at once (batch mode — separate feature)

---

### 0.4 My People Page — Reminder Display

**`reminderCount` computed in `MyPeople.tsx`:**
```ts
const reminderCount = recipients.filter(
  (recipient) => parseRecipientImportantDates(recipient.important_dates).length > 0
).length;
```

This counts recipients with ANY important dates, not how many dates have upcoming reminders. Displayed as:
- Spark/Thoughtful: "Date saved. Reminders are available on Confident and above."
- Confident: `{Math.min(reminderCount, 3)}/3 reminders active. Upgrade to Gifting Pro for unlimited reminders.`

**Problem:** The counter shows recipients with dates counted, not actual reminders in the 3-slot limit. A Confident user with 5 recipients each having 1 date would show "5/3 reminders active" — misleadingly over the cap. The `Math.min(reminderCount, 3)` clamps the display to max 3, masking the actual count.

**Sort by Upcoming:** `MyPeople.tsx` sorts by `next_important_date_days` when user selects "Upcoming dates" sort. This field is computed — likely derived from `important_dates` and `new Date()` comparison — but is not a DB column.

---

### 0.5 Settings Page — Reminder Preferences

`Settings.tsx` references `notification_prefs.reminders`. The `send-occasion-reminders` Edge Function checks:
```ts
const notifPrefs = user.notification_prefs;
if (notifPrefs && notifPrefs.reminders === false) continue;
```

So users can opt out of reminders from the Settings page. The settings UI must show this toggle. (Not audited in detail — Settings.tsx reads `notification_prefs` from `users` table.)

---

### 0.6 Known Bugs and Gaps

**BUG-01: `feedback_reminders` table is populated but never sent [P0]**
No Edge Function or cron job reads pending feedback reminders and sends emails. The entire post-gift feedback loop is broken. Users who opt-in to "Ask me after the occasion how it went" never receive that follow-up.

**BUG-02: `recurring` flag on `important_dates` is ignored by the cron [P1]**
The `recurring: boolean` field exists in the form UI and data model, but `send-occasion-reminders` treats all dates as recurring. Non-recurring dates (e.g., "Graduation — June 15, 2026") will continue to send reminders every year even after the occasion has passed.

**BUG-03: Reminder rate limit tracked across all recipients, not per-recipient [P1]**
The `remindersSentByUser` map counts all reminders sent to a user in a single run. A Confident user with 4 recipients, each with a birthday on the same day, would get reminders for only 3 of them. The 4th is silently dropped. This is non-obvious and creates user trust issues ("Why didn't I get reminded about [Person]?").

**BUG-04: `reminderCount` display incorrect in MyPeople.tsx [P2]**
As described above — counts recipients with any dates, not active reminder count. A user with 5 recipients with dates sees "5/3" before the `Math.min` clamp — but `Math.min(5, 3) = 3`, so it always shows "3/3" once above 3. This hides the real limit.

**BUG-05: No deduplication guard in `send-occasion-reminders` [P1]**
If the cron runs twice in the same day (re-trigger, pg_cron bug, or manual invocation), users will receive duplicate reminder emails. There is no `sent_at` tracking or idempotency check per (recipient, date, year).

**BUG-06: Feedback reminder date uses `occasionDate` from Step 2 [P2]**
`calculateFeedbackReminderAt(occasionDate)` fires 2 days after `occasionDate`. But if the user didn't set an occasion date in Step 2 ("I'm not sure yet"), the fallback is 7 days from now — which may fire before the gift is even given. The fallback logic is not user-communicated.

**BUG-07: No `send-feedback-reminders` cron job configured [P0]**
Even if the Edge Function is built, the pg_cron schedule is not in any migration file. Work item: add to `20260408020000_cron_expiry_reminders.sql` or a new migration.

**GAP-01: No in-app reminder management UI**
Users can see their reminder dates in the recipient form modal, and there's a "Manage reminders" link in the email that goes to `/settings`. But there is no dedicated `/reminders` page or dashboard widget showing "Upcoming occasions" with dates and countdown timers. Users have no in-app way to see what emails will fire and when.

**GAP-02: No "Upcoming occasions" dashboard widget**
The Dashboard page has no reminder surface. Users return to GiftMind because of external emails, not because the app proactively surfaces upcoming occasions. This is a major engagement gap.

**GAP-03: "My People" sorting by upcoming dates doesn't show countdown**
Sort by "Upcoming dates" orders recipients by `next_important_date_days` but the card doesn't display the upcoming date prominently. A user sorted by upcoming has no at-a-glance view of "birthday in 12 days."

**GAP-04: No cross-year deduplication for feedback reminders**
`feedback_reminders` has `UNIQUE(session_id)`, which prevents duplicate rows per session. But it doesn't prevent the same recipient+occasion from appearing in multiple sessions (e.g., user runs gift flow twice for the same birthday). The user could get 2 feedback reminder emails for the same birthday.

---

## Section 1 — Overview

### Feature Names

- **Occasion Reminders** (internal) / **"Upcoming Moments"** (user-facing)
- **Feedback Reminders** (internal) / **"How Did It Go?"** (user-facing)
- **Repeat Gifting** (internal) / **"Gift Again"** (user-facing)

### Description

Occasion Reminders and the Repeat Gifting Workflow together form GiftMind's **re-engagement and retention engine**. While the Gift Flow creates initial value, these systems ensure users return to GiftMind before every occasion — rather than defaulting to impulse shopping. This is the product's core retention loop:

```
User saves recipient with birthday (MM-DD)
  ↓ [364 days pass]
Email: "Pratik's birthday is in 2 weeks" → user clicks → /gift-flow?recipient=UUID
  ↓
Gift flow runs again (past_gift_retriever avoids last year's pick)
  ↓
User selects gift → selects "Ask me after how it went"
  ↓ [2 days after birthday]
Email: "How did the gift for Pratik land?" → user clicks → feedback modal
  ↓
User enters reaction → Signal Check comparison surfaces → "Matched outcome ✓"
  ↓ [loop repeats next year]
```

Every break in this loop is a user who doesn't return.

### Why It Matters

**Retention over acquisition:** GiftMind's ARPU increases dramatically with annual repeat users — the same $2.99 Thoughtful plan becomes $35.88/year if renewing 12 times. Occasion reminders are the only reason a user opens GiftMind on any day except the first.

**Habit formation:** Occasion reminders teach users that GiftMind is the *first thing you do* when an occasion is coming up — not a last resort. Once this becomes a habit, the platform becomes a calendar-integrated planning tool rather than a one-time gift finder.

**Feedback loop quality:** Feedback reminders close the Signal Check prediction loop. Each data point from "how did it go?" improves the AI's evaluation of gift-relationship fit — both in data (for future model fine-tuning) and in the user's own trust score for GiftMind recommendations.

---

## Section 2 — User Problem & Goals

### The User Problem

**For Occasion Reminders:**
"I know [Person]'s birthday is coming up but I lose track of when exactly. Then suddenly it's the morning of and I'm scrambling. I wish something reminded me before it was too late to plan properly."

GiftMind solves this by turning the recipient profile (with saved dates) into a proactive alert system. The user doesn't need to maintain a separate calendar — they get email nudges at the right time.

**For Feedback Reminders:**
"I picked the gift and sent it. Then I forgot about GiftMind. I never went back to say how it went, even though I'd find it interesting to see Signal Check's prediction vs. what actually happened."

The feedback loop requires zero extra effort at the time of gifting — the user simply opts in with one checkbox. The reminder arrives when it's naturally relevant (2 days after the occasion), making feedback capture feel timely, not forced.

**For Repeat Gifting:**
"I gift the same person every year for the same occasion. I want GiftMind to remember what I gave last time and suggest something *different* this time — not the same thing."

The `past_gift_retriever` node handles deduplication. But the UX currently doesn't celebrate or harness this continuity. The repeat gifting flow should feel like GiftMind "knows" this person's gift history and uses it.

### Jobs to Be Done

1. When an important occasion is approaching, I want a timely email reminder with a direct link to start a gift session, so I can plan ahead without tracking dates myself.

2. When I've saved a recipient's dates but I'm on a free plan, I want to see clearly that reminders need an upgrade — so I can decide if upgrading is worth it.

3. When I set a gift reminder after selecting a gift, I want to receive a follow-up email asking how the gift was received, so I can record the outcome and see Signal Check's accuracy.

4. When I'm choosing a gift for someone I've gifted before, I want the AI to automatically avoid recommending what I gave last time — without me having to remember what that was.

5. When I open GiftMind's dashboard, I want to see upcoming occasions I've saved so I can plan ahead before any reminder email even fires.

6. When I land on My People sorted by upcoming dates, I want each person's nearest occasion labeled with a countdown ("in 8 days"), so I can prioritize.

### Success Metrics

| Metric | Target | Baseline | How Measured |
|---|---|---|---|
| Occasion reminder email open rate | ≥ 40% | Unknown | Resend delivery analytics |
| Reminder-to-GiftFlow conversion | ≥ 25% of recipients who open reminder email | Unknown | UTM tracking on reminder links |
| Feedback reminder completion rate (sent → response) | ≥ 20% | Unknown (0% — emails not sent) | `feedback_reminders.status = 'sent'` → `gift_feedback` row |
| Repeat gifting rate (same recipient, ≥2 completed sessions) | ≥ 30% of retained users after 30 days | Unknown | `recipients` with `gift_count_cached >= 2` |
| Dashboard "Upcoming Occasions" widget click-through | ≥ 15% of dashboard visits | Unknown | PostHog `upcoming_occasion_widget_clicked` |
| Duplicate reminder email rate (same date, same user, same day) | 0% | Unknown (no idempotency) | Monitoring after BUG-05 fix |
| Gifting Pro upgrade conversion from reminder limit UI | ≥ 5% | Unknown | `upgrade_source = "reminder_limit"` |

---

## Section 3 — Occasion Reminder System: Full Spec

### 3.1 Date Entry UX (Recipient Form Modal)

The current form is functional. Required improvements:

**Current state:** Important dates section in `RecipientFormModal.tsx` with label dropdown, MM-DD input, "Repeats yearly" checkbox. `reminderNote` prop shows plan-specific messaging below the section.

**Required UX changes:**

**3.1.1 Upgrade gate in date section**
Currently, the `reminderNote` is displayed as a plain text string below the date section. This is not scannable enough.

Required: When `plan === "spark" || plan === "thoughtful"`, render an upgrade banner within the Important Dates section:

```
┌─ Important Dates ─────────────────────────────────────────────────┐
│  CalendarDays  IMPORTANT DATES                                    │
│                                                                   │
│  [📅 Birthday   MM-DD   🔁 Repeats yearly   🗑]                  │
│  [+ Add Date]                                                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ 🔔 Dates saved. Reminders require Confident 🎯            │   │
│  │    You'll get email alerts 14 and 3 days before each      │   │
│  │    saved date.    [Unlock reminders →]                    │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**3.1.2 Live reminder quota for Confident users**
Currently: plain text "X/3 reminders active". Required: count the number of dates that are actually upcoming (not the number of recipients).

```
Confident: "3 upcoming reminders saved · 0 remaining" (amber if used = max)
Gifting Pro: "3 upcoming reminders saved · Unlimited plan"
```

**3.1.3 `recurring` flag logic**
Currently the checkbox exists but is ignored by the cron. Two choices:
- **Option A:** Remove the `recurring` checkbox from the UI until the cron respects it (avoids user confusion about a broken feature).
- **Option B:** Add cron logic to skip non-recurring dates after their year has passed. Requires storing year alongside date (breaking change to format).

**Recommendation:** Option A — Remove the `recurring` UI checkbox for now. All dates are treated as recurring. Add a note: "All saved dates repeat yearly automatically." Tag Option B as V2 (requires MM-DD-YYYY format migration).

**3.1.4 Date format improvement**
Current: `MM-DD` plain text input. No input mask, no calendar picker. Users frequently enter wrong formats (validated client-side, but confusing).

Required: Add an input placeholder "04-25" and a format label "(Month-Day, e.g. 04-25)". Consider an Intl-based masked input for V2.

### 3.2 Email Design Spec

Current emails are functional but minimal. Required improvements:

**3.2.1 Subject line variants**

| Days Before | Subject |
|---|---|
| 14 days | `🎂 [Name]'s [Occasion] is in 2 weeks — find the perfect gift` |
| 3 days | `⏰ [Name]'s [Occasion] is in 3 days! Don't wait.` |
| 1 day (NEW) | `🚨 Last chance — [Name]'s [Occasion] is tomorrow` |

**3.2.2 Email body structure (required)**

```
GiftMind Logo mark

Hey [UserFirstName],

[Name]'s [Occasion] is in [N days / tomorrow].

GiftMind remembers what you've gifted [Name] before.
Here's what's different this time:
  • [N] gifts in history — AI will avoid repeats
  • [X] interests saved — recommendations get better over time

[🎁 Find a Gift for [Name] →]  ← primary CTA linking to /gift-flow?recipient=[UUID]&occasion=[OCCASION]&source=reminder

──────────────────────────────────

About your reminder:
You saved [Name]'s [Occasion] (every [MM/DD]) in GiftMind.
[Manage reminders] · [Unsubscribe from reminders]

GiftMind, helping you gift with intention.
```

**3.2.3 Pre-population via redirect link**
Current: `?recipient=UUID` only.
Required: `?recipient=UUID&occasion=SLUG&source=reminder_14d` (or `reminder_3d`).
- `occasion` slug should match the date label (e.g., `birthday`, `anniversary`). Map is needed in the Edge Function.
- `source` enables PostHog attribution of gift flow sessions started from reminder emails.

### 3.3 Cron Schedule and Timing

**Current:** Daily at 03:30 UTC (9 AM IST). Correct for IST-centric user base. Needs to be user-timezone-aware for V2.

**Required for V1:** Keep single cron time. Add a 1-day ahead reminder window as a new send trigger.

**Send windows (V1):**
| Window | Days Before | Subject Variant |
|---|---|---|
| Early alert | 14 | "is in 2 weeks" |
| Action alert | 3 | "is in just 3 days!" |
| Last chance | 1 | "is tomorrow" |

**Cron change required:**
```typescript
// Add to send-occasion-reminders/index.ts:
const oneDayTarget = new Date(today);
oneDayTarget.setDate(oneDayTarget.getDate() + 1);
const oneMonth = oneDayTarget.getMonth() + 1;
const oneDay = oneDayTarget.getDate();

// Then in the loop, add:
if (month === oneMonth && day === oneDay) {
  await sendReminderEmail(..., 1);
}
```

### 3.4 Idempotency — BUG-05 Fix

**Problem:** Double-runs send duplicate emails.

**Solution:** Add a `reminder_sent_log` table or add an idempotency field to the dates themselves.

**Recommended approach — `reminder_logs` table (new):**

```sql
CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  date_label text NOT NULL,   -- e.g. "Birthday"
  date_value text NOT NULL,   -- "MM-DD"
  days_before integer NOT NULL, -- 14, 3, or 1
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, date_value, days_before, sent_at::date) -- prevents dupe on same day
);
```

**Cron logic change:**
Before sending, check `reminder_logs` for `(recipient_id, date_value, days_before, today)`. If exists, skip. After sending, insert a row.

### 3.5 Rate Limiting Fix — BUG-03

**Problem:** The `remindersSentByUser` limit counts reminders across ALL recipients for a user. If a Confident user has 4+ birthdays on the same day, only 3 of 4 recipients get reminded.

**Root cause:** The intent of the limit is to prevent email spam and match the plan's feature set (3 active reminders per Confident plan). However, the current design mixes up "active saved reminders" (the profile-level quota) with "emails sent per run" (operational rate limiting).

**Correct design for V1:** 
- Remove the `remindersSentByUser` per-run cap.
- Honor the limit at the **date-entry level** instead: Confident users can save up to 3 recipients with active reminder dates. The limit is enforced when adding dates in `RecipientFormModal.tsx`, not at send time.
- If a user has 4 recipients with dates (violating the implicit plan limit), still send all 4 reminders and trust that the client-side gate prevents this.

**Alternative (simpler):** Keep the cap but make it per-recipient, not per-user-per-run. This is semantically: "max 3 recipients get reminded today" = close enough to "3 active reminder slots."

### 3.6 Non-Recurring Date Fix — BUG-02

**Short-term (V1):** Remove `recurring` checkbox from form. All dates recur yearly. Update copy to say "All dates repeat yearly automatically." Document V2 plan for full date support including year.

**V2 spec:** Change `important_dates` format to include optional year: `{ label, date: "MM-DD", year?: number, recurring: boolean }`. Migration needed. Cron logic: if `!recurring && year && year < currentYear`, skip the date.

---

## Section 4 — Feedback Reminder System: Full Spec

### 4.1 Opt-In Points (Both Working)

**Point 1 — GiftCard Selection Dialog** (already implemented in `GiftCard.tsx`):
- "Ask me after the occasion how it went" checkbox
- Default: `Boolean(occasionDate)` — opted in by default when occasion date is set, opted out otherwise
- Correctly calls `upsertFeedbackReminder()` on confirm

**Point 2 — Success Screen** (already implemented in `StepResults.tsx` → `SuccessState`):
- "Save for next year?" card with "Save reminder" / "No thanks" buttons
- Calls `handleSaveReminder()` → direct Supabase upsert
- **Gap:** This card says "next year" but the reminder fires 2 days after `occasionDate`, not next year. The copy is misleading — users expect a next-year reminder (like occasion reminders), not a post-gift feedback prompt.

**Required fix for Point 2:**
Change the success screen copy and flow to make the purpose clear:

```
┌─ Stay in the loop ─────────────────────────────────────────────────┐
│  📅  Ask me after [occasion] how it went                          │
│      In 2 days after [occasion date], we'll ask how               │
│      [Name] liked the gift. You'll also see how Signal            │
│      Check's prediction compared.                                  │
│                                                                    │
│  [Yes, follow up with me]        [No thanks]                      │
└────────────────────────────────────────────────────────────────────┘
```

**Note on plan gating:** Feedback reminders are NOT currently plan-gated. Any plan with a completed session can receive them. This seems intentional (it improves data quality for the AI) and should stay ungated.

### 4.2 `send-feedback-reminders` Edge Function — New (Required)

This is the most critical missing piece. The entire feedback loop depends on this Edge Function existing.

**Function spec:**

```typescript
// supabase/functions/send-feedback-reminders/index.ts

// Called by pg_cron daily at the same time as occasion reminders
// Checks feedback_reminders WHERE status='pending' AND remind_at <= NOW()
// For each pending reminder:
//   1. Fetch the session's selected_gift_name, occasion, recipient_id
//   2. Fetch the recipient's name
//   3. Fetch user email, notification preferences
//   4. Skip if notification_prefs.feedback_reminders === false
//   5. Send feedback email via Resend
//   6. Update feedback_reminders.status = 'sent'
//   7. Insert into reminder_logs (for deduplication)

interface FeedbackReminderRow {
  id: string;
  user_id: string;
  session_id: string;
  recipient_id: string | null;
  occasion: string;
  occasion_date: string | null;
  remind_at: string;
  status: string;
  users: {
    email: string | null;
    full_name: string | null;
    notification_prefs: { feedback_reminders?: boolean } | null;
  };
  gift_sessions: {
    selected_gift_name: string | null;
  };
  recipients: {
    name: string | null;
  } | null;
}
```

**Email template for feedback reminders:**

```
Subject: How did [Gift Name] land for [Name]'s [Occasion]? 🎁

Hey [UserName],

A few days ago you chose [Gift Name] for [Name]'s [Occasion].
Now that the moment has passed — did it hit the mark?

[😍 They loved it]  [😊 They liked it]  [😐 Neutral]  [😕 Didn't land]

Each of these links opens GiftMind's feedback form pre-filled
for this gift session.

──────────────────────────────────────────

Signal Check's read:
"[overall_message from signal_checks for this gift]"

See how Signal Check's prediction compared to what actually happened.
```

**Email CTA links:** Deep link to gift history with the session pre-expanded and feedback modal open:
`https://giftmind.in/gift-history?session=[sessionId]&feedback=true`

**Resend delivery events:** Use Resend webhook to update `feedback_reminders.status = 'delivered'` when Resend confirms delivery.

### 4.3 Feedback Reminder pg_cron Setup

Add to the cron migration (or create a new migration):

```sql
-- Feedback reminders: daily at 9 AM IST alongside occasion reminders
SELECT cron.schedule(
  'send-feedback-reminders',
  '35 3 * * *',  -- 3:35 UTC = 9:05 AM IST (5 min after occasion reminders)
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-feedback-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

### 4.4 `notification_prefs` Settings

Add `feedback_reminders` field to `notification_prefs` JSONB on `users` table (alongside existing `reminders` field):

```ts
// Updated notification_prefs shape:
{
  reminders?: boolean;             // occasion reminders (existing)
  feedback_reminders?: boolean;    // post-gift feedback prompts (new)
}
```

Expose this toggle in the Settings page under "Notifications":
- "Occasion reminders" toggle (existing)
- "Gift follow-ups" toggle (new) — "Ask me how my gift was received after each occasion"

---

## Section 5 — Repeat Gifting Workflow: Full Spec

### 5.1 The Intelligence Layer (Already Working)

`past_gift_retriever` in the LangGraph pipeline reads prior completed sessions for the recipient and injects their selected gift names into the AI prompt as "avoid recommending these." This is the core mechanic and requires no changes.

**What needs improving:** Making this behavior visible to the user so they trust and understand what the AI is doing.

### 5.2 Pre-Flow: "Gift Again" Entry Points

When a user enters the gift flow for a previously-gifted recipient, the experience should acknowledge this context.

**Required: Step 1 recipient card enhancement**

When a recipient has `gift_count_cached >= 1` (i.e., they've been gifted before in GiftMind), the recipient card in Step 1 should show:

```
┌──────────────────────────────────────────────────────┐
│ [P] Pratik                         ✓ (when selected) │
│ Close Friend 🇮🇳                                      │
│ Tech, Running, Photography +2                        │
│                                                      │
│ 🎁 Last gifted: Merino Running Headband (Apr 2025)   │  ← shows last gift name
│ 3 gifts in GiftMind memory                          │  ← shows count
└──────────────────────────────────────────────────────┘
```

This reassures the user that GiftMind will avoid repeats, without requiring any extra action.

**Data needed:** `last_gift_name` (currently NOT stored on `recipients` — only `last_gift_date`). Options:
- **Option A:** Query `gift_sessions` for the most recent completed session per recipient when loading Step 1. Cost: N additional queries if N recipients on the list.
- **Option B:** Add `last_gift_name text` column to `recipients`, maintained by `update_recipient_stats_for()` trigger. This is the correct long-term approach.

**Recommendation:** Option B. Update the `update_recipient_stats_for` function:

```sql
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS last_gift_name text;

-- In update_recipient_stats_for():
last_gift_name = (
  SELECT selected_gift_name
  FROM public.gift_sessions
  WHERE recipient_id = recipient_uuid
    AND (status = 'completed' OR selected_gift_name IS NOT NULL)
  ORDER BY created_at DESC
  LIMIT 1
),
```

### 5.3 In-Flow: Past Gift Memory Banner (Step 1 Design)

When a recipient with `gift_count_cached >= 1` is selected, show a contextual banner below the recipient grid (not a blocker, just ambient):

```
┌── Gift Memory Active ──────────────────────────────────────────┐
│ 🧠  GiftMind remembers 3 gifts for Pratik. The AI will         │
│     suggest something different this time.                      │
└────────────────────────────────────────────────────────────────┘
```

This banner:
- Appears after a previously-gifted recipient is selected
- Fades in with `AnimatePresence`
- Is amber/soft variant — not alarming
- Does NOT block Step 1 → Step 2 navigation
- Is NOT shown for recipients with 0 gifts

### 5.4 Post-Session: "Gift History" Entry for Repeat Context

When a user opens Gift History and expands a completed session that has a `selected_gift_name`, a "Gift Again for [Occasion]" button should appear:

```
[completed session card — Pratik's Birthday 2025]
  Gift chosen: Merino Running Headband ✓ 92% confidence
  [Shop Again ↗]  [Gift Again for Next Birthday →]  [Give Feedback ⭐]
```

"Gift Again for Next Birthday" navigates to:
`/gift-flow?recipient=[recipientId]&occasion=birthday&source=gift_again`

The gift flow then:
1. Pre-fills recipient + occasion in Step 1/2 (existing pre-fill mechanic)
2. The AI already avoids the past gift via `past_gift_retriever`
3. The breadcrumb at Step 1 shows the pre-fill banner: "Pre-filled from Gift History ✓"

### 5.5 Occasion Reminder Deep Link Enhancement

The current occasion reminder email links to `/gift-flow?recipient=UUID`. This starts a clean flow. Add occasion pre-fill:

```
/gift-flow?recipient=[UUID]&occasion=[slug]&source=reminder_14d
```

The occasion slug mapping (needed in `send-occasion-reminders`):

```typescript
const DATE_LABEL_TO_OCCASION_SLUG: Record<string, string> = {
  "Birthday": "birthday",
  "Anniversary": "anniversary",
  "Graduation": "graduation",
  "Work Anniversary": "work_anniversary",
  "Valentine's Day": "valentines",
  "Eid": "eid",
  "Diwali": "diwali",
  "Christmas": "christmas",
  "Hanukkah": "hanukkah",
  // Other / custom labels → no slug (don't pre-fill occasion)
};
```

When `dateEntry.label` maps to a slug, include `&occasion=[slug]` in the CTA link. When it doesn't (e.g., custom label), omit it.

---

## Section 6 — Dashboard Widget: Upcoming Occasions

### 6.1 The Gap

Today the Dashboard has no reminder surface. Users with saved occasion dates have no way to see them inside the app. They depend entirely on email.

### 6.2 Widget Spec

**Location:** Dashboard below the primary CTA and above the gift history preview.

**Visibility:**
- Only shown if the user has recipients with upcoming important dates (within next 60 days).
- On Spark/Thoughtful: shown with dates visible but upgrade prompt for reminders.
- On Confident/Gifting Pro: shown with reminder status indicators.

**Widget wireframe:**

```
┌─ Upcoming Occasions ──────────────────── [Manage →] ────────────┐
│  🔔 3 occasions in the next 60 days                              │
│                                                                  │
│  🎂  Pratik's Birthday         in 8 days     [Find a Gift →]   │
│  💍  Mom & Dad Anniversary     in 23 days    [Find a Gift →]   │
│  🏠  Shaqeeb's Housewarming    in 41 days    [Find a Gift →]   │
│                                                                  │
│  [View all people →]                                             │
└──────────────────────────────────────────────────────────────────┘
```

**Locked state (Spark/Thoughtful):**

```
┌─ Upcoming Occasions ─────────────────────────────────────────────┐
│  You have 2 saved dates. Activate email reminders on Confident.  │
│                                                                  │
│  🎂  Pratik's Birthday         in 8 days     [🔒 Locked]        │
│  💍  Mom & Dad Anniversary     in 23 days    [🔒 Locked]        │
│                                                                  │
│  [Unlock Reminders — Confident 🎯 →]                            │
└──────────────────────────────────────────────────────────────────┘
```

**Component:** `<UpcomingOccasionsWidget>` in `src/components/dashboard/`.

**Data source:** Query `recipients` with `important_dates IS NOT NULL`, compute upcoming dates client-side from the `MM-DD` field against today's date, filter to next 60 days, sort by proximity.

```typescript
function getUpcomingDates(
  recipients: RecipientWithIntelligence[],
  windowDays: number = 60
): Array<{
  recipientId: string;
  recipientName: string;
  label: string;
  daysUntil: number;
  emoji: string;
}> {
  const today = new Date();
  const results = [];
  
  for (const recipient of recipients) {
    const dates = parseRecipientImportantDates(recipient.important_dates);
    for (const date of dates) {
      const daysUntil = computeDaysUntil(date.date, today); // MM-DD → next occurrence
      if (daysUntil >= 0 && daysUntil <= windowDays) {
        results.push({
          recipientId: recipient.id,
          recipientName: recipient.name,
          label: date.label,
          daysUntil,
          emoji: DATE_LABEL_EMOJI[date.label] || "📅",
        });
      }
    }
  }
  
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
```

**Analytics events:**
- `upcoming_occasions_widget_viewed`: on mount, if results.length > 0
- `upcoming_occasions_gift_clicked`: on "Find a Gift" from widget
- `upcoming_occasions_upgrade_clicked`: on "Unlock Reminders" from locked widget

### 6.3 My People: Countdown on Recipient Cards

When sorted by "Upcoming dates", each recipient card should show the nearest upcoming occasion prominently:

**Current:** Date-based sort works, but the card shows "Last gifted: Apr 25" — date of last gift, not the upcoming occasion.

**Required:** When `sort === "upcoming"` and the recipient has a date within 30 days, show:

```
┌──────────────────────────────────┐
│ [P] Pratik                       │
│ Close Friend 🇮🇳                  │
│ Tech, Running +2                 │
│                                  │
│ 🎂 Birthday  →  in 8 days       │  ← new: shows nearest upcoming date
└──────────────────────────────────┘
```

Colors:
- `≤ 3 days`: amber/warning text — urgent
- `4–14 days`: primary text — standard
- `15–30 days`: muted foreground — ambient
- No upcoming date in 30 days: show "No upcoming dates" label

---

## Section 7 — Settings: Reminder Management

### 7.1 Current State

`Settings.tsx` presumably has a toggle for `notification_prefs.reminders`. The `/settings` page is linked from reminder emails but the UI is unclear.

### 7.2 Required Settings Section

```
┌─ Notifications ──────────────────────────────────────────────────┐
│                                                                  │
│  🔔 Occasion reminders                                [Toggle]   │
│    Get emailed 14 and 3 days before saved occasions.             │
│    Available on Confident and Gifting Pro.                       │
│                                                                  │
│  📬 Gift follow-ups                                   [Toggle]   │
│    Ask how the gift was received a few days after the occasion.  │
│    Available on all plans.                                       │
│                                                                  │
│  ⏰ Credit expiry warnings                            [Toggle]   │
│    Notify me when my credits are about to expire.                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Unsubscribe link in reminder emails:** "Manage reminders" → `/settings#notifications`. Must auto-scroll to the notifications section.

---

## Section 8 — Data Model Requirements

### 8.1 New Table: `reminder_logs` (Idempotency)

```sql
CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.recipients(id) ON DELETE CASCADE,
  date_label text NOT NULL,
  date_value text NOT NULL,  -- "MM-DD"
  days_before integer NOT NULL,  -- 14, 3, 1
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, date_value, days_before, (sent_at::date))
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
-- No user-read RLS needed; this is admin-write-only via service_role
```

### 8.2 Modified: `recipients.last_gift_name` (Repeat Gifting)

```sql
ALTER TABLE public.recipients 
  ADD COLUMN IF NOT EXISTS last_gift_name text;
```

Updated in `update_recipient_stats_for()` function.

### 8.3 Modified: `users.notification_prefs` (Feedback Reminders opt-out)

No schema change needed — `notification_prefs` is a JSONB column that already accepts arbitrary keys. Just add `feedback_reminders: boolean` to the TypeScript type and the Settings page.

### 8.4 Modified: `feedback_reminders.status` (New values)

Update status enum check or documentation:
- `'pending'` — created, not sent
- `'sent'` — email sent
- `'dismissed'` — user clicked "No thanks" in app (not in DB yet)
- `'delivered'` — confirmed delivered (via Resend webhook, optional V2)

---

## Section 9 — Plan Gating Summary

| Feature | Spark | Thoughtful | Confident | Gifting Pro |
|---|---|---|---|---|
| Save important dates | ✅ (up to 5 per recipient) | ✅ | ✅ | ✅ |
| Occasion reminder emails (14d + 3d + 1d) | ❌ | ❌ | ✅ (up to 3 active recipients) | ✅ Unlimited |
| Dashboard "Upcoming Occasions" widget | ✅ (read-only, no email) | ✅ (read-only, no email) | ✅ (with reminder badge) | ✅ |
| Feedback reminder emails ("How did it go?") | ✅ (all plans) | ✅ | ✅ | ✅ |
| "Gift Memory" indicator on recipient card | ✅ (if they have sessions) | ✅ | ✅ | ✅ |
| Repeat gifting (past gift avoidance AI) | ✅ (inherent in engine) | ✅ | ✅ | ✅ |

**Plan limit clarification for Confident:** "Up to 3 active recipients with reminders" means 3 recipients whose `important_dates` are monitored by the cron. This should be enforced at date-entry time in `RecipientFormModal` — not at send time. Current implementation has no client-side enforcement of this limit for date entry.

**Required gate logic for RecipientFormModal:**

When `plan === "confident"` and:
1. Count of recipients with non-empty `important_dates` EXCLUDING the current recipient being edited = 3
2. User tries to add a new date to a NEW recipient
3. → Show banner: "You've used all 3 reminder slots (Confident). Upgrade to Gifting Pro for unlimited reminders."

---

## Section 10 — Analytics Events

| Event | Trigger | Properties |
|---|---|---|
| `occasion_reminder_sent` | sendReminderEmail() success | `days_before`, `user_id`, `recipient_id`, `date_label` |
| `occasion_reminder_deduped` | Skip due to reminder_logs match | `days_before`, `reason: "already_sent"` |
| `feedback_reminder_sent` | send-feedback-reminders success | `session_id`, `occasion`, `days_after_occasion` |
| `reminder_email_opened` | Resend open event (webhook) | `days_before`, `recipient_id` |
| `reminder_cta_clicked` | Email CTA URL hit | `source: "reminder_14d"` etc. |
| `upcoming_occasions_widget_viewed` | Widget mounts with results | `occasion_count`, `nearest_days_until` |
| `upcoming_occasions_gift_clicked` | "Find Gift" from widget | `days_until`, `date_label` |
| `upcoming_occasions_upgrade_clicked` | "Unlock Reminders" CTA | `current_plan` |
| `feedback_reminder_opt_in` | Checkbox checked in selection dialog | `has_occasion_date: boolean` |
| `feedback_reminder_opt_out` | "No thanks" on success screen | N/A |
| `gift_again_clicked` | "Gift Again" from history | `session_id`, `days_since_last_gift` |

---

## Section 11 — Non-Goals

1. **SMS / WhatsApp reminders.** Email-only for V1. Multi-channel notifications are V2.
2. **Calendar integration (iCal, Google Calendar sync).** Export of occasion dates as `.ics` file — V2.
3. **Reminder customization** (user sets their own X-days-before window). V2. Current: fixed 14d, 3d, 1d.
4. **Push notifications** (PWA or native app). V2.
5. **Batch gifting** (gift flow for multiple recipients at once from a reminder). Tagged as Batch Mode PRD.
6. **AI-suggested occasions** (GiftMind proactively suggests "Pratik probably has a birthday coming up" based on relationship data). V2 predictive feature.
7. **Family trees / contact book sync** (import from Apple Contacts, Google Contacts). V2.

---

## Section 12 — Verification Plan

### Automated / Integration Tests

1. **`send-occasion-reminders`:**
   - Unit: insert a recipient with `important_dates: [{"label":"Birthday","date":"04-25","recurring":true}]` for a user on Confident plan. Set system date to April 11. Confirm email is sent (14-day window). Set to April 22. Confirm email is sent (3-day window).
   - Idempotency: Run cron twice. Confirm `reminder_logs` prevents second email.
   - Plan gate: Change user plan to Thoughtful. Confirm no email sent.
   - Opt-out: Set `notification_prefs.reminders = false`. Confirm no email sent.

2. **`send-feedback-reminders` (new):**
   - Unit: Insert a `feedback_reminders` row with `remind_at = NOW() - 1 hour`. Run function. Confirm email sent and `status = 'sent'`.
   - Idempotency: Confirm second run doesn't re-send.
   - Missing email: If `users.email` is null, skip gracefully.

3. **`upsertFeedbackReminder`:**
   - Confirm `remind_at` = `occasionDate + 2 days` when date provided.
   - Confirm `remind_at` = `NOW() + 7 days` when no date provided.
   - Confirm `UNIQUE(session_id)` blocks duplicate inserts.

4. **`update_recipient_stats_for`:**
   - After inserting a completed gift session with `selected_gift_name = "Merino Headband"`, confirm `recipients.last_gift_name = "Merino Headband"`.

### Manual Verification Checklist

1. **Recipient form — date entry:** Add important dates as Confident user. Confirm "Repeats yearly" checkbox is removed. Confirm format label shows "(Month-Day, e.g. 04-25)".

2. **Reminder quota display:** Add dates for 3 recipients (Confident). Confirm "3/3 reminders active" shows. Add date to 4th recipient — confirm gate banner appears.

3. **Email send — 14-day (staging):** Manually invoke `send-occasion-reminders` with a test recipient whose date is `TODAY+14`. Confirm email arrives with correct subject, body, deep link with occasion slug.

4. **Email idempotency:** Run trigger again same day. Confirm no second email (check `reminder_logs`).

5. **Feedback reminder opt-in (GiftCard):** Select a gift with occasion date set. Confirm checkbox is pre-checked. Confirm. Verify `feedback_reminders` row in DB.

6. **Feedback reminder opt-in (success screen):** After gift selection, verify "Stay in the loop" card appears with correct date context. Click "Yes, follow up with me". Verify row in DB.

7. **`send-feedback-reminders` (manual invoke):** Set a `feedback_reminders.remind_at` to past. Invoke function. Confirm feedback email arrives.

8. **Dashboard widget:** Log in as user with 2 recipients with upcoming dates (within 60 days). Confirm widget renders. Confirm "Find a Gift" link has correct recipient UUID. Log in as user with no upcoming dates — confirm widget hidden.

9. **My People — countdown display:** Add a date for recipient 8 days from now. Sort by "Upcoming dates". Confirm card shows "Birthday   →   in 8 days" in amber (≤14 days).

10. **Repeat gifting banner (Step 1):** Start gift flow for a recipient with `gift_count_cached >= 1`. Select that recipient. Confirm "Gift Memory Active" banner appears. Verify AI doesn't recommend the same gift as `last_gift_name`.

---

## Section 13 — Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| Q1 | Should feedback reminders fire at a flat "2 days after occasion date" or be configurable per user? Flat is simpler but may miss users whose occasions are flexible (e.g., "Christmas gifts were opened on Dec 27"). | UX, data quality | Product |
| Q2 | The Confident plan "3 active reminder slots" — is this 3 recipients, or 3 total date entries? A single recipient can have up to 5 dates. Current interpretation: 3 recipients (all their dates are included). Should it be 3 individual dates? | Plan design | Product |
| Q3 | Should feedback reminder emails have one-click reaction buttons in the email body (mailto links or magic links)? One-click increases completion rate dramatically but requires session-linked magic tokens. | Feedback completion rate | Engineering |
| Q4 | Should `last_gift_name` be shown in the occasion reminder email? ("You gave Pratik a Running Headband last year. GiftMind will suggest something new.") This requires querying gift_sessions in the cron — currently it only looks at recipients. | Email quality | Engineering |
| Q5 | When a Gifting Pro user has 50+ recipients with dates, do we have a Resend rate limit concern? Resend free tier: 100 emails/day. Paid tier: higher. At scale, need to batch sends and monitor delivery. | Infrastructure | Engineering |
