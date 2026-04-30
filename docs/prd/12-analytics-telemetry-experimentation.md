# PRD 12 — Analytics, Telemetry & Experimentation

**Document status:** Draft
**Author:** Product
**Last updated:** 2026-04-30
**Related PRDs:** 10 (Admin Dashboard & RBAC), 05 (Product Linking & Affiliate), 08 (Credits & Wallet), 09 (Plans & Limits)

---

## 1. Overview

GiftMind already captures analytics data through three independent systems — **PostHog** (product analytics), **Sentry** (error tracking), and **Supabase tables** (first-party behavioural data stored in `gift_sessions`, `product_clicks`, `affiliate_conversions`, `credit_transactions`). The admin dashboard surfaces some of this via `AdminOverview` and `AdminGiftAnalytics`.

However, these systems are loosely connected, inconsistently instrumented, and have no experimentation layer. This PRD defines the unified strategy for:

1. **Analytics** — standardised event taxonomy, funnel tracking, cohort analysis.
2. **Telemetry** — AI provider performance, error budgets, Edge Function health.
3. **Experimentation** — A/B testing via PostHog feature flags, with server-side evaluation support.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Define a canonical event taxonomy that all `trackEvent` calls conform to. |
| G2 | Eliminate blind spots — instrument untracked flows (Settings saves, credit purchases, referral completions, occasion reminder opens). |
| G3 | Build a telemetry pipeline for AI provider health (latency, fallback rate, token cost, error rate) queryable from the admin dashboard. |
| G4 | Introduce an experimentation framework using PostHog feature flags with server-side (Edge Function) evaluation. |
| G5 | Create a unified Analytics Context on the frontend that enriches every event with session-level properties (plan, country, credits_balance, onboarding_status). |
| G6 | Surface experiment results and telemetry dashboards in the admin panel. |

### Non-goals

- Building a custom analytics backend — PostHog remains the primary analytics store.
- Replacing Sentry — it continues to own error/exception tracking.
- Real-time streaming dashboards — admin analytics remain poll-based (React Query).
- GDPR consent management beyond the existing cookie consent banner.

---

## 3. Current State Analysis

### 3.1 PostHog Integration (`src/lib/posthog.ts`)

- Initialised only in production (or when `VITE_ENABLE_POSTHOG_IN_DEV=true`).
- Respects cookie consent (`gm_cookie_consent`).
- `autocapture: false` — all events are manual via `trackEvent()`.
- `capture_pageview: true`, `capture_pageleave: true`.
- Exports: `initPosthog()`, `identifyUser()`, `trackEvent()`, `resetUser()`.

### 3.2 Sentry Integration (`src/lib/sentry.ts`)

- `tracesSampleRate: 0.1` (10% of transactions).
- `replaysSessionSampleRate: 0` (session replay disabled).
- PII scrubbing: strips `email` and `ip_address` from events.
- Exports: `initSentry()`, `setSentryUser()`, `clearSentryUser()`, `captureError()`.

### 3.3 Existing Event Inventory

**Currently tracked events (50+ calls across codebase):**

| Category | Events |
|----------|--------|
| Auth | `user_signup`, `user_login` |
| Onboarding | `onboarding_started`, `onboarding_step_viewed`, `onboarding_step_completed`, `onboarding_skipped`, `onboarding_completed`, `onboarding_resumed`, `profile_finish_setup_started` |
| Recipients | `recipient_added`, `recipient_search_performed`, `recipient_card_clicked`, `recipient_find_gift_clicked` |
| Gift Flow | `gift_flow_started`, `results_viewed`, `gift_selected`, `gift_selection_cancelled`, `gift_save_for_later_clicked`, `regenerate_clicked`, `regenerate_limit_hit`, `start_over_clicked` |
| Product Links | `product_link_clicked`, `buy_link_clicked`, `buy_link_locked_clicked`, `locked_store_clicked`, `results_buy_link_clicked_post_selection` |
| Signal Check | `signal_check_run`, `signal_check_success`, `signal_check_error`, `signal_check_follow_up`, `signal_check_history_viewed` |
| Monetisation | `plan_comparison_viewed`, `feature_lock_shown`, `pro_waitlist_joined`, `pro_waitlist_already_joined` |
| Profile | `profile_updated`, `profile_banner_shown`, `profile_banner_dismissed`, `profile_banner_clicked` |
| Dashboard | `upcoming_occasions_gift_clicked`, `upcoming_occasions_widget_viewed`, `upcoming_occasions_upgrade_clicked` |
| Blog | `blog_cta_clicked` |
| Feedback | `feedback_submitted` |

