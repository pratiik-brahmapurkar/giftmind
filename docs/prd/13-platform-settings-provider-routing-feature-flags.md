# PRD 13 — Platform Settings, Provider Routing & Feature Flags

**Document status:** Draft  
**Author:** Product  
**Last updated:** 2026-04-30  
**Related PRDs:** 08 (Credits & Wallet), 09 (Plans & Limits), 10 (Admin Dashboard & RBAC), 12 (Analytics & Telemetry)

---

## 1. Overview

GiftMind has three interconnected runtime control systems:

1. **Platform Settings** — a `platform_settings` key/value table edited via `AdminSettings.tsx`, used to control everything from site name to AI model selection.
2. **AI Provider Routing** — `_shared/ai-providers.ts` defines the provider chain (Anthropic Claude, Google Gemini, Groq Llama) and `getProviderChain()` maps plan × operation → ordered fallback list.
3. **Feature Flags** — a subset of `platform_settings` with `feature_` prefix, toggled from the admin Feature Flags tab. They control which product capabilities are live.

These three systems are functional but have grown organically and have several gaps:

- Provider routing is **hardcoded in TypeScript** — changing the chain requires a code deploy.
- Feature flags are stored in `platform_settings` but **not read by Edge Functions** at runtime; flags only affect the frontend.
- `platform_settings` has no **schema validation** — any key/value can be written, making debugging hard.
- There is no **change history** for settings — a misconfigured value is undetectable without querying the DB.
- The `usePlatformSettings` hook re-fetches every time `AdminSettings` mounts; there is no **global settings cache** accessible to non-admin app code.

This PRD defines the target state for a cohesive, runtime-configurable control plane.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Make AI provider routing dynamically configurable from `AdminSettings` without a code deploy. |
| G2 | Extend feature flag evaluation to Edge Functions (server-side flag reads at request time). |
| G3 | Define a canonical settings schema with typed keys, validation rules, and descriptions. |
| G4 | Expose a lightweight `useAppSettings` hook for non-admin frontend code. |
| G5 | Record every settings change in `admin_audit_log`. |
| G6 | Add a `settings_history` table for rollback capability. |

### Non-goals

- Building a full remote config SDK (PostHog feature flags handle experimentation — see PRD 12).
- Per-user settings overrides (settings are global platform state).
- Real-time WebSocket push for settings changes.

---

## 3. Current State

### 3.1 `platform_settings` Table

```sql
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);
```

**Current keys (43 total):** site_name, site_tagline, support_email, default_currency, default_language, free_credits, free_credit_validity_days, gift_session_cost, referral_bonus_referred, referral_bonus_referrer, referral_credit_validity_days, max_referrals_per_user, maintenance_mode, signup_enabled, google_oauth_enabled, blog_enabled, ai_model_free, ai_model_pro, ai_model_signal, signal_check_cost, max_gift_sessions_per_hour, signal_checks_per_day, product_clicks_per_hour, referrals_per_hour, blog_ai_generations_per_day, posthog_enabled, cookie_consent_required, feature_signup_enabled, feature_google_oauth, feature_blog_enabled, feature_signal_check, feature_cross_border_gifting, feature_occasion_reminders, feature_credit_expiry_warnings, feature_posthog_enabled, feature_cookie_consent_required, allowed_origins, email_from_name, email_from_email, email_reply_to, email_subject_*, maintenance_last_*

**RLS:** Superadmin-only write; no public read.

### 3.2 AI Provider Routing (`_shared/ai-providers.ts`)

**Providers supported:** `claude-sonnet`, `claude-haiku`, `gemini-flash`, `gemini-pro`, `groq-llama`

**`getProviderChain(plan, operation)` — hardcoded logic:**

```ts
const freeTierChain = ['groq-llama', 'gemini-flash', 'claude-haiku'];

// signal-check
if (plan === 'pro') return ['claude-sonnet', 'claude-haiku', 'gemini-flash'];
return freeTierChain;

// gift-generation
switch (plan) {
  case 'pro': return ['claude-sonnet', 'claude-haiku', 'gemini-pro'];
  default:    return freeTierChain;
}
```

**Fallback mechanism:** `callAIWithFallback(chain, params)` iterates the chain sequentially, catching `AIProviderError` and moving to the next provider.

