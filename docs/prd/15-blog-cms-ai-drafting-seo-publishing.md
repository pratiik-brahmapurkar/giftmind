# PRD 15 — Blog CMS, AI Drafting & SEO Publishing

**Document status:** Draft
**Author:** Product
**Last updated:** 2026-04-30
**Related PRDs:** 10 (Admin Dashboard & RBAC), 12 (Analytics & Telemetry), 13 (Platform Settings)

---

## 1. Overview

GiftMind has a fully functional blog CMS built into the admin panel. It includes a markdown editor with split-view preview, an AI drafting assistant, SEO scoring, media management, category and tag support, scheduled publishing, and a CTA injection system. Analytics tracks views and CTA clicks per post.

The system is functional but has several gaps that limit editorial velocity and SEO effectiveness:

- **AI Drafting** generates full drafts but only supports Claude Sonnet — there is no fallback, no token budget tracking, and the `blog_ai_generations_per_day` rate limit is configured but not enforced by the Edge Function.
- **SEO scoring** is a client-side heuristic — it does not check for broken internal links, actual Google Search Console data, or structured data (JSON-LD).
- **Scheduled publishing** stores `scheduled_at` but there is **no cron job** that auto-publishes posts at that time — the status remains `scheduled` indefinitely until an admin manually publishes.
- **View counting** is done by incrementing `view_count` from the frontend — this is susceptible to bot inflation and reloads.
- **Blog analytics** shows cumulative totals only; there is no time-series chart, no per-post trend view, and no conversion funnel from blog → gift flow.
- The **RSS feed** and **sitemap** are noted in the codebase but their generation status is unclear.
- There is **no content calendar** or editorial workflow — no way to track who is responsible for which draft or what the publication schedule looks like for the next 30 days.

This PRD defines the target state for a production-grade Blog CMS with reliable AI assistance, automated publishing, accurate analytics, and structured SEO output.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Automate scheduled post publishing via `pg_cron` — posts publish at the exact `scheduled_at` time without admin action. |
| G2 | Add `generate_title_variants` and `rewrite_section` AI actions to reduce full-draft regeneration cycles. |
| G3 | Enforce `blog_ai_generations_per_day` rate limit server-side in the Edge Function. |
| G4 | Replace bot-susceptible client-side view counting with a server-side Edge Function with deduplication. |
| G5 | Add time-series view and CTA click charts to Blog Analytics. |
| G6 | Surface blog → gift-flow conversion as a first-class metric. |
| G7 | Add JSON-LD structured data (Article schema) to published blog posts. |
| G8 | Produce a reliable XML sitemap and RSS feed from published posts. |
| G9 | Add a content calendar view in the admin blog section. |

### Non-goals

- Building a visual (WYSIWYG) editor — the markdown editor is intentional and stays.
- Integrating Google Search Console or third-party SEO APIs.
- Multi-author workflow with review queues (single admin team manages the blog).
- Comment system or user-generated content on blog posts.

---

## 3. Current State Analysis

### 3.1 Database Schema

**`blog_posts`** — key columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `title` | text | Required for publish |
| `slug` | text | Unique, auto-generated from title |
| `content` | text | Markdown |
| `excerpt` | text | ≤160 chars |
| `status` | text | `draft`, `published`, `scheduled`, `archived` |
| `published_at` | timestamptz | Set on publish action |
| `scheduled_at` | timestamptz | Target publish time (cron not yet implemented) |
| `focus_keyword` | text | Used by `calculateSEOScore()` |
| `seo_score` | integer | Cached on save |
| `meta_title` | text | OG/search title |
| `meta_description` | text | OG/search description |
| `canonical_url` | text | Override canonical |
| `featured_image_url` | text | Storage URL |
| `featured_image_alt` | text | Alt text for SEO/accessibility |
| `category_id` | uuid | FK → `blog_categories` |
| `tags` | text[] | Free-form tags |
| `view_count` | integer | Incremented from frontend |
| `cta_click_count` | integer | Incremented from frontend |
| `cta_type` | text | `custom` or `none` |
| `cta_text` | text | Button label |
| `cta_url` | text | Target URL (usually `/gift-flow`) |
| `cta_occasion` | text | Pre-fills occasion in gift flow |
| `author_id` | uuid | FK → `auth.users` |

