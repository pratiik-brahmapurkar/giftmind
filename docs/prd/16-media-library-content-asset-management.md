# PRD 16 — Media Library & Content Asset Management

**Document status:** Draft
**Author:** Product
**Last updated:** 2026-05-01
**Related PRDs:** 10 (Admin Dashboard & RBAC), 15 (Blog CMS, AI Drafting & SEO Publishing)

---

## 1. Overview

GiftMind has a functional Media Library (`AdminMediaLibrary.tsx`) and a `MediaPickerModal` used inside the blog editor. The underlying infrastructure consists of a Supabase Storage bucket (`blog-media`) and a `blog_media` database table for tracking metadata.

The current system works for basic image upload and insertion into blog posts, but has significant gaps that limit its usefulness as the content operation scales:

- **Scope is blog-only** — the library is labelled "Manage images for your blog" and is exclusively tied to blog posts. There is no concept of brand assets, OG images, or reusable design assets.
- **No image optimisation** — uploaded files are stored and served as-is. There is no compression, WebP conversion, or responsive `srcset` generation.
- **No usage tracking** — the system cannot tell you which posts use a given image. Deleting an image can silently break blog posts that reference it.
- **No folders or tagging** — with a growing library, images are in a flat list with only filename-based search.
- **5 MB hard cap, images only** — SVGs are blocked. Short video clips or PDF attachments for content cannot be uploaded at all.
- **Alt text is optional and unenforced** — images without alt text are inserted into blog posts silently, harming SEO and accessibility.
- **MediaPickerModal is minimal** — it has no upload capability, no pagination, and no alt text preview.
- **No storage quota visibility** — admins cannot see how much of the Supabase Storage quota is consumed.
- **Orphaned assets** — files uploaded to storage but not tracked in `blog_media` (e.g. upload succeeded but DB insert failed) are never cleaned up.

This PRD defines a production-grade Media Library that serves as the central asset hub for all GiftMind content — blog images, OG images, brand assets, and future content types.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Expand the media library beyond blog images to support brand assets and OG images as first-class asset categories. |
| G2 | Add folder/collection organisation to keep the library navigable as asset count grows. |
| G3 | Enforce alt text on image assets before they can be inserted into a blog post. |
| G4 | Track which blog posts use each asset — prevent deletion of in-use assets without confirmation. |
| G5 | Surface storage usage (total bytes used, file count) in the media library header. |
| G6 | Detect and allow cleanup of orphaned storage objects not tracked in `blog_media`. |
| G7 | Upgrade `MediaPickerModal` to support in-modal upload, pagination, and alt text display. |
| G8 | Add SVG support to the allowed file types. |
| G9 | Add image dimension metadata (width × height) to `blog_media` for responsive use. |

### Non-goals

- Client-side image resizing or WebP conversion (deferred to v2 — requires server-side processing).
- Video or PDF upload support (images and SVG only in v1).
- AI-powered image tagging or auto alt text generation (future enhancement).
- Public-facing media gallery or asset CDN with custom domain.
- DAM integrations (Cloudinary, Imgix, etc.).

---

## 3. Current State Analysis

### 3.1 Database Schema — `blog_media`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `file_name` | text | Original filename |
| `file_url` | text | Full public Supabase Storage URL |
| `file_size` | integer | Bytes |
| `file_type` | text | MIME type (`image/jpeg`, etc.) |
| `alt_text` | text | Nullable — not enforced |
| `uploaded_by` | uuid | FK → `auth.users` |
| `created_at` | timestamptz | Upload timestamp |

**Missing columns:** `folder`, `tags`, `width`, `height`, `asset_type`, `usage_count`.

### 3.2 Storage Bucket — `blog-media`

- Public read, admin-only write.
- Path pattern: `{timestamp}-{random}.{ext}` — flat structure, no folder prefix.
- Allowed types enforced only on the frontend: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Max size enforced only on the frontend: 5 MB.

### 3.3 `AdminMediaLibrary.tsx` — Key Gaps

| Gap | Impact |
|-----|--------|
| No usage tracking | Can delete images that are referenced in published blog posts |
| No storage quota display | Admins have no visibility into bucket consumption |
| No folder/tag organisation | Flat list becomes unusable past ~100 assets |
| No orphan detection | Storage objects uploaded but not DB-tracked accumulate silently |
| No image dimensions | Cannot generate `width`/`height` attributes or responsive sizes |
| Alt text optional | Published blog posts can have images without accessibility metadata |