### 3.3 Feature Flags

**Current flags in `platform_settings`:**

| Key | Type | Default | Enforced where |
|-----|------|---------|----------------|
| `feature_signup_enabled` | boolean | true | Frontend `Signup.tsx` |
| `feature_google_oauth` | boolean | true | Frontend `Login.tsx` |
| `feature_blog_enabled` | boolean | true | Frontend routing |
| `feature_signal_check` | boolean | true | Frontend `SignalCheck.tsx` |
| `feature_cross_border_gifting` | boolean | true | Frontend `GiftFlow.tsx` |
| `feature_occasion_reminders` | boolean | true | Edge Function `send-occasion-reminders` |
| `feature_credit_expiry_warnings` | boolean | true | Edge Function `send-expiry-warnings` |
| `feature_posthog_enabled` | boolean | true | Frontend `posthog.ts` |
| `feature_cookie_consent_required` | boolean | true | Frontend cookie banner |
| `maintenance_mode` | boolean | false | Frontend maintenance wall |

**Gap:** `feature_signal_check`, `feature_cross_border_gifting` are only checked in the frontend. The Edge Functions do not read them — a user who bypasses the UI can still call `signal-check` even when the flag is off.

### 3.4 `usePlatformSettings` Hook

```ts
// src/hooks/usePlatformSettings.ts
export function usePlatformSettings(enabled: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => { /* fetch all rows */ },
    enabled,
    staleTime: 30_000,
  });
  // returns { settings, updateSetting, updateMultipleSettings, ... }
}
```

**Gap:** Only available after admin role check (`enabled` param). Non-admin app code (e.g., checking if `feature_signal_check` is on) cannot use this hook safely.

---

## 4. Settings Schema — Canonical Definition

### 4.1 Schema Categories

Each setting belongs to a category. The schema defines type, default, validation, and admin visibility:

| Category | Keys |
|----------|------|
| `general` | site_name, site_tagline, support_email, default_currency, default_language |
| `ai` | ai_model_free, ai_model_pro, ai_model_signal, provider_chain_spark_gifts, provider_chain_pro_gifts, provider_chain_signal, provider_chain_relationship, gift_session_cost, signal_check_cost |
| `credits` | free_credits, free_credit_validity_days, referral_bonus_referred, referral_bonus_referrer, referral_credit_validity_days, max_referrals_per_user |
| `email` | email_from_name, email_from_email, email_reply_to, email_subject_* |
| `flags` | feature_signup_enabled, feature_google_oauth, feature_blog_enabled, feature_signal_check, feature_cross_border_gifting, feature_occasion_reminders, feature_credit_expiry_warnings, feature_posthog_enabled, feature_cookie_consent_required, maintenance_mode |
| `security` | allowed_origins, max_gift_sessions_per_hour, signal_checks_per_day, product_clicks_per_hour, referrals_per_hour, blog_ai_generations_per_day |
| `analytics` | posthog_server_api_key, telemetry_enabled, telemetry_retention_days |

### 4.2 New Settings for Provider Routing

These new keys make the provider chains runtime-configurable:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider_chain_spark_gifts` | string[] | `["groq-llama","gemini-flash","claude-haiku"]` | Provider fallback chain for Spark plan gift generation |
| `provider_chain_pro_gifts` | string[] | `["claude-sonnet","claude-haiku","gemini-pro"]` | Provider chain for Pro plan gift generation |
| `provider_chain_signal_free` | string[] | `["groq-llama","gemini-flash","claude-haiku"]` | Provider chain for Signal Check on Spark |
| `provider_chain_signal_pro` | string[] | `["claude-sonnet","claude-haiku","gemini-flash"]` | Provider chain for Signal Check on Pro |
| `provider_chain_relationship` | string[] | `["groq-llama","gemini-flash","claude-haiku"]` | Provider chain for relationship insight generation |
| `ai_timeout_ms_primary` | number | `45000` | Timeout for primary provider (ms) |
| `ai_timeout_ms_fallback` | number | `30000` | Timeout for fallback providers (ms) |
| `ai_max_attempts` | number | `3` | Max providers to try before failing |

### 4.3 Settings Schema Type (TypeScript)

```ts
// src/lib/settings-schema.ts
export type SettingType = 'string' | 'number' | 'boolean' | 'string[]' | 'provider_chain';

