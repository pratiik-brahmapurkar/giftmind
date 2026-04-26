# PRD 10 — Admin Dashboard & Role-Based Access Control

**Document status:** Draft  
**Author:** Product  
**Last updated:** 2026-04-26  
**Related PRDs:** 08 (Credits & Wallet), 09 (Plans, Limits, Paywalls)

---

## 1. Overview

GiftMind has a functional admin panel today — but it was built incrementally, and several gaps have accumulated:

- Role-gating is inconsistent: `AdminGuard` checks `users.role`, whereas the `user_roles` RBAC table is the authoritative source but is not used everywhere.
- The only enforced distinction is **admin vs. superadmin**; there is no concept of *scoped* admin roles (e.g., a content editor who can publish blog posts but cannot touch platform settings or user accounts).
- The admin sidebar shows all pages to all admin users, regardless of their actual permissions.
- `AdminSettings` — the most sensitive page — re-checks role independently instead of sharing a single authoritative gate.
- There is no audit log for admin actions taken (credit grants, role changes, settings edits, maintenance jobs).
- The `users.role` column and the `user_roles` table are both used interchangeably, creating a dual-source-of-truth problem.

This PRD defines the target state for the **Admin Dashboard** feature surface and the **Role-Based Access Control (RBAC)** system that governs it, along with the database changes, UI patterns, and access matrix required for a clean, scalable implementation.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Establish a single authoritative source of truth for admin roles — the `user_roles` table. |
| G2 | Define three scoped roles — `viewer`, `admin`, `superadmin` — with explicit permission mappings. |
| G3 | Enforce permissions at UI layer (sidebar items, action buttons) and DB/RLS layer. |
| G4 | Surface a dedicated **Admin Audit Log** that records all privileged actions. |
| G5 | Preserve the existing admin dashboard feature surface while fixing gating inconsistencies. |
| G6 | Allow a superadmin to promote/demote users from within the Admin Users page (already exists — requires hardening). |

### Non-goals (this PRD)

- Building a new Permissions Builder or custom role editor UI.
- Granular row-level permission overrides beyond the three defined roles.
- External SSO or OAuth for admin login (GiftMind uses Supabase Auth for all users).
- Notification / alerting system for admin events.

---

## 3. User Roles — Canonical Definition

### 3.1 Role Hierarchy

```
superadmin  ← can do everything
  └── admin  ← can manage users, content, credits (cannot change platform settings or promote to superadmin)
        └── viewer  ← read-only access to analytics and user list; no write actions
              └── (regular user — no admin access at all)
```

The `app_role` enum in the DB **must be extended** to add `viewer`:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
```

### 3.2 Role Definitions

| Role | Description | Who holds it |
|------|-------------|--------------|
| `superadmin` | Full platform control, including settings, role management, and maintenance jobs. | Founder / CTO only. Max 2 accounts. |
| `admin` | Day-to-day operations: user management, credit grants, blog management, marketplace config. Cannot touch platform settings or security limits. | Trusted internal staff. |
| `viewer` | Read-only: analytics, user list (no PII beyond name/email), session data. Cannot take any write actions. | Data analysts, investor observers, support observers. |
| `user` | Regular platform user. No admin access. | All end users. |

### 3.3 Source of Truth

The `user_roles` table is **the single source of truth** for admin privilege:

```
public.user_roles
  user_id   uuid  (FK → auth.users)
  role      app_role  ('superadmin' | 'admin' | 'viewer' | 'user')
  granted_by uuid  (FK → auth.users — who granted the role)
  granted_at timestamptz
