# PRD 18 — Occasion Reminders V2

**Feature area:** Occasion Reminders · Feedback Reminders · Repeat Gifting  
**Owner:** Product  
**Version:** 2.0  
**Status:** V1 implemented — audit, gap analysis, and V2 spec  
**Date:** 2026-05-02  
**Supersedes:** PRD 07 (kept as historical reference)

---

## Section 0 — Implementation Audit: What Is Now Built

PRD 07 was the design spec. This document captures what actually shipped.

### 0.1 Occasion Reminder System — Shipped

**Edge Function:** `supabase/functions/send-occasion-reminders/index.ts` (362 lines)

| Attribute | Value |
|---|---|
| Trigger | `pg_cron` daily at `30 3 * * *` (03:30 UTC = 9:00 AM IST) |
| Reminder windows | **14d, 3d, 1d** — all three shipped |
| Idempotency | `reminder_logs` table with partial unique index on `(recipient_id, date_value, days_before, sent_day)` WHERE `kind = 'occasion'` |
| Plan gate | `PLANS_WITH_REMINDERS = new Set(["spark", "pro"])` ← **⚠ BUG-01** |
| Per-run rate cap | Removed — PRD 07 BUG-03 fixed |
| Occasion slug | `getOccasionSlug()` maps label → `?occasion=` param |
| UTM source | `?source=reminder_14d` / `reminder_3d` / `reminder_1d` |
| Email body | Includes `gift_count_cached` + `interests.length` in contextual block |
| Feature flag | Checks `platform_settings.feature_occasion_reminders` |
| Analytics | `captureServerEvent("occasion_reminder_sent")` ✅ |

**DB (migration `20260424110000_occasion_reminders_feedback_loop.sql`):**
- `reminder_logs` table — idempotency for both occasion and feedback kinds
- `recipients.last_gift_name` — maintained by `update_recipient_stats_for()` trigger
- Both cron schedules registered

---

### 0.2 Feedback Reminder System — Shipped

**Edge Function:** `supabase/functions/send-feedback-reminders/index.ts` (281 lines)

| Attribute | Value |
|---|---|
| Trigger | `pg_cron` daily at `35 3 * * *` (5 min after occasion reminders) |
| Query | `feedback_reminders WHERE status='pending' AND remind_at <= NOW()` |
| Idempotency | `reminder_logs` `(session_id, sent_day)` partial unique index WHERE `kind = 'feedback'` |
| Pre-send check | Auto-dismisses to `'dismissed'` if `gift_feedback` row already exists |
| Opt-out | Respects `notification_prefs.feedback_reminders === false` |
| Signal Check embed | Fetches `signal_checks.result_payload.overall_message` and embeds in email |
| Email CTA | Deep links to `/gift-history?session=[id]&feedback=true` |
| Analytics | ❌ **Missing — BUG-05** |

**PRD 07 BUG-01 and BUG-07 are resolved.** The feedback reminder loop is live end-to-end.

---

### 0.3 Dashboard Surface — Shipped

| Component | File | Status |
|---|---|---|
| `OccasionsStrip` | `src/components/dashboard/OccasionsStrip.tsx` | ✅ |
| `SmartGreeting` | `src/components/dashboard/SmartGreeting.tsx` | ✅ |
| `ActionCardGrid` | `src/components/dashboard/ActionCardGrid.tsx` | ✅ |
| `CreditHealthWidget` | `src/components/dashboard/CreditHealthWidget.tsx` | ✅ |
| `ReengagementBanner` | `src/components/dashboard/ReengagementBanner.tsx` | ✅ |

---

### 0.4 Repeat Gifting — Shipped

- `recipients.last_gift_name` exists and is populated by the stats trigger
- `past_gift_retriever` LangGraph node avoids previous gifts in AI recommendations
- `gift_count_cached` accessible on recipient cards for \"Gift Memory\" display

---

### 0.5 Items NOT Implemented from PRD 07

| Item | PRD 07 Section | Status |
|---|---|---|
| Remove `recurring` checkbox from form | 3.1.3 | ❌ Still in `ImportantDate` type and UI |
| Slot enforcement at form level (Confident: 3 slots) | 3.5 | ❌ No client-side gate |
| One-click email reaction buttons | 4.2 | ❌ Email links to `/gift-history` only |
| `/settings#notifications` `feedback_reminders` toggle | 4.4 | ❓ Verify |
| \"Gift Memory Active\" banner in Step 1 | 5.3 | ❓ Verify |
| \"Gift Again\" button in Gift History | 5.4 | ❓ Verify |