### 3.4 Gaps Identified

| Gap | Impact |
|-----|--------|
| No event for credit purchase completion/failure | Cannot measure purchase funnel conversion |
| No event for referral flow (send, accept, complete) | Cannot measure referral virality |
| No event for occasion reminder email opens/clicks | Cannot measure reminder effectiveness |
| No event for settings page interactions | Cannot measure feature discovery |
| No event for gift history browsing | Cannot measure re-engagement |
| AI provider telemetry only in DB columns, not PostHog | Cannot correlate AI perf with user satisfaction |
| No experiment assignment tracking | Cannot run A/B tests |
| No session-level enrichment | Events lack plan/country context |
| `trackEvent` calls use inconsistent property schemas | Hard to build reliable funnels |

### 3.5 First-Party DB Analytics

**Tables with analytics value:**

| Table | Key columns | Used in admin |
|-------|-------------|---------------|
| `gift_sessions` | `status`, `occasion`, `budget_*`, `feedback_rating`, `ai_provider_used`, `ai_latency_ms`, `ai_attempt_number`, `engine_version`, `credits_used` | `AdminGiftAnalytics` |
| `product_clicks` | `store`, `store_name`, `country`, `clicked_at`, `recipient_id`, `recommendation_index` | `AdminOverview`, `AdminGiftAnalytics` |
| `affiliate_conversions` | `network`, `commission`, `session_id`, `converted_at` | Not yet surfaced |
| `credit_transactions` | `type`, `amount`, `batch_id`, `session_id` | `AdminCredits` (partial) |
| `credit_batches` | `package_name`, `price_paid`, `currency` | `AdminOverview` |
| `feedback_reminders` | `occasion`, `status`, `remind_at` | Not yet surfaced |
| `signal_checks` | `score`, `provider`, `latency_ms` | Not yet surfaced |

---

## 4. Event Taxonomy — Canonical Schema

### 4.1 Naming Convention

All events follow the pattern: `{noun}_{verb}` in `snake_case`.

- **Noun**: the object/feature area (`gift_flow`, `credit`, `referral`, `signal_check`, `onboarding`, `recipient`, `product_link`, `experiment`).
- **Verb**: the action (`started`, `completed`, `viewed`, `clicked`, `failed`, `submitted`, `assigned`).

### 4.2 Global Properties (enriched automatically)

Every event includes these properties via the Analytics Context:

```ts
interface GlobalEventProperties {
  user_plan: 'spark' | 'confident' | null;
  user_country: string | null;
  credits_balance: number;
  onboarding_completed: boolean;
  session_count: number;          // lifetime gift sessions
  recipient_count: number;        // total recipients
  days_since_signup: number;
  app_version: string;            // from package.json
  experiment_assignments: Record<string, string>;  // active experiments
}
```

### 4.3 New Events to Instrument