**`blog_categories`** — name, slug, sort_order, description.

**`blog_media`** — file_name, file_url, file_type, file_size, alt_text, uploaded_by.

Storage bucket: `blog-media` (Supabase Storage).

### 3.2 AI Drafting — Edge Function (`blog-ai-assistant`)

**Supported actions:**

| Action | Model | Max tokens | Timeout |
|--------|-------|-----------|---------|
| `generate_draft` | Claude Sonnet 4 | 4000 | 90s |
| `improve_seo` | Claude Haiku 4.5 | 1500 | 30s |
| `generate_excerpt` | Claude Haiku 4.5 | 100 | 15s |

**Auth:** Requires `admin` or `superadmin` role (reads `user_roles`).

**Gaps:**
- No fallback provider — if Anthropic is down or rate-limited, the entire function fails.
- `blog_ai_generations_per_day` platform setting exists but is not read by this function.
- No telemetry logging to `ai_telemetry_log`.
- Only Claude is used — Gemini Flash could handle `generate_excerpt` at near-zero cost.

### 3.3 SEO Score Calculation (`src/lib/blog.ts`)

`calculateSEOScore()` checks 13 checklist items, scoring 0-100. Checks include:
- Keyword in title, first paragraph, meta description, H2s
- Keyword density 0.5%–3%
- ≥3 H2 headings
- Meta title 40-60 chars, meta description 140-160 chars
- Content ≥800 words
- Featured image with alt text
- Internal links to `/gift-flow` or `/blog/`
- CTA enabled

**Gaps:**
- Does not validate structured data / JSON-LD.
- No readability check (sentence complexity, passive voice).
- Does not detect duplicate slugs across drafts (only checks on slug blur, not on save).

### 3.4 Scheduled Publishing

`scheduled_at` is stored. The editor sets it. **There is no pg_cron job to act on it.** Posts remain in `scheduled` state forever unless manually published.

### 3.5 View Counting

`view_count` is incremented from the public blog post page (`/blog/[slug]`). This is susceptible to:
- Page refreshes
- Bot/crawler traffic
- Blocked by ad blockers

### 3.6 Blog Analytics (`AdminBlogAnalytics.tsx`)

Metrics available:
- Total views, CTA clicks, CTR (per post, cumulative)
- Top 5 posts by views, top 5 by CTA clicks
- SEO health section (posts with score < 70)

**Gaps:**
- No time-series data — `view_count` is a single integer per post, not daily snapshots.
- No blog → gift-flow conversion tracking (did the visitor start a gift session after clicking the CTA?).
- Date range selector exists in the UI but is not wired to a query (always shows all-time data).

---

## 4. Feature Specifications

### 4.1 Automated Scheduled Publishing

**Problem:** Posts with `status = 'scheduled'` are never auto-published.

**Solution:** A `pg_cron` job runs every 5 minutes and publishes due posts.

```sql
-- Migration: add to 20260430200000_blog_scheduled_publishing.sql
CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  published_count integer;
BEGIN
  UPDATE public.blog_posts
  SET
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE
    status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now();

  GET DIAGNOSTICS published_count = ROW_COUNT;
  RETURN published_count;
END;
$$;

SELECT cron.schedule(
  'publish-scheduled-posts',
  '*/5 * * * *',   -- every 5 minutes
  $$SELECT public.publish_scheduled_posts();$$
);
```

**RLS:** Function runs as `SECURITY DEFINER` — no RLS bypass needed for the scheduler.

**UI impact:** No UI change required. The editor already shows `scheduled` status. Posts will auto-transition to `published`.

**Admin notification (future):** When a post auto-publishes, write to `admin_audit_log` with `action = 'auto_publish_post'`.

### 4.2 New AI Drafting Actions

Two new actions added to `blog-ai-assistant`:

#### 4.2.1 `generate_title_variants`

**Input:** `{ action: "generate_title_variants", existing_content: string, focus_keyword: string }`