### 3.4 `MediaPickerModal.tsx` — Key Gaps

| Gap | Impact |
|-----|--------|
| No upload in modal | Editor must leave the editor, go to Media Library, upload, then return |
| No pagination | All assets loaded at once — slow and unusable at scale |
| No alt text shown | Editor cannot verify alt text before inserting |
| Filename-only search | Cannot filter by type or folder |

### 3.5 RLS Policies

- `admin_select_blog_media` — `viewer`, `admin`, `superadmin` can SELECT.
- `admin_insert_blog_media` — `admin`, `superadmin` can INSERT.
- `admin_update_blog_media` — `admin`, `superadmin` can UPDATE.
- `admin_delete_blog_media` — `admin`, `superadmin` can DELETE.
- Storage: `admin_upload_blog_media`, `public_read_blog_media`, `admin_delete_blog_media`.

---

## 4. Feature Specifications

### 4.1 Schema Enhancements

#### 4.1.1 New Columns on `blog_media`

```sql
-- Migration: 20260501000000_media_library_v2.sql
ALTER TABLE public.blog_media
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'uncategorised',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'blog-image',
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
```

**`folder`** — logical grouping. Predefined values: `uncategorised`, `blog`, `brand`, `og-images`.

**`asset_type`** — categorises the asset's intended use:
- `blog-image` — used inside blog post body or as featured image.
- `brand` — logos, icons, design assets.
- `og-image` — social sharing / Open Graph images.
- `misc` — catch-all.

**`width` / `height`** — pixel dimensions, populated on upload by reading image metadata in the Edge Function.

**`usage_count`** — denormalised count of blog posts that reference this asset (either as `featured_image_url` or inline in `content`). Updated by trigger.

#### 4.1.2 Indexes

```sql
CREATE INDEX IF NOT EXISTS blog_media_folder_idx ON public.blog_media(folder);
CREATE INDEX IF NOT EXISTS blog_media_asset_type_idx ON public.blog_media(asset_type);
CREATE INDEX IF NOT EXISTS blog_media_uploaded_by_idx ON public.blog_media(uploaded_by);
```

#### 4.1.3 Usage Count Trigger

A Postgres trigger updates `blog_media.usage_count` whenever `blog_posts.featured_image_url` or `blog_posts.content` changes:

```sql
CREATE OR REPLACE FUNCTION public.refresh_media_usage_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Recompute usage_count for all media items referenced by the changed post
  UPDATE public.blog_media bm
  SET usage_count = (
    SELECT COUNT(*) FROM public.blog_posts bp
    WHERE bp.featured_image_url LIKE '%' || bm.id::text || '%'
       OR bp.content LIKE '%' || bm.id::text || '%'
  )
  WHERE bm.id::text = ANY(
    SELECT regexp_matches(COALESCE(NEW.featured_image_url,'') || COALESCE(NEW.content,''),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER blog_posts_media_usage_trigger
AFTER INSERT OR UPDATE OF featured_image_url, content ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.refresh_media_usage_counts();
```

> **Note:** For v1, the trigger uses a simple LIKE match on the asset UUID. For high-volume usage, migrate to a dedicated `blog_post_media` junction table in v2.

### 4.2 Upload Improvements

#### 4.2.1 SVG Support

Add `image/svg+xml` to both frontend validation and storage bucket MIME allow-list. SVGs are served as-is (no raster conversion). Max size for SVG: 512 KB.

Updated allowed types:

| MIME type | Max size |
|-----------|---------|
| `image/jpeg` | 5 MB |
| `image/png` | 5 MB |
| `image/webp` | 5 MB |
| `image/gif` | 5 MB |
| `image/svg+xml` | 512 KB |

#### 4.2.2 Folder Assignment on Upload

Upload UI adds a **Folder** dropdown:
- `blog` (default)
- `brand`
- `og-images`
- `uncategorised`

The selected folder is stored in `blog_media.folder` and used as the storage path prefix:

```
{folder}/{timestamp}-{random}.{ext}
```

e.g. `blog/1746100000-abc123.webp`