| Event | Trigger | Properties |
|-------|---------|------------|
| `credit_purchase_started` | User clicks buy on a credit package | `package_name`, `price`, `currency` |
| `credit_purchase_completed` | PayPal checkout success callback | `package_name`, `price`, `currency`, `batch_id` |
| `credit_purchase_failed` | PayPal checkout error | `package_name`, `error_code` |
| `referral_link_copied` | User copies referral link | `source` (settings, dashboard) |
| `referral_signup_completed` | Referred user completes signup | `referrer_id` |
| `referral_reward_granted` | Referrer receives bonus credits | `bonus_amount` |
| `occasion_reminder_sent` | Edge Function sends reminder email | `occasion`, `days_before`, `recipient_id` |
| `occasion_reminder_opened` | User opens reminder email (via tracking pixel) | `reminder_id` |
| `occasion_reminder_clicked` | User clicks CTA in reminder email | `reminder_id`, `action` |
| `gift_history_viewed` | User opens Gift History page | `session_count` |
| `gift_history_detail_viewed` | User expands a history item | `session_id`, `occasion` |
| `settings_section_viewed` | User views a settings section | `section` (account, notifications, etc.) |
| `cookie_consent_accepted` | User accepts cookie banner | — |
| `cookie_consent_declined` | User declines cookie banner | — |
| `ai_generation_completed` | Edge Function completes AI call | `provider`, `model`, `latency_ms`, `tokens_used`, `attempt_number`, `is_fallback`, `engine_version` |
| `ai_generation_failed` | Edge Function AI call fails | `provider`, `model`, `error_type`, `attempt_number` |
| `experiment_assigned` | User assigned to experiment variant | `experiment_key`, `variant` |

---

## 5. Analytics Context — Frontend Architecture

### 5.1 AnalyticsProvider

A React context that wraps the app and enriches all events:

```tsx
// src/contexts/AnalyticsContext.tsx
interface AnalyticsContextValue {
  track: (event: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string, traits: Record<string, unknown>) => void;
  reset: () => void;
  getExperimentVariant: (key: string) => string | undefined;
}
```

The `track` function merges global properties with event-specific properties before calling `posthog.capture()`.

### 5.2 useAnalytics Hook

```ts
// src/hooks/useAnalytics.ts
export function useAnalytics() {
  return useContext(AnalyticsContext);
}
```

This replaces direct `trackEvent()` imports across the codebase. Migration is incremental — existing `trackEvent()` calls continue to work but new code uses the hook.

### 5.3 Integration Points

```
main.tsx
  └── AnalyticsProvider        (wraps entire app)
        ├── initPosthog()       (on mount, if consent given)
        ├── initSentry()        (on mount)
        ├── identifyUser()      (when auth state changes)
        └── enriches all track() calls with global properties
```

---

## 6. Telemetry — AI Provider Health

### 6.1 Server-Side Telemetry Collection

The `generate-gifts` Edge Function already records `ai_provider_used`, `ai_latency_ms`, and `ai_attempt_number` on `gift_sessions`. This is extended:

**New columns on `gift_sessions`:**

```sql
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS ai_tokens_input integer,
  ADD COLUMN IF NOT EXISTS ai_tokens_output integer,
  ADD COLUMN IF NOT EXISTS ai_error_type text,
  ADD COLUMN IF NOT EXISTS ai_estimated_cost_usd numeric(8,6);
```

**New table: `ai_telemetry_log`**

For granular per-call telemetry (including retries and fallbacks):

```sql
CREATE TABLE IF NOT EXISTS public.ai_telemetry_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  function_name text NOT NULL,         -- 'generate-gifts', 'signal-check'
  provider text NOT NULL,              -- 'groq', 'anthropic', 'openai'
  model text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
  latency_ms integer,
  tokens_input integer,
  tokens_output integer,
  estimated_cost_usd numeric(8,6),
  error_type text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_function_created ON public.ai_telemetry_log(function_name, created_at DESC);
CREATE INDEX idx_telemetry_provider ON public.ai_telemetry_log(provider, status);
CREATE INDEX idx_telemetry_session ON public.ai_telemetry_log(session_id);

ALTER TABLE public.ai_telemetry_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read, service_role inserts
CREATE POLICY telemetry_admin_read ON public.ai_telemetry_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY telemetry_service_insert ON public.ai_telemetry_log
  FOR INSERT TO service_role WITH CHECK (true);
```

### 6.2 Edge Function Telemetry Helper