**Output:**
```json
{
  "variants": [
    { "title": "...", "style": "seo", "chars": 54 },
    { "title": "...", "style": "clickbait", "chars": 49 },
    { "title": "...", "style": "question", "chars": 61 },
    { "title": "...", "style": "list", "chars": 58 },
    { "title": "...", "style": "emotional", "chars": 52 }
  ]
}
```

Model: Claude Haiku (fast, cheap). Max tokens: 500. Timeout: 15s.

**UI:** A "✦ Suggest titles" button in the title field of the editor opens a modal with 5 variants. Click to apply.

#### 4.2.2 `rewrite_section`

**Input:** `{ action: "rewrite_section", section_text: string, instruction: string, focus_keyword?: string }`

**Output:** `{ rewritten: string }` — the rewritten section in markdown.

Model: Claude Haiku (for short sections). Max tokens: 1000. Timeout: 20s.

**UI:** In the editor, select any text → right-click context menu shows "✦ Rewrite with AI" → prompt appears for instruction (e.g. "Make it shorter", "Add more examples", "Include the keyword") → replaces selection with rewritten text.

#### 4.2.3 `generate_title_variants` + `rewrite_section` Rate Limiting

Both new actions count against `blog_ai_generations_per_day` (same counter as `generate_draft`).

### 4.3 Server-Side Rate Limiting for Blog AI

The `blog-ai-assistant` function currently ignores the `blog_ai_generations_per_day` setting.

**Fix:** Load settings at request start and enforce the daily limit:

```ts
// In blog-ai-assistant/index.ts, after auth check
const { data: settingsRows } = await supabaseAdmin
  .from('platform_settings')
  .select('key, value')
  .in('key', ['blog_ai_generations_per_day', 'maintenance_mode']);

const settings = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]));
const dailyLimit = typeof settings.blog_ai_generations_per_day === 'number'
  ? settings.blog_ai_generations_per_day : 50;

// Count today's AI calls by this admin
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

const { count } = await supabaseAdmin
  .from('ai_telemetry_log')
  .select('id', { count: 'exact', head: true })
  .eq('function_name', 'blog-ai-assistant')
  .gte('created_at', todayStart.toISOString());

if ((count || 0) >= dailyLimit) {
  return json({ error: `Daily AI generation limit (${dailyLimit}) reached. Resets at midnight.` }, 429);
}
```

**Telemetry:** Log every call to `ai_telemetry_log` (already instrumented in PRD 12).

### 4.4 AI Drafting — Provider Fallback

`blog-ai-assistant` currently hard-codes Anthropic. Migrate to the shared `callAIWithFallback` pattern from `_shared/ai-providers.ts`:

| Action | Primary | Fallback |
|--------|---------|---------|
| `generate_draft` | Claude Sonnet | Gemini Pro |
| `improve_seo` | Claude Haiku | Gemini Flash |
| `generate_excerpt` | Gemini Flash | Claude Haiku |
| `generate_title_variants` | Gemini Flash | Claude Haiku |
| `rewrite_section` | Claude Haiku | Gemini Flash |

Note: Blog AI does not route through the plan-based `getProviderChain()` — it always uses the best available model for content quality.

### 4.5 Server-Side View Counting

**Problem:** Client-side `view_count` increments are unreliable.

**Solution:** New Edge Function `track-blog-view` handles view recording with deduplication.

```ts
// supabase/functions/track-blog-view/index.ts
// Accepts: { slug: string }
// Auth: optional (public posts are publicly viewable; anon is fine)
// Deduplication: 1 count per (ip_hash + slug) per 24h using a lightweight table
```

**New table: `blog_view_events`**

```sql
CREATE TABLE public.blog_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,          -- SHA-256 of IP+UserAgent, not raw IP
  user_id uuid,                   -- if authenticated
  viewed_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint prevents double-counting same visitor same day
CREATE UNIQUE INDEX blog_view_events_dedup
  ON public.blog_view_events(post_id, ip_hash, viewed_at);

-- Purge after 90 days (events only; view_count on blog_posts is permanent)
SELECT cron.schedule(
  'purge-old-blog-views',
  '0 4 * * 0',
  $$DELETE FROM public.blog_view_events WHERE created_at < now() - interval '90 days';$$
);
```