```

The `users.role` column is a **denormalized cache** updated by a DB trigger whenever `user_roles` changes. It is used by RLS policies for performance but is **never written directly by the application**. The `useAdminCheck` hook must be migrated to read from `user_roles` (or rely on the trigger-maintained `users.role` cache post-hardening).

---

## 4. Permission Matrix

Each admin page/action is mapped to the minimum required role.

### 4.1 Navigation & Page Access

| Route | Page | Viewer | Admin | Superadmin |
|-------|------|--------|-------|------------|
| `/admin` | Overview | ✅ | ✅ | ✅ |
| `/admin/users` | Users List | ✅ (readonly) | ✅ | ✅ |
| `/admin/credits` | Credits & Revenue | ✅ | ✅ | ✅ |
| `/admin/gifts` | Gift Analytics | ✅ | ✅ | ✅ |
| `/admin/blog` | Blog Posts | ❌ | ✅ | ✅ |
| `/admin/blog/new` | Blog Editor | ❌ | ✅ | ✅ |
| `/admin/blog/edit/:id` | Blog Editor | ❌ | ✅ | ✅ |
| `/admin/blog/categories` | Blog Categories | ❌ | ✅ | ✅ |
| `/admin/media` | Media Library | ❌ | ✅ | ✅ |
| `/admin/blog/analytics` | Blog Analytics | ✅ | ✅ | ✅ |
| `/admin/marketplaces` | Marketplaces | ❌ | ✅ | ✅ |
| `/admin/settings` | Platform Settings | ❌ | ❌ | ✅ |
| `/admin/audit-log` | Audit Log *(new)* | ✅ | ✅ | ✅ |

### 4.2 Action-Level Permissions

| Action | Viewer | Admin | Superadmin |
|--------|--------|-------|------------|
| View user list | ✅ | ✅ | ✅ |
| View user details (sheet) | ✅ | ✅ | ✅ |
| Grant credits to user | ❌ | ✅ | ✅ |
| Disable / re-enable user account | ❌ | ✅ | ✅ |
| Change user role to `viewer`/`admin` | ❌ | ❌ | ✅ |
| Change user role to `superadmin` | ❌ | ❌ | ✅ |
| Export user CSV | ❌ | ✅ | ✅ |
| Create / edit / publish blog post | ❌ | ✅ | ✅ |
| Delete blog post | ❌ | ❌ | ✅ |
| Configure marketplace | ❌ | ✅ | ✅ |
| Edit platform settings | ❌ | ❌ | ✅ |
| Run maintenance jobs | ❌ | ❌ | ✅ |
| View audit log | ✅ | ✅ | ✅ |

---

## 5. Current Admin Dashboard — Surface Inventory

The following pages and components already exist and must be preserved (and where necessary, hardened):

### 5.1 Overview (`/admin`)
**Component:** `AdminOverview.tsx`

Displays live metrics cards:
- Total Users, Active Users (7d), Gift Sessions, Revenue This Month, Credits in Circulation, Store Clicks (30d)

Charts:
- Daily Active Users (30 days) — Line chart
- Conversion Funnel (Signup → Onboarding → First Gift → Purchase) — Horizontal bar chart
- Top Occasions — Donut chart
- Store Clicks by Store — Bar chart
- Revenue by Package — Table
- Recent Activity stream (signups, sessions, purchases, clicks)

**Hardening required:** None beyond RBAC gating. Data is already read-only.

### 5.2 Users (`/admin/users`)
**Component:** `AdminUsers.tsx`

Features:
- Paginated table (25/page) of all users with name, role badge, credits, sessions, referrals, signup date, last active.
- Search by name or ID.
- Filter by role.
- Sort by name, credits, signup date, last active.
- Row actions: View Details, Grant Credits, Change Role, Disable Account.
- Export CSV.

Sub-components:
- `UserDetailSheet.tsx` — slide-over panel with full user profile, credit history.
- `GrantCreditsModal.tsx` — superadmin/admin action to issue credits.
- `ChangeRoleDialog.tsx` — superadmin-only; changes role via `user_roles` table.
- `DisableAccountDialog.tsx` — admin+ action to disable account.

**Hardening required:**
- Action buttons (Grant Credits, Change Role, Disable) must check caller's role and hide/disable the action for viewers and insufficient roles.
- `ChangeRoleDialog` must prevent an admin from promoting to `superadmin`.

### 5.3 Credits & Revenue (`/admin/credits`)
**Component:** `AdminCredits.tsx`

Tabs:
- **Revenue** (`RevenueTab`) — monthly revenue, paid purchases, currency breakdown.
- **Packages** (`PackagesTab`) — credit package editor (superadmin only; admins read-only).
- **Transactions** (`TransactionsTab`) — paginated credit transaction log.

### 5.4 Gift Analytics (`/admin/gifts`)
**Component:** `AdminGiftAnalytics.tsx`

Features:
- Stat cards: Total Sessions, This Month, Avg Confidence, Completion Rate, Avg Duration, Feedback Rate.
- AI Provider Usage table (provider, sessions, fallback rate, avg latency).
- Charts: Avg Confidence Score (weekly, 12 weeks), Occasions Distribution, Top Gift Categories, Relationship Types, Budget Distribution, Feedback Summary, Clicks by Store, Estimated Affiliate Revenue.
- Top Clicked Products table.
- Session Log with search, sort, pagination, expandable rows (AI response, chosen gift).

### 5.5 Blog Management (`/admin/blog`, `/admin/blog/new`, etc.)
**Components:** `AdminBlogPosts.tsx`, `AdminBlogEditor.tsx`, `AdminBlogCategories.tsx`, `AdminMediaLibrary.tsx`, `AdminBlogAnalytics.tsx`

Full CMS for managing blog content. Requires `admin` or `superadmin`.

### 5.6 Marketplaces (`/admin/marketplaces`)
**Component:** `AdminMarketplaces.tsx`

Manages affiliate stores/marketplace config. Requires `admin` or `superadmin`.

### 5.7 Platform Settings (`/admin/settings`)
**Component:** `AdminSettings.tsx`

7-tab settings panel:
- General (site name, support email, currency, language)
- AI Configuration (model selection, costs)
- Credits & Plans (signup credits, referral bonuses, package editor)
- Email (sender settings, subject templates, test emails)
- Feature Flags (toggles for signup, OAuth, blog, signal check, etc.)
- Security (CORS origins, rate limits, secret status, role audit)
- Maintenance (DB stats, scheduled job runners, purge tools)

**Hardening required:** Currently checks role inside the component. Must be gated at route level and rely on the shared authoritative role check.

---

## 6. New Feature: Admin Audit Log (`/admin/audit-log`)

### 6.1 Purpose

Provide a tamper-evident, chronological record of all privileged actions taken by admin users. Essential for compliance, debugging, and accountability.

### 6.2 Database Schema

```sql
CREATE TABLE public.admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid NOT NULL REFERENCES auth.users(id),
  actor_email   text NOT NULL,
  actor_role    text NOT NULL,
  action        text NOT NULL,  -- e.g. 'grant_credits', 'change_role', 'disable_account'
  target_type   text,           -- e.g. 'user', 'platform_setting', 'credit_package'
  target_id     text,           -- UUID or key
  target_label  text,           -- human-readable: user email, setting key, etc.
  payload       jsonb,          -- before/after state or action parameters
  ip_address    inet,           -- populated server-side if available
  user_agent    text
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- All admin roles can view
CREATE POLICY "Admins can view audit log"
ON public.admin_audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role) OR
       has_role(auth.uid(), 'admin'::app_role) OR
       has_role(auth.uid(), 'superadmin'::app_role));