export interface SettingDef {
  key: string;
  type: SettingType;
  category: 'general' | 'ai' | 'credits' | 'email' | 'flags' | 'security' | 'analytics';
  default: unknown;
  description: string;
  adminOnly: boolean;          // if false, readable by non-admin frontend code
  superadminOnly: boolean;     // if true, write requires superadmin
  validate?: (value: unknown) => boolean;
}

export const SETTINGS_SCHEMA: SettingDef[] = [
  {
    key: 'feature_signal_check',
    type: 'boolean',
    category: 'flags',
    default: true,
    description: 'Enable Signal Check feature for all users',
    adminOnly: false,
    superadminOnly: true,
  },
  {
    key: 'provider_chain_spark_gifts',
    type: 'provider_chain',
    category: 'ai',
    default: ['groq-llama', 'gemini-flash', 'claude-haiku'],
    description: 'AI provider fallback chain for Spark plan gift generation',
    adminOnly: true,
    superadminOnly: true,
    validate: (v) => Array.isArray(v) && v.length > 0 && v.length <= 5,
  },
  // ... all 43+ settings
];
```

---

## 5. Dynamic Provider Routing

### 5.1 Updated `getProviderChain` — DB-Driven

`getProviderChain` is updated to accept settings from the DB, falling back to hardcoded defaults if the DB key is absent or invalid:

```ts
// supabase/functions/_shared/ai-providers.ts

const VALID_PROVIDERS: Provider[] = [
  'claude-sonnet', 'claude-haiku', 'gemini-flash', 'gemini-pro', 'groq-llama',
];

function parseProviderChain(raw: unknown, fallback: Provider[]): Provider[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const valid = raw.filter((p): p is Provider => VALID_PROVIDERS.includes(p as Provider));
  return valid.length > 0 ? valid.slice(0, 5) : fallback;
}

export function getProviderChain(
  plan: string,
  operation: 'gift-generation' | 'signal-check' | 'relationship-insight',
  settings?: Record<string, unknown>,
): Provider[] {
  const freeTierDefault: Provider[] = ['groq-llama', 'gemini-flash', 'claude-haiku'];
  const proGiftsDefault: Provider[] = ['claude-sonnet', 'claude-haiku', 'gemini-pro'];
  const proSignalDefault: Provider[] = ['claude-sonnet', 'claude-haiku', 'gemini-flash'];

  if (operation === 'relationship-insight') {
    return parseProviderChain(settings?.provider_chain_relationship, freeTierDefault);
  }

  if (operation === 'signal-check') {
    if (plan === 'pro') {
      return parseProviderChain(settings?.provider_chain_signal_pro, proSignalDefault);
    }
    return parseProviderChain(settings?.provider_chain_signal_free, freeTierDefault);
  }

  // gift-generation
  if (plan === 'pro') {
    return parseProviderChain(settings?.provider_chain_pro_gifts, proGiftsDefault);
  }
  return parseProviderChain(settings?.provider_chain_spark_gifts, freeTierDefault);
}
```

### 5.2 Settings Loader in Edge Functions

A shared helper loads all relevant settings once per request:

```ts
// supabase/functions/_shared/settings.ts
import { SupabaseClient } from '@supabase/supabase-js';

export type RuntimeSettings = Record<string, unknown>;

let cachedSettings: RuntimeSettings | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1-minute in-memory cache

export async function loadSettings(client: SupabaseClient): Promise<RuntimeSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiry) return cachedSettings;

  const { data, error } = await client
    .from('platform_settings')
    .select('key, value');

  if (error || !data) return {};

  const settings: RuntimeSettings = {};
  for (const row of data) {
    settings[row.key] = row.value;
  }

  cachedSettings = settings;
  cacheExpiry = now + CACHE_TTL_MS;
  return settings;
}

export function getFlag(settings: RuntimeSettings, key: string, fallback = true): boolean {
  const val = settings[key];
  if (typeof val === 'boolean') return val;
  return fallback;
}