#### 4.2.3 Image Dimensions on Upload

After a successful upload, the frontend reads image dimensions before inserting to DB:

```ts
const getDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    if (file.type === 'image/svg+xml') return resolve({ width: 0, height: 0 });
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = URL.createObjectURL(file);
  });
```

Dimensions are stored in `blog_media.width` and `blog_media.height`.

#### 4.2.4 Alt Text Required on Upload

The upload flow adds an **Alt Text** field that must be filled before the file is committed to the DB. The field appears after the file is selected, before upload begins:

```
[ Drop zone / file picker ]
  → File selected → "Add alt text before uploading"
    [ Alt text input — required ]
    [ Upload button ]
```

If alt text is blank, the Upload button is disabled. Alt text is stored immediately in `blog_media.alt_text`.

### 4.3 Folder & Filter Navigation

The library sidebar adds folder-based navigation:

```
All Files (N)
├── Blog Images (N)
├── Brand Assets (N)
├── OG Images (N)
└── Uncategorised (N)
```

Clicking a folder filters `blog_media` by `folder`. Counts are shown in the nav.

**Filter bar** (unchanged position, enhanced options):
- Search by filename (existing)
- File type dropdown: All / JPEG / PNG / WebP / GIF / SVG (existing, add SVG)
- **New:** Sort by: Newest / Oldest / Largest / Smallest / Most Used

### 4.4 Usage Indicator on Asset Cards

Each asset card in the grid shows a usage badge:

| `usage_count` | Badge |
|--------------|-------|
| 0 | — (no badge) |
| 1–N | `Used in N post(s)` — grey badge |

Clicking the badge opens a popover listing the post titles that reference the asset, with links to the editor.

**Deletion guard:** If `usage_count > 0`, clicking Delete shows a warning:

```
This image is used in 2 published post(s):
  • "10 Thoughtful Gifts for Moms"
  • "How to Choose the Perfect Birthday Gift"

Deleting it will break those pages. Are you sure?
[ Cancel ]  [ Delete Anyway ]
```

### 4.5 Storage Quota Widget

A compact widget in the Media Library header shows:

```
Storage: 142 MB used  •  312 files
```

**Implementation:** A new Edge Function `get-storage-stats` queries `storage.objects` for the `blog-media` bucket:

```sql
SELECT
  COUNT(*) AS file_count,
  COALESCE(SUM(metadata->>'size')::bigint, 0) AS total_bytes
FROM storage.objects
WHERE bucket_id = 'blog-media';
```

- Called once on page load, cached for 5 minutes client-side.
- No Supabase plan quota limit is exposed (quota depends on plan tier and is not in DB).

### 4.6 Orphan Detection & Cleanup

**Definition:** A storage object in the `blog-media` bucket that has no corresponding row in `blog_media` (i.e., upload succeeded but the DB insert failed).

**New admin action — "Find Orphans":**

A button in the Media Library header triggers the `find-media-orphans` Edge Function:

```ts
// supabase/functions/find-media-orphans/index.ts
// Fetches all storage objects in blog-media bucket.
// Cross-references with blog_media.file_url.
// Returns list of orphaned storage paths.
```

Results are shown in a modal:

```
3 orphaned files found in storage (not tracked in DB):
  • blog/1740000001-abc.jpg (2.1 MB) — [Delete]
  • og-images/1740000002-xyz.png (0.8 MB) — [Delete]
  • uncategorised/1740000003-foo.webp (1.3 MB) — [Delete]

[Delete All Orphans]  [Close]
```

Deletions are permanent and logged to `admin_audit_log`.

**Scheduled cleanup:** A weekly `pg_cron` job flags orphans older than 7 days. It does not auto-delete — only flags for admin review.

### 4.7 Enhanced MediaPickerModal

The `MediaPickerModal` used in the blog editor is rebuilt with the following improvements:

#### 4.7.1 In-Modal Upload

A compact upload zone at the top of the modal allows drag-and-drop or file picker without leaving the editor:

```
[ ⬆ Drop image here or click to upload ]  [Choose from library →]
```

Uploading from the modal defaults `folder = 'blog'` and prompts for alt text inline.

#### 4.7.2 Pagination

Media is loaded in pages of 24 items. A "Load more" button appends the next page. Uses `range()` in the Supabase query.