-- Only service_role inserts (via Edge Function or DB trigger — not the client)
CREATE POLICY "Service role inserts audit log"
ON public.admin_audit_log FOR INSERT TO service_role WITH CHECK (true);
```

### 6.3 Tracked Events

| Action | Trigger |
|--------|---------|
| `grant_credits` | Admin grants credits to a user |
| `change_role` | Superadmin changes a user's role |
| `disable_account` | Admin disables a user account |
| `enable_account` | Admin re-enables a user account |
| `update_setting` | Superadmin saves platform settings |
| `toggle_feature_flag` | Superadmin toggles a feature flag |
| `run_maintenance_job` | Superadmin runs a maintenance job |
| `delete_blog_post` | Admin/superadmin deletes a blog post |
| `update_credit_package` | Superadmin edits a credit package |
| `update_marketplace` | Admin edits marketplace config |
| `export_users_csv` | Admin exports user CSV |

### 6.4 Audit Log UI

**Route:** `/admin/audit-log`

**Layout:**
- Filter bar: date range picker, actor filter (dropdown of admin users), action type filter.
- Paginated table (50/page):
  - Timestamp (relative + absolute on hover)
  - Actor (name + role badge)
  - Action (human-readable label)
  - Target (linked where possible — e.g., click user name to open User Detail Sheet)
  - Details (collapsible JSON payload showing before/after or parameters)
- No delete or edit capability. Audit log is append-only.

---

## 7. RBAC — Technical Implementation

### 7.1 Authoritative Role Resolution

**Step 1: DB Trigger maintains `users.role` cache**

Whenever `user_roles` is inserted/updated/deleted, a trigger fires that updates `users.role`:

```sql
CREATE OR REPLACE FUNCTION public.sync_users_role_from_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.users SET role = 'user' WHERE id = OLD.user_id;
    RETURN OLD;
  ELSE
    UPDATE public.users SET role = NEW.role WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_to_users ON public.user_roles;