export function getNumber(settings: RuntimeSettings, key: string, fallback: number): number {
  const val = settings[key];
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return fallback;
}
```

### 5.3 Edge Function Integration Pattern

Every Edge Function that needs settings calls `loadSettings()` at the start of the request:

```ts
// In generate-gifts/index.ts
import { loadSettings, getFlag, getNumber } from '../_shared/settings.ts';
import { getProviderChain } from '../_shared/ai-providers.ts';

const settings = await loadSettings(serviceClient);

// Feature flag check
if (!getFlag(settings, 'feature_signal_check')) {
  return json({ error: 'Feature not available' }, 503);
}

// Dynamic provider routing
const chain = getProviderChain(plan, 'gift-generation', settings);

// Dynamic rate limit
const maxPerHour = getNumber(settings, 'max_gift_sessions_per_hour', 10);
```

### 5.4 Admin UI — Provider Chain Editor

New UI in the `AI Configuration` tab of `AdminSettings`:

- **Chain editor per operation**: Four groups (Spark Gifts, Pro Gifts, Signal Free, Signal Pro).
- Each group shows an ordered drag-and-drop list of provider pills.
- Providers not in the chain are shown in a "Available" pool.
- Validation: minimum 1, maximum 5 providers per chain.
- Save button writes to `platform_settings` as a JSON array.
- Preview shows estimated cost tier for the chain.

---

## 6. Feature Flags — Server-Side Enforcement

### 6.1 Enforcement Matrix

| Flag | Frontend | Edge Function | Priority |
|------|----------|---------------|----------|
| `feature_signup_enabled` | ✅ `Signup.tsx` | `complete-onboarding` | P1 |
| `feature_google_oauth` | ✅ `Login.tsx` | — | P2 |
| `feature_blog_enabled` | ✅ routing | `generate-blog-draft`, `generate-rss` | P2 |
| `feature_signal_check` | ✅ `SignalCheck.tsx` | `signal-check` ❌ **gap** | P1 |
| `feature_cross_border_gifting` | ✅ `GiftFlow.tsx` | `generate-gifts` ❌ **gap** | P1 |
| `feature_occasion_reminders` | — | `send-occasion-reminders` ✅ | P1 |
| `feature_credit_expiry_warnings` | — | `send-expiry-warnings` ✅ | P1 |
| `maintenance_mode` | ✅ maintenance wall | All Edge Functions ❌ **gap** | P0 |

### 6.2 `maintenance_mode` — Global Kill Switch

When `maintenance_mode` is `true`, **all** Edge Functions should return 503:

```ts
// In every Edge Function, after loadSettings():
if (getFlag(settings, 'maintenance_mode', false)) {
  return json({
    error: 'GiftMind is under maintenance. Please try again shortly.',
    maintenance: true,
  }, 503);
}
```

### 6.3 Frontend — `useAppSettings` Hook

A lightweight, non-admin hook for reading public settings and flags:

```ts
// src/hooks/useAppSettings.ts
const PUBLIC_SETTING_KEYS = [
  'feature_signup_enabled',
  'feature_google_oauth',
  'feature_blog_enabled',
  'feature_signal_check',
  'feature_cross_border_gifting',
  'feature_posthog_enabled',
  'feature_cookie_consent_required',
  'maintenance_mode',
  'site_name',
  'site_tagline',
  'free_credits',
];

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings-public'],
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', PUBLIC_SETTING_KEYS);
      const out: Record<string, unknown> = {};
      for (const row of data || []) out[row.key] = row.value;
      return out;
    },
    staleTime: 5 * 60 * 1000,   // 5-minute client cache
    gcTime: 10 * 60 * 1000,
  });
}

export function useFlag(key: string, fallback = true): boolean {
  const { data } = useAppSettings();
  const val = data?.[key];
  if (typeof val === 'boolean') return val;
  return fallback;
}
```

**RLS change required:** The `PUBLIC_SETTING_KEYS` subset must be readable by all authenticated users (not just superadmins):

```sql
DROP POLICY IF EXISTS "superadmin_only" ON public.platform_settings;