#### 4.7.3 Alt Text Display & Enforcement

Each image tile in the picker shows:
- A small `✓ Alt` or `⚠ No alt` badge.
- Hovering shows the alt text in a tooltip.

If the user selects an image with no alt text, a warning appears:

```
⚠ This image has no alt text. Add it before inserting for SEO & accessibility.
[ Alt text input ]  [ Insert anyway ]  [ Cancel ]
```

#### 4.7.4 Folder Filter in Modal

A horizontal pill row at the top of the picker filters by folder:
`All  |  Blog  |  Brand  |  OG Images`

### 4.8 Asset Detail Sheet Enhancements

The existing detail Sheet (right panel when clicking an asset) gains:

- **Dimensions:** `1200 × 630 px` — shown below file size.
- **Used in posts:** List of post titles with links.
- **Folder:** Dropdown to reassign the asset to a different folder.
- **Tags:** Free-form tag input (stored in `blog_media.tags`). Useful for searching by topic.
- **Copy as Markdown:** `![{alt_text}]({file_url})` — one-click copy for manual markdown insertion.

---

## 5. Admin UI — Page Structure

```
/admin/media
  ├── Header
  │     ├── "Media Library" heading
  │     ├── Storage quota widget (142 MB · 312 files)
  │     └── [Find Orphans] button
  ├── Sidebar nav (folder counts)
  │     ├── All Files
  │     ├── Blog Images
  │     ├── Brand Assets
  │     ├── OG Images
  │     └── Uncategorised
  ├── Upload zone (drag & drop with alt text prompt)
  ├── Filter bar (search + type + sort)
  ├── Asset grid (4 cols desktop, 2 cols mobile)
  │     └── Asset card × N (usage badge, hover actions)
  └── Detail sheet (right panel on asset click)
```

---

## 6. Database Migration

### Migration: `20260501000000_media_library_v2.sql`

```sql
-- 1. Add new columns
ALTER TABLE public.blog_media
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'uncategorised',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'blog-image',
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

-- 2. Back-fill existing assets
UPDATE public.blog_media SET folder = 'blog' WHERE folder = 'uncategorised';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS blog_media_folder_idx ON public.blog_media(folder);
CREATE INDEX IF NOT EXISTS blog_media_asset_type_idx ON public.blog_media(asset_type);

-- 4. Usage count trigger
CREATE OR REPLACE FUNCTION public.refresh_media_usage_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.blog_media bm
  SET usage_count = (
    SELECT COUNT(*) FROM public.blog_posts bp
    WHERE bp.featured_image_url LIKE '%' || bm.id::text || '%'
       OR bp.content LIKE '%' || bm.id::text || '%'
  )
  WHERE bm.id::text = ANY(
    SELECT regexp_matches(
      COALESCE(NEW.featured_image_url,'') || COALESCE(NEW.content,''),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_posts_media_usage_trigger ON public.blog_posts;
CREATE TRIGGER blog_posts_media_usage_trigger
AFTER INSERT OR UPDATE OF featured_image_url, content ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.refresh_media_usage_counts();

-- 5. Back-fill usage counts for existing posts
UPDATE public.blog_media bm
SET usage_count = (
  SELECT COUNT(*) FROM public.blog_posts bp
  WHERE bp.featured_image_url LIKE '%' || bm.id::text || '%'
     OR bp.content LIKE '%' || bm.id::text || '%'
);
```

---

## 7. Edge Functions

### 7.1 `get-storage-stats`

- **Auth:** `admin` or `superadmin`.
- **Method:** GET.
- **Returns:** `{ file_count: number, total_bytes: number }`.
- Queries `storage.objects` via `supabaseAdmin` (service role).

### 7.2 `find-media-orphans`

- **Auth:** `superadmin` only.
- **Method:** POST.
- **Returns:** `{ orphans: Array<{ path: string, size: number, last_modified: string }> }`.
- Lists all `storage.objects` in the `blog-media` bucket, cross-references with `blog_media.file_url`, returns paths not found in DB.
- **Delete action:** Accepts `{ paths: string[] }` to remove orphaned files. Logs each deletion to `admin_audit_log`.

---

## 8. Analytics Events