CREATE TRIGGER sync_role_to_users
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_users_role_from_user_roles();
```

**Step 2: `has_role()` function**

Already deployed. Used in all RLS policies:

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
```

**Step 3: `get_my_role()` helper (new)**

Allows the frontend to fetch the current user's role in a single RPC call, avoiding an extra table query:

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
```

### 7.2 Frontend Role Context

**New hook: `useMyAdminRole`**

Replaces `useAdminCheck` across the admin section. Returns the caller's role with loading state, and caches it in React Query:

```ts
// src/hooks/useMyAdminRole.ts
export type AdminRole = 'superadmin' | 'admin' | 'viewer' | null;

export function useMyAdminRole(): { role: AdminRole; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['my-admin-role', user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_my_role');
      return (data as AdminRole) ?? null;
    },
    enabled: !!user && !authLoading,
    staleTime: 60_000,
  });
  return { role: data ?? null, loading: isLoading || authLoading };
}
```

**New hook: `useCanDo`**

Centralised capability check used by UI components:

```ts
// src/hooks/useCanDo.ts
const PERMISSIONS: Record<string, AdminRole[]> = {
  'admin.access':        ['viewer', 'admin', 'superadmin'],
  'users.grant_credits': ['admin', 'superadmin'],
  'users.change_role':   ['superadmin'],
  'users.disable':       ['admin', 'superadmin'],
  'users.export_csv':    ['admin', 'superadmin'],
  'blog.write':          ['admin', 'superadmin'],
  'blog.delete':         ['superadmin'],
  'marketplaces.write':  ['admin', 'superadmin'],
  'settings.write':      ['superadmin'],
  'maintenance.run':     ['superadmin'],
  'packages.write':      ['superadmin'],
  'audit_log.view':      ['viewer', 'admin', 'superadmin'],
};

export function useCanDo(permission: string): boolean {
  const { role } = useMyAdminRole();
  if (!role) return false;
  return PERMISSIONS[permission]?.includes(role) ?? false;
}
```

### 7.3 Route-Level Guard

`AdminGuard` is updated to use `useMyAdminRole` and accept an optional `requiredRole` prop:

```tsx
// src/components/admin/AdminGuard.tsx
interface AdminGuardProps {
  children: React.ReactNode;
  requiredRole?: AdminRole;  // default: 'viewer' (any admin)
}

const AdminGuard = ({ children, requiredRole = 'viewer' }: AdminGuardProps) => {
  const { role, loading } = useMyAdminRole();
  // ...
  const hasAccess = role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];
  if (!hasAccess) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
```

Route declarations in `App.tsx` pass the required role:

```tsx
// /admin/settings — superadmin only
<AdminGuard requiredRole="superadmin"><AdminSettings /></AdminGuard>

// /admin/blog — admin only
<AdminGuard requiredRole="admin"><AdminBlogPosts /></AdminGuard>

// /admin — any admin
<AdminGuard><AdminOverview /></AdminGuard>
```

### 7.4 Sidebar — Dynamic Navigation

`AdminLayout` receives the caller's role and renders only the sidebar items they have access to:

```tsx
// AdminLayout filters navSections based on role
const visibleSections = navSections
  .map(section => ({
    ...section,
    items: section.items.filter(item => canAccess(role, item.requiredRole)),
  }))
  .filter(section => section.items.length > 0);