-- Superadmins can do everything
CREATE POLICY "superadmin_full_access" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- All authenticated users can read public settings
CREATE POLICY "authenticated_read_public_settings" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key = ANY(ARRAY[
    'feature_signup_enabled', 'feature_google_oauth', 'feature_blog_enabled',
    'feature_signal_check', 'feature_cross_border_gifting', 'feature_posthog_enabled',
    'feature_cookie_consent_required', 'maintenance_mode', 'site_name',
    'site_tagline', 'free_credits'
  ]));

-- Anonymous users can read maintenance_mode only (for pre-auth maintenance wall)
CREATE POLICY "anon_read_maintenance" ON public.platform_settings
  FOR SELECT TO anon
  USING (key = 'maintenance_mode');
```

---

## 7. Settings History & Audit Trail

### 7.1 `settings_history` Table

```sql
CREATE TABLE IF NOT EXISTS public.settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX idx_settings_history_key ON public.settings_history(key, changed_at DESC);
CREATE INDEX idx_settings_history_user ON public.settings_history(changed_by, changed_at DESC);

ALTER TABLE public.settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_history_admin_read ON public.settings_history
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY settings_history_service_insert ON public.settings_history
  FOR INSERT TO service_role WITH CHECK (true);
```

### 7.2 Trigger — Auto-Record on Update

```sql
CREATE OR REPLACE FUNCTION public.record_settings_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.settings_history (key, old_value, new_value, changed_by)
  VALUES (NEW.key, OLD.value, NEW.value, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_history_trigger ON public.platform_settings;
CREATE TRIGGER settings_history_trigger
  AFTER UPDATE ON public.platform_settings
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.VALUE)
  EXECUTE FUNCTION public.record_settings_history();
```

### 7.3 Settings History UI

In `AdminSettings` — a collapsible "Change History" panel per setting group showing the last 10 changes with actor, timestamp, old/new value diff.

Accessible via the "Security" tab → "Settings Change Log" section.

---

## 8. Database Migration

### Migration: `20260430150000_platform_settings_v2.sql`

```sql
-- 1. New provider chain settings
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('provider_chain_spark_gifts',   '["groq-llama","gemini-flash","claude-haiku"]',  'Provider fallback chain for Spark plan gift generation'),
  ('provider_chain_pro_gifts',     '["claude-sonnet","claude-haiku","gemini-pro"]',  'Provider fallback chain for Pro plan gift generation'),
  ('provider_chain_signal_free',   '["groq-llama","gemini-flash","claude-haiku"]',   'Provider chain for Signal Check (Spark plan)'),
  ('provider_chain_signal_pro',    '["claude-sonnet","claude-haiku","gemini-flash"]','Provider chain for Signal Check (Pro plan)'),
  ('provider_chain_relationship',  '["groq-llama","gemini-flash","claude-haiku"]',   'Provider chain for relationship insight generation'),
  ('ai_timeout_ms_primary',        '45000',  'Timeout for primary AI provider (ms)'),
  ('ai_timeout_ms_fallback',       '30000',  'Timeout for fallback AI providers (ms)'),
  ('ai_max_attempts',              '3',      'Max AI providers to try before failing')
ON CONFLICT (key) DO NOTHING;

-- 2. Settings history table
CREATE TABLE IF NOT EXISTS public.settings_history ( ... );

-- 3. Settings history trigger
CREATE OR REPLACE FUNCTION public.record_settings_history() ...;
CREATE TRIGGER settings_history_trigger ...;