| Event | Trigger | Properties |
|-------|---------|-----------| 
| `media_uploaded` | File upload completes | `file_type`, `file_size`, `folder`, `has_alt_text` |
| `media_deleted` | Admin confirms deletion | `file_id`, `usage_count`, `forced` (deleted despite usage) |
| `media_inserted_to_post` | Image picked from MediaPickerModal | `file_id`, `post_id`, `has_alt_text` |
| `media_orphans_found` | Find Orphans runs | `orphan_count`, `total_bytes_orphaned` |
| `media_orphans_deleted` | Admin deletes orphans | `deleted_count`, `bytes_recovered` |
| `media_folder_navigated` | Admin clicks folder in nav | `folder` |

---

## 9. Implementation Checklist

### Phase 1 — Schema & Migration
- [ ] Write `20260501000000_media_library_v2.sql` with new columns, indexes, trigger, back-fill.
- [ ] Update TypeScript types (`blog_media` Row/Insert/Update) to include new columns.
- [ ] Verify trigger fires correctly on post insert and update.

### Phase 2 — Upload Enhancements
- [ ] Add SVG to allowed types in `uploadFiles()` (frontend + storage bucket MIME policy).
- [ ] Add folder dropdown to upload zone. Default = `blog`.
- [ ] Add alt text required field before upload commit. Disable Upload button if blank.
- [ ] Read and store image dimensions (`width`, `height`) before DB insert.
- [ ] Update storage path to include folder prefix: `{folder}/{timestamp}-{random}.{ext}`.

### Phase 3 — Library UI
- [ ] Add folder sidebar nav with counts to `AdminMediaLibrary.tsx`.
- [ ] Add Sort dropdown (Newest / Oldest / Largest / Smallest / Most Used).
- [ ] Add usage badge on asset cards (click → popover with post list).
- [ ] Implement deletion guard when `usage_count > 0` — show affected posts.
- [ ] Fetch and display storage quota widget in header (`get-storage-stats` function).
- [ ] Add "Find Orphans" button → modal with orphan list and delete actions.

### Phase 4 — Asset Detail Sheet
- [ ] Show dimensions in detail sheet.
- [ ] Show "Used in N posts" list with links.
- [ ] Add folder reassignment dropdown.
- [ ] Add tags input (free-form, stored in `blog_media.tags`).
- [ ] Add "Copy as Markdown" button.

### Phase 5 — MediaPickerModal Upgrade
- [ ] Add in-modal upload zone (compact, defaults to `blog` folder).
- [ ] Implement pagination (24 per page, "Load more").
- [ ] Show alt text badge on each tile (`✓ Alt` / `⚠ No alt`).
- [ ] Add alt text enforcement warning on select (for images with no alt).
- [ ] Add folder pill filter row at top of picker.

### Phase 6 — Edge Functions
- [ ] Create `get-storage-stats` Edge Function.
- [ ] Create `find-media-orphans` Edge Function (list + delete modes).
- [ ] Log orphan deletions to `admin_audit_log`.

### Phase 7 — Analytics
- [ ] Instrument all events listed in Section 8.

---

## 10. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should the storage path migration rename existing files to include folder prefix, or only apply to new uploads? | Engineering | Open — recommend new uploads only; existing paths remain valid |
| Q2 | Should `find-media-orphans` be restricted to `superadmin` only, or available to `admin` role too? | Product | Open — recommend `superadmin` only for safety |
| Q3 | Should the usage count trigger use a junction table (`blog_post_media`) instead of a LIKE match? | Engineering | Open — LIKE match is acceptable for v1 given low post volume; revisit at 500+ posts |
| Q4 | Should alt text enforcement in MediaPickerModal be a hard block or a soft warning ("Insert anyway")? | Product | Open — recommend soft warning for v1 to avoid blocking existing workflows |
| Q5 | Should brand assets and OG images be in a separate Supabase Storage bucket from blog images? | Engineering | Open — recommend single bucket with folder prefix for simplicity; separate bucket if access policies diverge |
| Q6 | Should `get-storage-stats` show a "% of plan quota used" bar, or just raw numbers? | Product | Open — raw numbers for v1 since quota limit is plan-dependent and not queryable from DB |
| Q7 | Should admins be able to create custom folders, or are the 4 predefined folders sufficient? | Product | Open — predefined folders sufficient for v1; custom folder creation in v2 |