```

Each nav item gains a `requiredRole` field in its config object.

### 7.5 Action-Level Guards in UI

Action buttons in `AdminUsers.tsx`:
- **Grant Credits** — hidden/disabled if `!canDo('users.grant_credits')`.
- **Change Role** — hidden/disabled if `!canDo('users.change_role')`.
- **Disable Account** — hidden/disabled if `!canDo('users.disable')`.
- **Export CSV** — hidden/disabled if `!canDo('users.export_csv')`.

`ChangeRoleDialog.tsx`:
- When the caller is not a superadmin, an error is shown if they somehow reach the dialog.
- The role selector hides `superadmin` option if caller is not a superadmin.

`AdminSettings.tsx` tabs:
- **Packages** tab — read-only for `admin`; save buttons hidden.
- The entire page redirects to `/dashboard` for non-superadmins (enforced at route level).

### 7.6 RLS Hardening

All sensitive write-path tables need RLS policies that reference `user_roles`:

**`platform_settings`** — existing policy uses `users.role = 'superadmin'`; migrate to `has_role(auth.uid(), 'superadmin'::app_role)`.

**`credit_packages`** — write requires `superadmin`.

**`marketplace_config`** — write requires `admin` or `superadmin`.

**`blog_posts`** — write requires `admin` or `superadmin`; delete requires `superadmin`.

**`admin_audit_log`** — read requires any admin role; insert via service_role only.

**`user_roles`** — existing policies maintained; `viewer` role added.

---

## 8. Role Management — Operational Flows

### 8.1 Granting Admin Access (First Time)

Only a superadmin can grant admin access. **Never through the app UI for the very first superadmin** — this must be done via direct SQL:

```sql
INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
VALUES ('<target-user-uuid>', 'superadmin', '<your-own-uuid>', now());
```

Subsequent grants can be done through the Admin Users UI → Change Role.

### 8.2 Revoking Admin Access

Superadmin opens the target user in Admin Users → Change Role → selects `user` → confirms. This deletes the `user_roles` row and triggers the cache sync.

### 8.3 Preventing Lock-Out

The system enforces: **a superadmin cannot demote themselves** if they are the only remaining superadmin.

DB-level constraint (trigger):

```sql
CREATE OR REPLACE FUNCTION public.prevent_last_superadmin_demotion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'superadmin' AND (NEW.role != 'superadmin' OR TG_OP = 'DELETE') THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'superadmin' AND user_id != OLD.user_id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last superadmin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

---

## 9. Database Migration Plan

### Migration `20260426100000_admin_rbac_hardening.sql`

```sql
-- 1. Add 'viewer' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Add granted_by / granted_at columns to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now();

-- 3. Create admin_audit_log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log ( ... );

-- 4. Add get_my_role() RPC
CREATE OR REPLACE FUNCTION public.get_my_role() ...;

-- 5. Add sync_users_role_from_user_roles trigger
CREATE OR REPLACE FUNCTION public.sync_users_role_from_user_roles() ...;
DROP TRIGGER IF EXISTS sync_role_to_users ON public.user_roles;
CREATE TRIGGER sync_role_to_users ...;

-- 6. Add prevent_last_superadmin_demotion trigger
CREATE OR REPLACE FUNCTION public.prevent_last_superadmin_demotion() ...;
DROP TRIGGER IF EXISTS prevent_last_superadmin ON public.user_roles;
CREATE TRIGGER prevent_last_superadmin
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_superadmin_demotion();

-- 7. Update RLS policies
-- platform_settings: use has_role()
-- blog_posts: admin+ for write, superadmin for delete
-- credit_packages: superadmin for write
-- marketplace_config: admin+ for write
```

---

## 10. Audit Logging — Implementation Details

### 10.1 Logging Strategy

Admin actions are logged **on the client side** via a shared utility that calls a Supabase Edge Function `log-admin-action`. The Edge Function inserts into `admin_audit_log` using the `service_role` key, so the client cannot directly insert.

```ts
// src/lib/adminAudit.ts
export async function logAdminAction(params: {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  payload?: Record<string, unknown>;
}) {
  await supabase.functions.invoke('log-admin-action', { body: params });
}
```