```ts
// supabase/functions/_shared/telemetry.ts
export async function logAiCall(client: SupabaseClient, params: {
  session_id?: string;
  function_name: string;
  provider: string;
  model: string;
  attempt_number: number;
  status: 'success' | 'error' | 'timeout' | 'rate_limited';
  latency_ms: number;
  tokens_input?: number;
  tokens_output?: number;
  error_type?: string;
  error_message?: string;
}) {
  const cost = estimateCost(params.provider, params.model, params.tokens_input, params.tokens_output);
  await client.from('ai_telemetry_log').insert({ ...params, estimated_cost_usd: cost });
}
```

### 6.3 Admin Telemetry Dashboard

New section in `AdminGiftAnalytics` or new page `/admin/telemetry`:

**Metric cards:**
- Total AI calls (30d), Success rate, Avg latency, Fallback rate, Estimated cost (30d)

**Charts:**
- Latency by provider (line chart, daily avg over 30d)
- Error rate by provider (stacked bar)
- Cost breakdown by function (pie chart)
- Calls by provider (bar chart)

**Table:**
- Recent errors (last 50), with provider, model, error_type, timestamp

---

## 7. Experimentation Framework

### 7.1 PostHog Feature Flags

GiftMind uses PostHog feature flags for experimentation. PostHog's JS SDK provides:
- `posthog.isFeatureEnabled(key)` — boolean flags
- `posthog.getFeatureFlag(key)` — multivariate flags (returns variant string)
- Automatic user assignment with consistent bucketing

### 7.2 Client-Side Experiment Evaluation

```ts
// src/lib/experiments.ts
export const EXPERIMENTS = {
  GIFT_CARD_LAYOUT: 'gift-card-layout',          // 'control' | 'compact' | 'detailed'
  ONBOARDING_FLOW: 'onboarding-flow-v2',         // 'control' | 'streamlined'
  SIGNAL_CHECK_PLACEMENT: 'signal-check-cta',    // 'control' | 'inline' | 'modal'
  RESULTS_PAGE_CTA: 'results-cta-copy',          // 'control' | 'variant_a' | 'variant_b'
} as const;

export function getExperimentVariant(key: string): string | undefined {
  if (!posthog.__loaded) return undefined;
  const variant = posthog.getFeatureFlag(key);
  return typeof variant === 'string' ? variant : undefined;
}
```

### 7.3 Server-Side Experiment Evaluation

For Edge Functions that need experiment context (e.g., AI model selection, prompt variants):

```ts
// supabase/functions/_shared/experiments.ts
import { PostHog } from 'posthog-node';

const posthogClient = new PostHog(Deno.env.get('POSTHOG_API_KEY')!, {
  host: Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com',
});

export async function getServerExperimentVariant(
  userId: string,
  experimentKey: string,
  userProperties?: Record<string, unknown>
): Promise<string | boolean | undefined> {
  return await posthogClient.getFeatureFlag(experimentKey, userId, {
    personProperties: userProperties,
  });
}
```

### 7.4 Experiment Tracking

When a user is assigned to an experiment, track:

```ts
track('experiment_assigned', {
  experiment_key: 'gift-card-layout',
  variant: 'compact',
});
```

PostHog automatically tracks `$feature_flag_called` events, but explicit tracking ensures consistency.

### 7.5 useExperiment Hook

```ts
// src/hooks/useExperiment.ts
export function useExperiment(key: string): {
  variant: string | undefined;
  isLoading: boolean;
} {
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const { track } = useAnalytics();

  useEffect(() => {
    const v = getExperimentVariant(key);
    setVariant(v);
    setIsLoading(false);
    if (v) track('experiment_assigned', { experiment_key: key, variant: v });
  }, [key]);

  return { variant, isLoading };
}
```

### 7.6 Initial Experiments (Recommended)

| Experiment | Variants | Hypothesis | Primary metric |
|-----------|----------|------------|----------------|
| `gift-card-layout` | control, compact | Compact cards increase gift selection rate | `gift_selected` rate |
| `onboarding-flow-v2` | control, streamlined | Fewer steps increase completion | `onboarding_completed` rate |
| `results-cta-copy` | control, variant_a | Stronger CTA copy increases product clicks | `buy_link_clicked` rate |
| `signal-check-cta` | control, inline | Inline placement increases Signal Check usage | `signal_check_run` rate |