**Flow:**
1. User lands on `/blog/[slug]`.
2. Frontend calls `track-blog-view` with `{ slug }`.
3. Edge Function resolves post_id from slug, hashes `IP+UserAgent` (never stores raw IP).
4. Attempts `INSERT INTO blog_view_events ... ON CONFLICT DO NOTHING`.
5. If insert succeeded (new unique view), increments `blog_posts.view_count += 1`.
6. Returns `{ counted: true/false }`.

**Frontend:** Replace the existing client-side increment with a call to the new function.

### 4.6 CTA Click Tracking — Server-Side

Same pattern as views. CTA clicks currently increment `cta_click_count` from the frontend.

**Fix:** New action `track-blog-cta-click` (can share the same Edge Function as `track-blog-view` with a different action param).

```ts
// { slug: string, action: 'cta_click' }
// No deduplication needed for clicks (user may click multiple times intentionally)
// Simply increments cta_click_count
```

**Blog → Gift Flow Conversion:** When a CTA click originates from a blog post, the gift flow URL already includes `?source=blog&occasion=...`. The `generate-gifts` Edge Function can detect this and write `source_blog_slug` to `gift_sessions`:

```sql
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS source_blog_slug text;
```

This enables the query: "how many gift sessions were started from blog post X?"

### 4.7 Time-Series Analytics

**New table: `blog_daily_stats`**

```sql
CREATE TABLE public.blog_daily_stats (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  date date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  cta_clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, date)
);
```

A daily `pg_cron` job resets and populates from `blog_view_events`:

```sql
-- Alternatively, increment in real-time in track-blog-view function
INSERT INTO public.blog_daily_stats (post_id, date, views)
VALUES ($post_id, CURRENT_DATE, 1)
ON CONFLICT (post_id, date) DO UPDATE SET views = blog_daily_stats.views + 1;
```

**Admin Analytics UI updates:**

- Date range filter now **works** — queries `blog_daily_stats` for the selected range instead of returning all-time `view_count`.
- New **time-series chart**: line chart showing daily views for the top 5 posts over the selected range.
- New **conversion metric**: "Blog → Gift Flow" = sessions with `source_blog_slug IS NOT NULL` / CTA clicks. Shown as a stat card on the analytics page.

### 4.8 JSON-LD Structured Data

Published blog posts render Article schema in their `<head>`:

```tsx
// src/pages/BlogPost.tsx — add to SEOHead or inline <script>
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.meta_title || post.title,
  "description": post.meta_description || post.excerpt,
  "image": post.featured_image_url || undefined,
  "datePublished": post.published_at,
  "dateModified": post.updated_at,
  "author": {
    "@type": "Organization",
    "name": "GiftMind",
    "url": "https://giftmind.in"
  },
  "publisher": {
    "@type": "Organization",
    "name": "GiftMind",
    "logo": {
      "@type": "ImageObject",
      "url": "https://giftmind.in/logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": `https://giftmind.in/blog/${post.slug}`
  }
};
```

**SEO checklist addition:** New item — "Has valid JSON-LD structured data" (checks that `published_at` exists, `meta_title` is set, and `featured_image_url` is set).

### 4.9 XML Sitemap

**Route:** `/sitemap.xml` — served by a Supabase Edge Function or a Vite server-side route.

**Content:** All `published` blog posts + static pages (`/`, `/blog`, `/gift-flow`, `/pricing`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://giftmind.in/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://giftmind.in/blog/</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <!-- Per published post -->
  <url>
    <loc>https://giftmind.in/blog/{slug}</loc>
    <lastmod>{updated_at}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

**Edge Function: `generate-sitemap`**

- Fetches all published posts (id, slug, updated_at).
- Returns XML with `Content-Type: application/xml`.
- Cached at CDN level for 1 hour.

### 4.10 RSS Feed

**Route:** `/blog/rss.xml`

**Content:** Latest 20 published posts in RSS 2.0 format.

**Edge Function: `generate-rss`**

- Fetches 20 latest published posts (title, excerpt, slug, published_at, featured_image_url).
- Returns RSS 2.0 XML.
- Cached for 30 minutes.

### 4.11 Content Calendar View

**Route:** `/admin/blog/calendar`

**Layout:** Month-view calendar grid. Each day cell shows:
- Published posts (green pill)
- Scheduled posts (blue pill with time)
- Drafts updated that day (grey pill)

Clicking a pill opens the post editor directly.

**Implementation:** Uses a single query for the current month's posts:
```ts
supabase
  .from('blog_posts')
  .select('id, title, slug, status, published_at, scheduled_at, updated_at')
  .or(`published_at.gte.${monthStart},scheduled_at.gte.${monthStart}`)
  .lte('published_at', monthEnd)