**Caller example (GrantCreditsModal):**
```ts
await logAdminAction({
  action: 'grant_credits',
  targetType: 'user',
  targetId: userId,
  targetLabel: userEmail,
  payload: { amount: credits, reason },
});
```

### 10.2 Edge Function: `log-admin-action`

- Verifies caller is authenticated and has an admin role (reads `user_roles`).
- Extracts `actor_id`, `actor_email`, `actor_role` from Supabase JWT.
- Inserts record into `admin_audit_log` via service_role client.
- Returns `{ ok: true }` or `{ error }`.

### 10.3 Server-Side Logging for DB-level Actions

For maintenance RPCs (`run_credit_expiry`, `recalculate_all_balances`), logging happens inside the PL/pgSQL function using a `SECURITY DEFINER` INSERT into `admin_audit_log`.

---

## 11. Admin Dashboard — UI/UX Requirements

### 11.1 Role Indicator

The top bar in `AdminLayout` must display the current user's role badge:
- `Viewer` — grey badge
- `Admin` — blue badge
- `SuperAdmin` — purple badge

### 11.2 Permission-Denied States

When an action is not available to the current role:
- Buttons are **hidden** (not just disabled) for clearly destructive/dangerous actions (disable account, change role, delete post).
- For informational actions (export CSV), the button is **disabled** with a tooltip: `"Requires Admin access"`.
- If a viewer navigates directly to `/admin/blog` (they shouldn't — sidebar hides it), they are redirected to `/admin` with a toast: `"You don't have permission to access this section."`.

### 11.3 Sidebar Behaviour

- Sections with no accessible items are hidden entirely.
- A `viewer` sees: Overview, Users, Credits & Revenue, Gift Analytics, Blog Analytics, Audit Log.
- An `admin` sees everything except Settings.
- A `superadmin` sees everything.

### 11.4 Responsive Layout

The admin sidebar already supports mobile (hamburger menu + overlay). The collapsible desktop sidebar is already implemented. No changes required to the layout chrome.

---

## 12. Settings Page — Scoped Access Within the Page

Since `AdminSettings` is superadmin-only at the route level, no tab-level permission checks are strictly required. However, as a defensive measure, the component should still validate role on mount (existing pattern). The tabs configuration should not need changes.

---

## 13. User Detail Sheet — Viewer Experience

`UserDetailSheet` shows full profile, credit history, and session history. **Viewers** should see the sheet but with action buttons hidden:
- "Grant Credits" button — hidden for viewer.
- "Change Role" button — hidden for viewer.
- "Disable Account" button — hidden for viewer.

---

## 14. Testing & Verification Plan

### 14.1 Role-Based Access Tests (Manual)

For each role, create a test account and verify:

| Test | Viewer | Admin | Superadmin |
|------|--------|-------|------------|
| Can access `/admin` | ✅ | ✅ | ✅ |
| Can access `/admin/settings` | ❌ (redirected) | ❌ (redirected) | ✅ |
| Can access `/admin/blog` | ❌ (redirected) | ✅ | ✅ |
| Grant Credits button visible | ❌ | ✅ | ✅ |
| Change Role button visible | ❌ | ❌ | ✅ |
| Sidebar shows Settings | ❌ | ❌ | ✅ |
| Sidebar shows Blog Posts | ❌ | ✅ | ✅ |
| Audit log entry created after role change | — | — | ✅ |

### 14.2 DB-Level RLS Tests

```sql
-- As viewer user:
SELECT * FROM platform_settings;  -- Should succeed (read)
UPDATE platform_settings SET value = '"test"' WHERE key = 'site_name';  -- Should fail

-- As admin user:
INSERT INTO blog_posts (...) VALUES (...);  -- Should succeed
DELETE FROM blog_posts WHERE id = '...';  -- Should fail

-- As superadmin:
DELETE FROM blog_posts WHERE id = '...';  -- Should succeed
```

### 14.3 Lock-Out Prevention Test

```sql
-- Only 1 superadmin exists. Try to demote them:
UPDATE user_roles SET role = 'admin' WHERE user_id = '<only-superadmin-id>';
-- Expected: RAISE EXCEPTION 'Cannot demote the last superadmin.'
```

### 14.4 Audit Log Verification

After each tracked action in the UI, query `admin_audit_log` and verify:
- `actor_id` matches the performing admin.
- `action` matches the expected event string.
- `payload` contains appropriate before/after data.

---

## 15. Implementation Checklist for Engineers

### Phase 1 — Database (no UI changes)
- [ ] Add `viewer` to `app_role` enum.
- [ ] Add `granted_by`, `granted_at` to `user_roles`.
- [ ] Create `admin_audit_log` table + RLS.
- [ ] Create `get_my_role()` RPC.
- [ ] Create `sync_users_role_from_user_roles` trigger.
- [ ] Create `prevent_last_superadmin_demotion` trigger.
- [ ] Update RLS on: `platform_settings`, `blog_posts`, `credit_packages`, `marketplace_config`.
- [ ] Write and deploy `log-admin-action` Edge Function.

### Phase 2 — Frontend Core
- [ ] Create `useMyAdminRole` hook (replaces `useAdminCheck` in admin routes).
- [ ] Create `useCanDo` hook with permissions map.
- [ ] Update `AdminGuard` to use `useMyAdminRole` + `requiredRole` prop.
- [ ] Update `App.tsx` to pass `requiredRole` to all admin routes.
- [ ] Update `AdminLayout` to filter sidebar by role.
- [ ] Add role badge to top bar.

### Phase 3 — Action Hardening
- [ ] `AdminUsers.tsx` — hide Grant Credits, Change Role, Disable based on `useCanDo`.
- [ ] `ChangeRoleDialog.tsx` — hide `superadmin` option for non-superadmin callers; add audit log call.
- [ ] `GrantCreditsModal.tsx` — add audit log call.
- [ ] `DisableAccountDialog.tsx` — add audit log call.
- [ ] `AdminSettings.tsx` maintenance actions — add audit log calls.
- [ ] `AdminSettings.tsx` settings saves — add audit log calls.
- [ ] `AdminBlogPosts.tsx` delete — add audit log call.

### Phase 4 — Audit Log Page
- [ ] Create `/admin/audit-log` route + `AdminAuditLog.tsx` page.
- [ ] Add to `AdminLayout` nav (before Config section).
- [ ] Table: timestamp, actor, role badge, action, target, payload (collapsible).
- [ ] Filters: date range, actor, action type.
- [ ] Pagination (50/page).

### Phase 5 — Cleanup
- [ ] Deprecate `useAdminCheck` (keep temporarily for `BlogPost.tsx` which also uses it).
- [ ] Verify `users.role` column is always populated via trigger (audit existing rows).
- [ ] Remove any direct writes to `users.role` in application code.

---

## 16. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should `viewer` be invite-only (superadmin grants), or can admins grant viewer access? | Product | Open |
| Q2 | Should the audit log be retained indefinitely, or purged after N days? | Engineering | Open — recommend 365 days with archival |
| Q3 | Should IP address be logged in `admin_audit_log`? Requires Edge Function to extract from request headers. | Engineering | Open |
| Q4 | Should we notify the superadmin via email when a new admin role is granted? | Product | Open |
| Q5 | Do we want to surface the `viewer` role in the ChangeRoleDialog immediately, or launch with just `admin`/`superadmin`? | Product | Open |

---

## 17. Appendix — Current Role Storage Analysis

**Current state (as of 2026-04-26):**

| Store | How populated | How read | Notes |
|-------|--------------|----------|-------|
| `users.role` text column | Manually, via `users.role = 'superadmin'` in migrations | `useAdminCheck`, `AdminSettings` role check | Not synced from `user_roles` ❌ |
| `user_roles` table (app_role enum) | `ChangeRoleDialog` writes here | `AdminUsers.tsx` reads for display, `has_role()` RLS | Authoritative but not reflective of `users.role` ❌ |

**Target state (post-implementation):**

| Store | How populated | How read | Notes |
|-------|--------------|----------|-------|
| `users.role` text column | Trigger from `user_roles` | RLS policies only | Denormalized cache ✅ |
| `user_roles` table | `ChangeRoleDialog` (superadmin only) + direct SQL for initial setup | `get_my_role()` RPC, `has_role()`, UI displays | Single source of truth ✅ |