-- 4. RLS policy split (superadmin write, authenticated read public subset, anon read maintenance)
DROP POLICY IF EXISTS "superadmin_only" ON public.platform_settings;
CREATE POLICY "superadmin_full_access" ...;
CREATE POLICY "authenticated_read_public_settings" ...;
CREATE POLICY "anon_read_maintenance" ...;
```

---

## 9. Admin Settings UI — Updates

### 9.1 AI Configuration Tab Additions

New section: **Provider Routing** (below existing model selection fields):

- Four chain editors: Spark Gifts, Pro Gifts, Signal (Spark), Signal (Pro).
- Each editor: ordered pill list of providers, drag-to-reorder, add/remove from available pool.
- Estimated cost badge per chain (based on first provider's tier).
- "Reset to defaults" button per chain.
- Save writes to `platform_settings` — no deploy needed.

### 9.2 Feature Flags Tab — Metadata

Each flag row now shows:
- **Enforced in**: badges listing `Frontend` / `Edge Function`.
- **P0/P1/P2** priority badge.
- Last changed timestamp and actor (from `settings_history`).

### 9.3 Settings Change History Panel

New collapsible section in the Security tab: **Settings Change Log**. Shows last 50 changes across all settings with filter by key and actor.

---

## 10. Implementation Checklist

### Phase 1 — Schema & Migration
- [ ] Write and run `20260430150000_platform_settings_v2.sql`.
- [ ] Add 8 new provider chain keys to `platform_settings`.
- [ ] Create `settings_history` table + trigger.
- [ ] Update RLS: split superadmin-only into tiered read policies.

### Phase 2 — Edge Function Settings Loader
- [ ] Create `supabase/functions/_shared/settings.ts` with `loadSettings()`, `getFlag()`, `getNumber()`.
- [ ] Update `generate-gifts`: load settings, dynamic `getProviderChain()`, `maintenance_mode` check, `feature_cross_border_gifting` check.
- [ ] Update `signal-check`: load settings, `feature_signal_check` check, `maintenance_mode` check.
- [ ] Update `send-occasion-reminders`: `maintenance_mode` check.
- [ ] Update `send-expiry-warnings`: `maintenance_mode` check.
- [ ] Update `paypal-checkout`: `maintenance_mode` check.
- [ ] Update `process-referral`: `maintenance_mode` check.

### Phase 3 — Updated Provider Routing
- [ ] Update `getProviderChain()` in `ai-providers.ts` to accept `settings` param.
- [ ] Update `ai_timeout_ms_primary` / `ai_timeout_ms_fallback` usage in `fetchJson()`.
- [ ] Validate provider chain values — filter unknown providers, ensure min 1.

### Phase 4 — Frontend
- [ ] Create `src/hooks/useAppSettings.ts` with `useFlag()`.
- [ ] Replace direct `platform_settings` reads in non-admin pages with `useFlag()`.
- [ ] Update `posthog.ts` to check `feature_posthog_enabled` via `useFlag()`.
- [ ] Add maintenance wall to `App.tsx` using `useFlag('maintenance_mode')`.

### Phase 5 — Admin UI
- [ ] Add provider chain drag-and-drop editor to AI Configuration tab.
- [ ] Add "Enforced in" metadata to Feature Flags tab.
- [ ] Add Settings Change Log section to Security tab.

### Phase 6 — Deploy & Verify
- [ ] Deploy Edge Functions with new `settings.ts` dependency.
- [ ] Verify `maintenance_mode: true` blocks all Edge Function responses with 503.
- [ ] Verify provider chain change in admin UI flows through to next gift generation.
- [ ] Verify `settings_history` records changes when superadmin saves settings.

---

## 11. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should `useAppSettings` be available to unauthenticated users (pre-login maintenance wall)? | Engineering | Open — anon RLS on `maintenance_mode` only, recommend yes |
| Q2 | Should the provider chain editor expose `gemini-pro` in the UI? (Not yet in production) | Product | Open |
| Q3 | Should settings changes trigger a webhook or Slack notification? | Product | Open — low priority |
| Q4 | What is the right in-memory cache TTL for Edge Function settings? 60s is safe but means up to 60s lag when toggling a flag. | Engineering | Open — recommend 30s for flags, 5min for non-flag settings |
| Q5 | Should `settings_history` rollback be exposed in the UI (one-click revert to previous value)? | Product | Open |

---

## 12. Appendix — Current vs. Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Provider routing | Hardcoded TypeScript | DB-driven, admin-editable without deploy |
| Feature flags in Edge Functions | Only 2 of 10 flags enforced server-side | All 10 flags enforced in relevant Edge Functions |
| `platform_settings` read access | Superadmin only | Tiered: anon (maintenance_mode), authenticated (public flags), superadmin (all) |
| Settings change tracking | None | `settings_history` table + trigger |
| Public flag access in frontend | Via `usePlatformSettings` (admin-only hook) | Via `useAppSettings` / `useFlag` (available everywhere) |
| AI timeout | Hardcoded `45_000ms` | DB-configurable per provider tier |