```

**Also shows:** A "Next 30 days" panel listing all scheduled posts in chronological order with time, status badge, and quick-edit link.

---

## 5. Updated SEO Checklist

The `calculateSEOScore()` in `src/lib/blog.ts` gains 2 new checks:

| # | Check | Points | Current |
|---|-------|--------|---------|
| 14 | Has JSON-LD: `published_at` + `meta_title` + `featured_image_url` all set | 5 | ❌ New |
| 15 | Reading level: avg sentence < 20 words (split content by `.` and average) | 5 | ❌ New |

**Total possible score increases from 100 → 110, then normalised back to 100.**

---

## 6. Editor UX Improvements

### 6.1 Auto-save Interval

Current: Auto-save every 60s when `mode === 'edit'` and `dirty === true`.

**Change:** Reduce to **30 seconds** for a better safety net.

### 6.2 Word Count Target Indicator

Editor toolbar shows a word count progress bar when `content` length > 100 words:
- Target: 800 words (minimum for SEO score to pass `content-length` check).
- Visual: `342 / 800 words` with a progress bar that turns green at 800+.

### 6.3 Preview Link on Published Posts

For published posts, the "Preview" button text changes to "View Live" and opens `/blog/{slug}` (without `?preview=true`).

### 6.4 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+S` | Save draft |
| `Cmd+Shift+P` | Publish / Schedule |
| `Cmd+K` | Insert link |
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |

---

## 7. Database Migration

### Migration: `20260430200000_blog_cms_v2.sql`

```sql
-- 1. Scheduled publishing cron
CREATE OR REPLACE FUNCTION public.publish_scheduled_posts() RETURNS integer ...;
SELECT cron.schedule('publish-scheduled-posts', '*/5 * * * *', ...);

-- 2. Blog view events table
CREATE TABLE IF NOT EXISTS public.blog_view_events ( ... );
CREATE UNIQUE INDEX blog_view_events_dedup ON public.blog_view_events(post_id, ip_hash, viewed_at);

-- 3. Blog daily stats table
CREATE TABLE IF NOT EXISTS public.blog_daily_stats ( ... );

-- 4. source_blog_slug on gift_sessions
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS source_blog_slug text;

-- 5. Purge crons
SELECT cron.schedule('purge-old-blog-views', '0 4 * * 0', ...);

-- 6. RLS for new tables
ALTER TABLE public.blog_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_daily_stats ENABLE ROW LEVEL SECURITY;

-- Service role inserts view events (via Edge Function)
CREATE POLICY "service_insert_view_events" ON public.blog_view_events
  FOR INSERT TO service_role WITH CHECK (true);

-- Admins read view events and daily stats
CREATE POLICY "admin_read_view_events" ON public.blog_view_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "service_upsert_daily_stats" ON public.blog_daily_stats
  FOR ALL TO service_role WITH CHECK (true);

CREATE POLICY "admin_read_daily_stats" ON public.blog_daily_stats
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));
```

---

## 8. Analytics Events

| Event | Trigger | Properties |
|-------|---------|-----------|
| `blog_post_viewed` | User lands on `/blog/[slug]` | `post_id`, `slug`, `category`, `source` |
| `blog_cta_clicked` | User clicks CTA in blog post | `post_id`, `slug`, `occasion`, `cta_url` |
| `blog_draft_generated` | AI draft completes | `action`, `topic`, `word_count`, `latency_ms` |
| `blog_seo_analyzed` | SEO analysis runs | `post_id`, `seo_score`, `primary_issue` |
| `blog_post_published` | Post status → published | `post_id`, `slug`, `scheduled` (was it auto-published) |
| `blog_section_rewritten` | Rewrite section AI action | `instruction_length`, `section_word_count` |