---

## 8. Privacy & Consent

### 8.1 Cookie Consent

The existing cookie consent flow is preserved:
- PostHog initialises only after `gm_cookie_consent === 'accepted'`.
- If declined, no PostHog events fire; Sentry still initialises (error tracking is legitimate interest).
- First-party DB analytics (gift_sessions, product_clicks) always collect — they are essential service data.

### 8.2 PII Handling

| System | PII policy |
|--------|-----------|
| PostHog | User identified by `user_id` (UUID). No email/name sent as event properties. Plan and country are allowed. |
| Sentry | `beforeSend` strips `email` and `ip_address` (already implemented). |
| `ai_telemetry_log` | No user-identifying columns. Linked to session_id only. |
| `admin_audit_log` | Contains `actor_email` — admin-only table, not user-facing. |

### 8.3 Data Retention

| System | Retention |
|--------|-----------|
| PostHog | Per PostHog plan settings (default 1 year) |
| Sentry | Per Sentry plan settings (default 90 days) |
| `ai_telemetry_log` | 90 days — cron job purges older rows |
| `gift_sessions` | Indefinite (core business data) |
| `product_clicks` | Indefinite (affiliate revenue attribution) |

Purge cron for telemetry:

```sql
SELECT cron.schedule(
  'purge-old-telemetry',
  '0 3 * * 0',
  $$DELETE FROM public.ai_telemetry_log WHERE created_at < now() - interval '90 days';$$
);
```

---

## 9. Funnels & Key Metrics

### 9.1 Core Funnels

**Signup-to-Value Funnel:**
`user_signup` → `onboarding_completed` → `gift_flow_started` → `results_viewed` → `gift_selected` → `buy_link_clicked`

**Purchase Funnel:**
`plan_comparison_viewed` → `credit_purchase_started` → `credit_purchase_completed`

**Referral Funnel:**
`referral_link_copied` → `referral_signup_completed` → `referral_reward_granted`

**Signal Check Funnel:**
`signal_check_run` → `signal_check_success` → `signal_check_follow_up`

### 9.2 Key Metrics (North Star + Supporting)

| Metric | Definition | Target |
|--------|-----------|--------|
| **Gift Completion Rate** (North Star) | `gift_selected` / `gift_flow_started` | > 60% |
| Onboarding Completion | `onboarding_completed` / `user_signup` | > 70% |
| Buy Link CTR | `buy_link_clicked` / `results_viewed` | > 25% |
| Signal Check Adoption | users with ≥1 `signal_check_run` / MAU | > 15% |
| Purchase Conversion | `credit_purchase_completed` / `plan_comparison_viewed` | > 5% |
| AI Success Rate | success / total `ai_telemetry_log` calls | > 98% |
| Avg AI Latency | avg `latency_ms` in `ai_telemetry_log` | < 8000ms |
| Feedback Rate | sessions with `feedback_submitted` / completed sessions | > 20% |

---

## 10. Database Migration

### Migration: `20260430120000_analytics_telemetry_experimentation.sql`