---

### 0.6 Bugs Found in Shipped Code

**BUG-01 \[P0\]: Plan gate uses wrong identifiers**

`send-occasion-reminders/index.ts` line 21:
```typescript
const PLANS_WITH_REMINDERS = new Set(["spark", "pro"]);
```

PRD 07 specified `["confident", "gifting-pro"]`. After the plan rename migration (`20260426000000_simplify_plans_and_waitlist.sql`), the actual `users.active_plan` values may have changed. If `"spark"` is the free plan name, ALL users are receiving reminders. Audit `SELECT DISTINCT active_plan FROM users` immediately and update this set.

**BUG-02 \[P1\]: `recurring` flag in UI but ignored by cron**

`constants.ts` still has `recurring: boolean` in `ImportantDate`. The form likely still renders the \"Repeats yearly\" checkbox. Users who uncheck it receive reminders anyway — broken UX contract.

**Fix:** Remove checkbox from form UI. Keep field in type for DB compat. Add copy: \"All dates repeat yearly automatically.\"

**BUG-03 \[P1\]: No plan slot enforcement at date-entry time**

PRD 07 Section 9 specified Confident → max 3 recipients with reminder dates enforced at the form level. This was never built. Any user can add dates to unlimited recipients regardless of plan.

**BUG-04 \[P2\]: \"No thanks\" doesn't dismiss `feedback_reminders` row**

`StepResults.tsx` success screen \"No thanks\" button does not write `status = 'dismissed'` to the `feedback_reminders` table. The pending row will still fire when `remind_at` arrives even after the user explicitly opted out in-app.

**Fix:**
```typescript
await supabase
  .from("feedback_reminders")
  .update({ status: "dismissed" })
  .eq("session_id", sessionId);
```

**BUG-05 \[P2\]: No analytics in `send-feedback-reminders`**

`send-occasion-reminders` emits `captureServerEvent("occasion_reminder_sent")`. `send-feedback-reminders` has no analytics events — feedback delivery is invisible.

**Fix:** Import `captureServerEvent` from `_shared/server-analytics.ts` and emit `feedback_reminder_sent` on each successful send.

---

## Section 1 — Overview

Occasion Reminders and Repeat Gifting form GiftMind's **re-engagement and retention engine**. The core retention loop:

```
User saves recipient birthday (MM-DD)
  ↓ ~350 days later
Email: "Pratik's Birthday is in 2 weeks"
  → /gift-flow?recipient=UUID&occasion=birthday&source=reminder_14d
  ↓
Gift flow reruns (AI avoids past gifts)
  ↓
User selects gift → opts into feedback reminder
  ↓ 2 days after birthday
Email: "How did the gift land?"
  → /gift-history?session=ID&feedback=true
  ↓
User records reaction → Signal Check comparison renders → loop repeats next year
```

Every break in this loop is a user who doesn't return to GiftMind.

---

## Section 2 — Current Plan Gating

| Feature | Free (Spark?) | Paid (Pro?) |
|---|---|---|
| Save important dates (up to 5/recipient) | ✅ | ✅ |
| Occasion reminder emails (14d + 3d + 1d) | ⚠ Blocked by BUG-01 | ✅ |
| Dashboard Occasions Strip | ✅ read-only | ✅ with status |
| Feedback reminder emails | ✅ all plans | ✅ all plans |
| Past gift avoidance in AI | ✅ all plans | ✅ all plans |

> **Open question Q1:** Confirm current production plan tier names — this is P0 for BUG-01.

---

## Section 3 — V1 Fixes (Pre-Launch Hardening)

### 3.1 Fix Plan Gate — BUG-01 \[P0\]
Query production for `SELECT DISTINCT active_plan FROM users`. Update `PLANS_WITH_REMINDERS` to the correct set. Deploy immediately.

### 3.2 Remove `recurring` Checkbox — BUG-02 \[P1\]
In `RecipientFormModal.tsx`, remove the \"Repeats yearly\" checkbox from the Important Dates section. Add inline label: \"All saved dates repeat yearly automatically.\"

### 3.3 Add Slot Enforcement — BUG-03 \[P1\]
In `RecipientFormModal.tsx`, when adding a new date entry:

```typescript
const otherRecipientsWithDates = allRecipients.filter(
  r => r.id !== currentRecipientId &&
  parseRecipientImportantDates(r.important_dates).length > 0
);

if (planNeedsSlotLimit && otherRecipientsWithDates.length >= REMINDER_SLOT_LIMIT) {
  showUpgradeBanner("You've used all reminder slots. Upgrade for unlimited.");
  return;
}
```

### 3.4 Fix \"No Thanks\" Dismiss — BUG-04 \[P2\]
In `StepResults.tsx`, on \"No thanks\" click, update `feedback_reminders.status = 'dismissed'` for the current session.

### 3.5 Add Analytics to Feedback Reminders — BUG-05 \[P2\]
Import and call `captureServerEvent("feedback_reminder_sent", ...)` in `send-feedback-reminders/index.ts` after each successful send.

---

## Section 4 — V2 Features

### 4.1 Timezone-Aware Sends

**Problem:** Cron at 03:30 UTC = 9 AM IST. Non-IST users get reminders at 3 AM EST / 10 PM PST.

**Solution:**
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Kolkata';
```

Run cron hourly. Each run only processes users whose local time is 9 AM:
```typescript
const localHour = getLocalHour(user.timezone ?? "Asia/Kolkata");
if (localHour !== 9) continue;
```

### 4.2 One-Click Email Reactions for Feedback Reminders

**Problem:** Multi-step path (email → app → find session → submit rating) kills completion rate.

**Solution:** Generate signed magic-link URLs per reminder. User clicks one of 4 reaction buttons in the email and is instantly redirected with feedback pre-submitted.

```
[😍 Loved it]  [😊 Liked it]  [😐 Neutral]  [😕 Didn't land]
```

Each links to: `https://giftmind.in/api/feedback-react?session=[ID]&reaction=[VALUE]&token=[HMAC]`

New table:
```sql
CREATE TABLE public.feedback_reaction_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  reaction text NOT NULL CHECK (reaction IN ('loved_it','liked_it','neutral','didnt_like')),
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

API route validates HMAC, writes `gift_feedback`, marks token used, redirects to `/gift-history?session=ID&reaction_recorded=true`.

### 4.3 iCal / Calendar Export

**Problem:** Users want their GiftMind occasions in Google/Apple Calendar without relying on email.

**Solution:** `GET /api/occasions.ics?token=[JWT]` returns an RFC 5545 iCalendar feed of all important dates across all recipients.

```
BEGIN:VCALENDAR
PRODID:-//GiftMind//Occasions//EN
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Pratik's Birthday
DTSTART;VALUE=DATE:20270425
RRULE:FREQ=YEARLY
DESCRIPTION:Find a gift → https://giftmind.in/gift-flow?recipient=UUID
END:VEVENT
END:VCALENDAR
```

Settings page gets an \"Subscribe to Calendar\" button. One-click adds as a live-updating calendar subscription.

### 4.4 Post-Session Date-Save Prompt

**Problem:** Users frequently forget to save a date when creating a recipient profile. They run a gift flow for a Birthday and then can't get reminders because no `important_dates` entry exists.

**Solution:** After gift selection on `StepResults.tsx` success screen, if `session.occasion` maps to a `DATE_LABEL_OPTIONS` label AND the recipient has no `important_dates` entry for that label, show:

```
┌─ Never miss this again ───────────────────────────────────────┐
│  📅  Save Pratik's Birthday date to get reminded next year.  │
│                                                               │
│  Month-Day (e.g. 04-25): [_________]                         │
│                                                               │
│  [Save Date →]    [Skip]                                      │
└───────────────────────────────────────────────────────────────┘
```

On save: PATCH `recipients.important_dates` to append the new entry.

### 4.5 Reminder Pause / Snooze

**Problem:** Users on vacation or planning ahead can't temporarily pause reminders without disabling them globally.

**Solution:** Add \"Snooze for 30 days\" option in Settings notifications section and in reminder email footer. Writes `notification_prefs.reminders_snoozed_until = ISO_DATE`. Cron skips users where `reminders_snoozed_until > TODAY`.

### 4.6 Weekly Digest Mode

**Problem:** Users with 10+ recipients get individual emails per upcoming occasion — email noise at scale.

**Solution:** New `notification_prefs.reminder_mode` setting:
- `"individual"` — current behavior (default)  
- `"weekly_digest"` — one email every Monday listing all occasions in the next 14 days

Digest cron runs weekly on Mondays at 9 AM in the user's timezone. Lists occasions sorted by proximity with a \"Find a Gift\" link per row.

---

## Section 5 — Data Model Changes for V2

### 5.1 `users.timezone`
```sql
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Kolkata';
```

### 5.2 `users.notification_prefs` — New Fields (no schema change needed)
```typescript
{
  reminders?: boolean;                              // existing
  feedback_reminders?: boolean;                     // existing
  reminder_mode?: "individual" | "weekly_digest";  // V2
  reminders_snoozed_until?: string;                 // V2 ISO date string
}
```

### 5.3 `feedback_reaction_tokens` (V2 magic links)
```sql
CREATE TABLE public.feedback_reaction_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  reaction text NOT NULL CHECK (reaction IN ('loved_it','liked_it','neutral','didnt_like')),
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_reaction_tokens ENABLE ROW LEVEL SECURITY;
```

---

## Section 6 — Analytics Events

### Existing — Verify Instrumented

| Event | Where | Status |
|---|---|---|
| `occasion_reminder_sent` | `send-occasion-reminders` | ✅ |
| `occasion_reminder_deduped` | `send-occasion-reminders` | ⚠ console.log only |
| `feedback_reminder_sent` | `send-feedback-reminders` | ❌ missing |
| `upcoming_occasions_gift_clicked` | `OccasionsStrip` | ❓ verify |

### New Events for V2

| Event | Trigger | Properties |
|---|---|---|
| `feedback_reaction_one_click` | Magic link reacted | `session_id`, `reaction`, `source: "email"` |
| `ical_export_clicked` | Settings calendar export | `recipient_count`, `date_count` |
| `post_session_date_saved` | Date saved via success screen | `occasion`, `recipient_id` |
| `reminder_snoozed` | Snooze activated | `snooze_days` |
| `digest_mode_changed` | Mode toggled in settings | `new_mode` |

---

## Section 7 — Implementation Checklist

### Phase 1 — V1 Hardening (Must Ship Now)
- [ ] Query prod `active_plan` values — fix `PLANS_WITH_REMINDERS` (BUG-01)
- [ ] Remove `recurring` checkbox from `RecipientFormModal` (BUG-02)
- [ ] Add slot enforcement for paid plan limit in `RecipientFormModal` (BUG-03)
- [ ] Fix \"No thanks\" to dismiss `feedback_reminders` row (BUG-04)
- [ ] Add `captureServerEvent` to `send-feedback-reminders` (BUG-05)
- [ ] Verify `feedback_reminders` Settings toggle exists
- [ ] Verify \"Gift Memory\" banner in Step 1 (gift flow)
- [ ] Verify \"Gift Again\" button in Gift History

### Phase 2 — V2 Quick Wins
- [ ] Post-session date-save prompt in `StepResults.tsx`
- [ ] Reminder snooze in Settings + email footer copy
- [ ] `feedback_reaction_tokens` migration + API route + email one-click links

### Phase 3 — V2 Infrastructure
- [ ] `users.timezone` column + timezone-aware hourly cron
- [ ] iCal export endpoint + Settings \"Subscribe to Calendar\" button
- [ ] Weekly digest mode — new cron schedule + digest email template

---

## Section 8 — Open Questions

| # | Question | Priority | Owner |
|---|---|---|---|
| Q1 | What are the actual `users.active_plan` values in production right now? | P0 | Engineering |
| Q2 | Is the \"3 reminder slot\" Confident limit still the intended design after the plan simplification? | P1 | Product |
| Q3 | Should weekly digest replace individual emails or be an opt-in alternative? | P2 | Product |
| Q4 | Should the iCal feed be JWT-authenticated (rotatable) or a long-lived secret token (simpler)? | P2 | Engineering |
| Q5 | Should magic-link reactions create a full `gift_feedback` row or only update `feedback_reminders.status`? Full row closes the Signal Check comparison loop. | P2 | Engineering |

---

## Section 9 — Non-Goals (Deferred)

1. SMS / WhatsApp reminders — email-only for current scope
2. Push notifications (PWA / native app) — V3
3. Contact book import (Google Contacts, Apple Contacts) — separate PRD
4. Batch gifting triggered from a reminder — Batch Mode PRD
5. AI-predicted occasions (proactive suggestions without user input) — future ML feature