---

## 9. Implementation Checklist

### Phase 1 — Automated Scheduling
- [ ] Write `publish_scheduled_posts()` PL/pgSQL function.
- [ ] Register `pg_cron` job: every 5 minutes.
- [ ] Write audit log entry to `admin_audit_log` for each auto-published post.
- [ ] Test: Create a scheduled post with `scheduled_at = now() + 10min`, wait, verify.

### Phase 2 — Server-Side View & Click Counting
- [ ] Create `blog_view_events` and `blog_daily_stats` tables.
- [ ] Create `track-blog-view` Edge Function (deduplication + increment).
- [ ] Update `BlogPost.tsx` to call `track-blog-view` instead of direct DB update.
- [ ] Add `source_blog_slug` column to `gift_sessions`.
- [ ] Update `generate-gifts` to detect and store `source_blog_slug` from query params.

### Phase 3 — AI Drafting Improvements
- [ ] Add `generate_title_variants` action to `blog-ai-assistant`.
- [ ] Add `rewrite_section` action to `blog-ai-assistant`.
- [ ] Enforce `blog_ai_generations_per_day` server-side.
- [ ] Log all AI calls to `ai_telemetry_log`.
- [ ] Add provider fallback using `callAIWithFallback`.

### Phase 4 — Editor UX
- [ ] Add "✦ Suggest titles" button + modal with 5 variants.
- [ ] Add "✦ Rewrite with AI" context menu on text selection.
- [ ] Reduce auto-save interval to 30s.
- [ ] Add word count progress bar (target: 800).
- [ ] Add keyboard shortcuts for save, publish, bold, italic, link.
- [ ] Change "Preview" → "View Live" for published posts.

### Phase 5 — Structured Data & SEO
- [ ] Add JSON-LD Article schema to `BlogPost.tsx`.
- [ ] Add 2 new SEO checklist items: JSON-LD, readability.
- [ ] Update `calculateSEOScore()` and normalise to 100.

### Phase 6 — Sitemap & RSS
- [ ] Create `generate-sitemap` Edge Function → `/sitemap.xml`.
- [ ] Create `generate-rss` Edge Function → `/blog/rss.xml`.
- [ ] Add `<link rel="alternate" type="application/rss+xml">` to blog index page.
- [ ] Submit sitemap URL to Google Search Console (manual step).

### Phase 7 — Analytics Improvements
- [ ] Wire date range filter in `AdminBlogAnalytics` to `blog_daily_stats` query.
- [ ] Add time-series line chart (daily views, top 5 posts, selected range).
- [ ] Add "Blog → Gift Flow" conversion stat card.
- [ ] Instrument all new analytics events listed in Section 8.

### Phase 8 — Content Calendar
- [ ] Create `/admin/blog/calendar` route + `AdminBlogCalendar.tsx` page.
- [ ] Month-view grid with published/scheduled/draft pills.
- [ ] "Next 30 days" scheduled posts panel.
- [ ] Add "Calendar" link to admin blog sidebar section.

---

## 10. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should `track-blog-view` allow anon (unauthenticated) view counting for public blog posts? | Engineering | Open — recommend yes; anon views are the majority |
| Q2 | Should the content calendar show draft `updated_at` dates or only published/scheduled dates? | Product | Open |
| Q3 | Should we expose the RSS feed URL publicly in the blog UI for readers? | Product | Open — recommend yes |
| Q4 | Should `rewrite_section` support streaming (SSE) to avoid long waits for long sections? | Engineering | Open — recommend no for v1; add in v2 |
| Q5 | Should the `source_blog_slug` be sent to PostHog as part of `gift_flow_started`? | Product | Open — recommend yes for attribution reporting |
| Q6 | Should `publish_scheduled_posts()` send an email notification to the author when a post auto-publishes? | Product | Open — nice to have |
| Q7 | What is the retention policy for `blog_view_events`? 90 days is proposed. Does this align with GDPR obligations for anonymised data? | Legal/Engineering | Open |