```sql
-- 1. AI telemetry columns on gift_sessions
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS ai_tokens_input integer,
  ADD COLUMN IF NOT EXISTS ai_tokens_output integer,
  ADD COLUMN IF NOT EXISTS ai_error_type text,
  ADD COLUMN IF NOT EXISTS ai_estimated_cost_usd numeric(8,6);

-- 2. AI telemetry log table
CREATE TABLE IF NOT EXISTS public.ai_telemetry_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.gift_sessions(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
  latency_ms integer,
  tokens_input integer,
  tokens_output integer,
  estimated_cost_usd numeric(8,6),
  error_type text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_function_created
  ON public.ai_telemetry_log(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_provider
  ON public.ai_telemetry_log(provider, status);
CREATE INDEX IF NOT EXISTS idx_telemetry_session
  ON public.ai_telemetry_log(session_id);

ALTER TABLE public.ai_telemetry_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY telemetry_admin_read ON public.ai_telemetry_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY telemetry_service_insert ON public.ai_telemetry_log
  FOR INSERT TO service_role WITH CHECK (true);

-- 3. Telemetry purge cron (90-day retention)
SELECT cron.schedule(
  'purge-old-telemetry',
  '0 3 * * 0',
  $$DELETE FROM public.ai_telemetry_log WHERE created_at < now() - interval '90 days';$$
)
WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- 4. Platform settings for experimentation
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('posthog_server_api_key', '""', 'PostHog API key for server-side feature flag evaluation'),
  ('experiment_gift_card_layout', '"control"', 'Override: gift card layout experiment'),
  ('experiment_onboarding_flow_v2', '"control"', 'Override: onboarding flow experiment'),
  ('telemetry_retention_days', '90', 'Days to retain AI telemetry logs'),
  ('telemetry_enabled', 'true', 'Enable AI telemetry logging in Edge Functions')
ON CONFLICT (key) DO NOTHING;
```

---

## 11. Implementation Checklist

### Phase 1 — Event Taxonomy & Analytics Context
- [ ] Create `src/contexts/AnalyticsContext.tsx` with global property enrichment.
- [ ] Create `src/hooks/useAnalytics.ts` hook.
- [ ] Wrap app in `AnalyticsProvider` in `main.tsx`.
- [ ] Define canonical property interfaces in `src/lib/analytics-types.ts`.
- [ ] Add new events: `credit_purchase_*`, `referral_*`, `gift_history_*`, `settings_section_viewed`, `cookie_consent_*`.

### Phase 2 — Telemetry Pipeline
- [ ] Run database migration for `ai_telemetry_log` table and `gift_sessions` columns.
- [ ] Create `supabase/functions/_shared/telemetry.ts` helper.
- [ ] Instrument `generate-gifts` Edge Function to log to `ai_telemetry_log`.
- [ ] Instrument `signal-check` Edge Function to log to `ai_telemetry_log`.
- [ ] Add cost estimation logic per provider/model.

### Phase 3 — Admin Telemetry Dashboard
- [ ] Create `/admin/telemetry` page or new section in `AdminGiftAnalytics`.
- [ ] Metric cards: total calls, success rate, avg latency, fallback rate, estimated cost.
- [ ] Charts: latency by provider, error rate, cost breakdown, calls by provider.
- [ ] Recent errors table.

### Phase 4 — Experimentation Framework
- [ ] Add `posthog-node` dependency for server-side evaluation.
- [ ] Create `src/lib/experiments.ts` with experiment registry.
- [ ] Create `src/hooks/useExperiment.ts` hook.
- [ ] Create `supabase/functions/_shared/experiments.ts` for server-side evaluation.
- [ ] Add `POSTHOG_API_KEY` to Edge Function secrets.
- [ ] Instrument first experiment: `gift-card-layout`.

### Phase 5 — Migration & Cleanup
- [ ] Migrate existing `trackEvent()` calls to use `useAnalytics().track()` incrementally.
- [ ] Standardise property schemas on existing events.
- [ ] Set up PostHog dashboards for core funnels.
- [ ] Configure PostHog alerts for AI error rate > 5%.
- [ ] Document event taxonomy in `docs/prd/DesignSystem/` or a new analytics guide.

---

## 12. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should we add PostHog session replay for debugging user journeys? Adds ~15KB bundle. | Engineering | Open |
| Q2 | Should experiment overrides in `platform_settings` take priority over PostHog? | Product | Open — recommend yes for kill-switch capability |
| Q3 | Should we track AI token costs per-user for future usage-based pricing? | Product | Open |
| Q4 | What is the PostHog plan limit on events/month? Need to ensure instrumentation stays within budget. | Engineering | Open |
| Q5 | Should email tracking pixels for occasion reminders be opt-in or default-on? | Legal/Product | Open |
| Q6 | Do we need a separate `analytics_events` Supabase table as a PostHog fallback for critical events? | Engineering | Open — recommend no, adds complexity |
