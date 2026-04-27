# PRD 11 — Marketplace Catalog & Store Configuration

**Document status:** Draft  
**Author:** Product  
**Last updated:** 2026-04-27  
**Related PRDs:** 05 (Product Linking & Affiliate System), 09 (Plans, Limits, Paywalls), 10 (Admin Dashboard & RBAC)

---

## 1. Overview

The Marketplace Catalog & Store Configuration system is the operational backbone that determines *which stores are shown to users* and *which products are matched to AI gift recommendations*. It manages two distinct but tightly coupled data sets:

- **`marketplace_config`** — The store registry. One row per store per country. Controls which stores appear, in what order, with which affiliate tag, and for which product categories.
- **`marketplace_products`** — The curated product catalog. One row per product. Matched against AI gift concepts by a scoring algorithm in `search-products` (and mirrored in the client-side `simulateMarketplacePreview` utility).

PRD 05 defined this system's Phase 1 architecture and identified Phase 2 work. **This PRD documents what was built in Phase 2**, introduces the new **Affiliate Variants** feature (A/B testing of affiliate tags), and defines the remaining work for Phase 3.

### What was delivered in Phase 2

| Feature | Status |
|---|---|
| Products Tab in `AdminMarketplaces.tsx` — full CRUD UI for `marketplace_products` | ✅ Shipped |
| CSV import (with required-header validation + row-level errors) | ✅ Shipped |
| CSV export for both stores and products | ✅ Shipped |
| Stale product detection (`staleDays` badge) | ✅ Shipped |
| Product Preview Tool (`simulateMarketplacePreview`) | ✅ Shipped |
| `admin_product_catalog_health` DB view + types wired into admin UI | ✅ Shipped |
| `affiliate_network` and `notes` columns on `marketplace_config` | ✅ Shipped |
| **Affiliate Variants** — weighted A/B testing of affiliate params | ✅ Shipped |
| Rate-limiting RLS policy on `product_clicks` | ✅ Shipped |
| `country` field fix in `product_clicks` (ISO code, not TLD) | ✅ Shipped |

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Give non-engineer GiftMind staff full control over both the store registry and product catalog without SQL access. |
| G2 | Enable A/B testing of affiliate parameters to optimise commission revenue per store. |
| G3 | Surface catalog health signals (stale products, OOS rate, enrichment coverage) proactively so ops can act before users are affected. |
| G4 | Provide a client-side product preview tool so admins can verify scoring before publishing. |
| G5 | Keep the admin surface RBAC-gated: `admin` role can manage stores and products; `superadmin` can also delete stores. |

### Non-goals

- Affiliate network API integrations (Amazon PA-API, Rakuten, Impact) — these are Phase 3.
- Automated stock/price refresh from affiliate feeds — Phase 3.
- User-facing storefront configuration (store branding, featured products pages) — out of scope.
- Multi-tenant marketplace (different store sets per user segment) — not planned.

---

## 3. Feature Surface — Current State

The admin marketplace surface lives at a single route: **`/admin/marketplaces`** (`AdminMarketplaces.tsx`).

### 3.1 Tab Structure

```
/admin/marketplaces
  ├── Stores Tab  (default)
  │   ├── Country navigation (hash-based: #IN, #US, #GB, …)
  │   ├── Store cards (inline editing)
  │   ├── Add Store dialog
  │   ├── Bulk activate / deactivate
  │   ├── Test Link / Test All Links
  │   ├── CSV export
  │   └── Click stats per store
  │
  └── Products Tab
      ├── Filter bar: Country, Store, Category, Status, Search
      ├── Product cards (inline edit/delete)
      ├── Add Product dialog
      ├── CSV import (with validation)
      ├── CSV export
      └── Load more (virtual pagination: 24/page)
```

### 3.2 RBAC

| Action | Viewer | Admin | Superadmin |
|--------|--------|-------|------------|
| View stores/products | ✅ | ✅ | ✅ |
| Edit store config | ❌ | ✅ | ✅ |
| Toggle store active/inactive | ❌ | ✅ | ✅ |
| Add store | ❌ | ✅ | ✅ |
| **Delete store** | ❌ | ❌ | ✅ |
| Add/edit product | ❌ | ✅ | ✅ |
| Deactivate product | ❌ | ✅ | ✅ |
| Delete product | ❌ | ❌ | ✅ |
| CSV import | ❌ | ✅ | ✅ |
| CSV export | ❌ | ✅ | ✅ |
| Run preview tool | ❌ | ✅ | ✅ |

Enforced via the `useCanDo('marketplaces.write')` hook (PRD 10) and RLS policies on `marketplace_config` and `marketplace_products`.

---

## 4. Store Configuration System (`marketplace_config`)

### 4.1 Schema (Current)

```sql
CREATE TABLE public.marketplace_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            text NOT NULL,                     -- e.g. "amazon_in"
  store_name          text NOT NULL,                     -- e.g. "Amazon.in"
  domain              text NOT NULL,                     -- e.g. "amazon.in"
  country_code        text NOT NULL DEFAULT 'GLOBAL',    -- ISO 2-char or "GLOBAL"
  search_url          text NOT NULL,                     -- prefix or {keyword} pattern
  affiliate_param     text,                              -- default affiliate param
  affiliate_variants  jsonb,                             -- A/B variant array (see §5)
  affiliate_network   text,                              -- 'amazon_associates' | 'impact' | …
  brand_color         text,                              -- e.g. "#FF9900"
  categories          text[],                            -- empty = all categories
  priority            integer NOT NULL DEFAULT 1,        -- lower = shown first
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,                              -- internal ops notes
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

**Key constraints:**
- `store_id` + `country_code` must be unique (enforced by application; no DB UNIQUE constraint yet — see §11 open questions).
- `affiliate_network` is validated at the application layer against the enum list in `AFFILIATE_NETWORK_OPTIONS`.
- `categories` being empty (`{}`) means the store accepts all gift category types.

### 4.2 Supported Countries

| Code | Country | Stores target | GLOBAL fallback? |
|------|---------|---------------|-----------------|
| `IN` | India | 12+ | No — full coverage |
| `US` | USA | 8+ | No — full coverage |
| `GB` | UK | 8+ | No — full coverage |
| `AE` | UAE | 4+ | Yes if < 4 active |
| `FR` | France | 4+ | Yes if < 4 active |
| `DE` | Germany | 4+ | Yes if < 4 active |
| `IT` | Italy | 3+ | Yes |
| `ES` | Spain | 3+ | Yes |
| `NL` | Netherlands | 3+ | Yes |
| `CA` | Canada | 4+ | Yes if < 4 active |
| `AU` | Australia | 4+ | Yes if < 4 active |
| `SG` | Singapore | 4+ | Yes |
| `GLOBAL` | Global Fallback | — | Source of last resort |

Admin dashboard shows an alert when **total active stores < 60** (current target). The 60-store threshold exists because the main countries (IN, US, GB) need depth at 3+ plan tiers, and the long-tail countries need at least 2 active stores to avoid always falling back to GLOBAL.

### 4.3 Store Priority & Plan Gating

```
Stores sorted by priority ASC within each country.
Plan limits determine how many stores a user can see:

  spark / pro  →  all stores (no limit — STORE_LIMITS currently set to 99)

  [NOTE: The current STORE_LIMITS in marketplaceMatching.ts only defines
  'spark' and 'pro' at 99. Locked store logic operates in the Edge Function,
  not the client-side preview. See §11 open question Q1.]
```

**Store card priority order (canonical):**
- `priority 1` — Primary marketplace (Amazon, main local platform)
- `priority 2` — Secondary local store (Flipkart IN, John Lewis GB, etc.)
- `priority 3+` — Specialist stores (Myntra, Nykaa, Not On The High Street, etc.)

### 4.4 Admin UI — Store Cards

Each store in the `Stores` tab renders as an editable `StoreCard` component with inline field editing. Fields:

| Field | Input | Notes |
|---|---|---|
| `store_name` | Text | Displayed to users |
| `domain` | Text | Used for brand display + country derivation |
| `search_url` | URL | Base search URL; `{keyword}` placeholder supported |
| `affiliate_param` | Text | Default affiliate tag (e.g. `&tag=giftmind-21`) |
| `affiliate_variants` | JSON textarea | Array of variant objects (see §5) |
| `affiliate_network` | Select | From `AFFILIATE_NETWORK_OPTIONS` enum |
| `brand_color` | Text (hex) | Used for store badge pill |
| `categories` | Tag input | Empty = all |
| `priority` | Number | Lower = shown first |
| `is_active` | Toggle | Instant DB write |
| `notes` | Textarea | Internal ops only; not shown to users |

**Save behaviour:** Each `StoreCard` tracks dirty state by comparing current values against the original DB row. The Save button appears only when changes exist and reverts on cancel.

**Audit logging:** Saves call `logAdminAction({ action: 'update_marketplace', ... })` (PRD 10).

### 4.5 Test Link / Test All Links

- **Test Link (per store):** Opens `buildPreviewUrl(store)` in a new tab. Uses the keyword "birthday gift" and a synthetic identity seed `"manual-preview"`, which selects the first variant if `affiliate_variants` is set.
- **Test All Links:** Iterates every active store in the current country tab, fetches the store domain's favicon via `https://www.google.com/s2/favicons?domain={domain}&sz=32`, and classifies each as `working` / `manual` (favicon fetch failed — inconclusive) / `unreachable`. Results persist to `localStorage` keyed by `gm_marketplace_tests` so the last test timestamps survive page reloads.

### 4.6 Bulk Operations

Available for stores in the currently-selected country tab:
- **Bulk Activate** — sets `is_active = true` on all stores in the tab.
- **Bulk Deactivate** — sets `is_active = false` on all stores in the tab.

Both require `admin` role and are confirmed via `AlertDialog`. Audit logged as `update_marketplace`.

### 4.7 Add Store Dialog

Fields: `store_id`, `store_name`, `domain`, `search_url`, `affiliate_param`, `brand_color`, `priority`, `categories`, `notes`, `affiliate_network`, `affiliate_variants`.

**Validation:**
- `store_id` — lowercase letters/numbers/underscores only, 2–50 chars.
- `search_url` — must start with `https://`.
- `brand_color` — must be valid 6-digit hex or empty.
- `categories` — each tag must match an entry in `CATEGORY_SUGGESTIONS` or be a free-form string ≤ 50 chars.
- `affiliate_variants` — must be valid JSON (parsed by `parseAffiliateVariantsInput`).
- **Duplicate check:** queries `marketplace_config` for existing `store_id` + `country_code` and blocks if found.

### 4.8 CSV Export (Stores)

Exports all stores across all countries. Columns:
`store_id, store_name, domain, country_code, search_url, affiliate_param, affiliate_network, brand_color, priority, categories, is_active, notes, created_at`

`affiliate_variants` is excluded from the CSV export (JSON complexity; edit via the admin UI directly).

---

## 5. Affiliate Variants — A/B Testing Affiliate Tags

### 5.1 Problem

GiftMind has a single `affiliate_param` per store (e.g. `&tag=giftmind-21`). This makes it impossible to:
- Test different Amazon Associate tag IDs to understand conversion differences.
- Run campaigns with tagged params (e.g. `&tag=giftmind-xmas26`) without replacing the default.
- Weight traffic split between tags (e.g. 80% production tag, 20% experiment).

### 5.2 Solution — `affiliate_variants` JSON Column

`marketplace_config.affiliate_variants` accepts a JSON array of variant objects:

```json
[
  { "param": "&tag=giftmind-21",    "weight": 8, "label": "Production"  },
  { "param": "&tag=giftmind-test",  "weight": 2, "label": "Experiment A" }
]
```

**Fields per variant:**

| Field | Type | Required | Description |
|---|---|---|---|
| `param` | string | ✓ | The full affiliate query string to append |
| `weight` | number | — | Relative selection weight (default: 1) |
| `label` | string | — | Internal label shown in admin |

**Selection algorithm (`pickAffiliateParam`):**

Variants are selected deterministically per user session using a weighted hash:

```typescript
// src/lib/marketplaceMatching.ts
export function pickAffiliateParam(store: MarketplaceStoreLike, identitySeed?: string | null) {
  const variants = normalizeAffiliateVariants(store.affiliate_variants);
  if (variants.length === 0) {
    return store.affiliate_param || null;  // falls back to default param
  }

  const totalWeight = variants.reduce((sum, v) => sum + Math.max(1, v.weight ?? 1), 0);
  const bucket = hashSeed(`${identitySeed ?? "anonymous"}:${store.store_id}`) % totalWeight;

  let cursor = 0;
  for (const variant of variants) {
    cursor += Math.max(1, variant.weight ?? 1);
    if (bucket < cursor) return variant.param;
  }
  return variants[0].param;
}
```

`identitySeed` is the user's ID in production (passed from `search-products` Edge Function), giving each user a consistent assignment for the duration of their session. Anonymous previews use `"manual-preview"` as the seed.

**Fallback chain:**
1. If `affiliate_variants` is non-empty and valid → use weighted selection.
2. If `affiliate_variants` is empty / null / invalid → use `affiliate_param`.
3. If both are absent → no affiliate tag appended.

### 5.3 Admin UI for Affiliate Variants

In the `StoreCard`, the `affiliate_variants` field is a JSON textarea with inline validation. Format help text shown below the field:

```
[{"param":"&tag=gm-21","weight":8},{"param":"&tag=gm-test","weight":2}]
```

Validation (via `parseAffiliateVariantsInput`):
- Must be valid JSON.
- Must be an array.
- Each entry must have a non-empty `param` field.
- `weight` must be a positive finite number if present.

If variants are set, the "Test Link" button uses the first variant's param (sorted by array position, not weight) for the manual preview URL.

### 5.4 Tracking Attribution of Variants

**Current gap:** The `product_clicks` table records `product_url` (the full outbound URL including the affiliate param) but does not record *which variant was selected* as a structured field. This means variant performance can only be inferred by parsing the outbound URL in analytics queries — fragile and error-prone.

**Required (Phase 3):** Add a `affiliate_variant_label` column to `product_clicks`:

```sql
ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS affiliate_variant_label text DEFAULT NULL;
```

Populate it in `trackProductClick` by passing the label from `pickAffiliateParam`.

---

## 6. Product Catalog System (`marketplace_products`)

### 6.1 Schema

```sql
CREATE TABLE public.marketplace_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              text NOT NULL,
  country_code          text NOT NULL DEFAULT 'GLOBAL',
  product_title         text NOT NULL,
  product_url           text NOT NULL,
  affiliate_url         text,
  image_url             text,
  price_amount          numeric(10,2),
  price_currency        text,
  original_price_amount numeric(10,2),
  stock_status          text NOT NULL DEFAULT 'unknown'
    CHECK (stock_status IN ('in_stock','low_stock','out_of_stock','preorder','unknown')),
  delivery_eta_text     text,
  coupon_code           text,
  coupon_text           text,
  product_category      text,
  keyword_tags          text[] NOT NULL DEFAULT '{}',
  affiliate_source      text,
  attribution_label     text,
  is_affiliate          boolean NOT NULL DEFAULT true,
  priority              integer NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

**Indexes (applied):**
- `(store_id, country_code, is_active, priority)` — primary query path
- `(product_category)` — category filtering
- `USING gin (keyword_tags)` — keyword matching

### 6.2 Products Tab — Filter Bar

| Filter | Options | Default |
|---|---|---|
| Country | All countries + GLOBAL | Current country tab from Stores |
| Store | All stores + per-country list | All |
| Category | All + `CATEGORY_SUGGESTIONS` | All |
| Status | All / In Stock / Low Stock / Out of Stock / Preorder / Unknown | All |
| Search | Free-text match on product_title | — |

Filters are applied client-side against the full fetched product list (up to the current `visibleProductCount` window). Search is debounced 300ms.

### 6.3 Product Cards

Each product renders a `ProductCard` component with:
- Product image (48×48, object-fit cover, fallback placeholder)
- `product_title` (1-line truncated)
- Store badge + country badge
- Category badge
- Price display: `price_amount` in `price_currency`, original price strikethrough if `original_price_amount` set
- Stock badge (`in_stock` → green, `low_stock` → yellow, `out_of_stock` → red, `unknown` → muted)
- Delivery ETA + coupon code if present
- **Stale badge:** if `updated_at` is more than 30 days ago, shows "Stale: N days" in amber
- Edit / Deactivate / Delete actions (visibility gated by `useCanDo`)

**Stale threshold:** Products not updated in > 30 days are flagged stale (`staleDays(product.updated_at) > 30`). This is a soft visual signal only — no automated deactivation yet (Phase 3 gap).

### 6.4 Add/Edit Product Dialog

Full form matching the `marketplace_products` schema. Required fields validated before save:

| Field | Required | Validation |
|---|---|---|
| `store_id` | ✓ | Must match an existing active store in `marketplace_config` |
| `country_code` | ✓ | Must be a supported country code or `GLOBAL` |
| `product_title` | ✓ | Non-empty, ≤ 300 chars |
| `product_url` | ✓ | Must start with `https://` |
| `product_category` | ✓ | Must be a value from `CATEGORY_SUGGESTIONS` |
| `keyword_tags` | ✓ | Minimum 2 tags, maximum 20 |
| `stock_status` | ✓ | One of the 5 allowed values |
| `is_affiliate` | ✓ | Toggle, default true |
| `priority` | ✓ | Integer ≥ 0 |
| `is_active` | ✓ | Toggle, default true |

Optional: `affiliate_url`, `image_url`, `price_amount`, `price_currency`, `original_price_amount`, `delivery_eta_text`, `coupon_code`, `coupon_text`, `affiliate_source`, `attribution_label`.

**Keyword tags input:** Comma/semicolon-separated tag input. Tags are trimmed and deduplicated on save.

### 6.5 CSV Import

**Trigger:** "Import CSV" button in the Products tab header.

**Required headers:**
```
store_id, country_code, product_title, product_url, product_category, keyword_tags, stock_status
```

**Optional headers:** All remaining `marketplace_products` fields (same names as columns).

**`keyword_tags` format in CSV:** Semicolon-separated within a single cell: `merino;headband;running;wool`.

**Import flow:**
1. File selected → `parseCsv()` reads headers and rows.
2. Each row validated via `parseProductCsvRecord()`:
   - Missing required headers → entire import blocked with header list.
   - Row-level errors (invalid URL, unknown category, etc.) → row skipped, error collected.
3. **No dry-run mode currently** — valid rows are inserted immediately after validation. (Phase 3 gap — see §11 Q2.)
4. Summary shown: `N products imported, M rows skipped` with per-row error details.

**Import spec for external tools:**
```csv
store_id,country_code,product_title,product_url,product_category,keyword_tags,stock_status,price_amount,price_currency,image_url,affiliate_url,is_affiliate,priority
amazon_in,IN,"Smartwool Merino 150 Headband",https://amazon.in/dp/B0XXX,sports,merino;headband;running;wool,in_stock,42,USD,https://m.media-amazon.com/xxx.jpg,https://amazon.in/dp/B0XXX?tag=giftmind-21,true,0
```

### 6.6 CSV Export (Products)

Exports the currently-filtered product list. Columns:
`id, store_id, country_code, product_title, product_url, affiliate_url, image_url, price_amount, price_currency, original_price_amount, stock_status, delivery_eta_text, coupon_code, product_category, keyword_tags (semicolon-joined), affiliate_source, is_affiliate, priority, is_active, created_at, updated_at`

---

## 7. Product Preview Tool

### 7.1 Purpose

Lets admins simulate what the `search-products` Edge Function would return for a given gift concept — without running an actual gift flow. Essential for:
- Verifying a newly added product will be picked up.
- Debugging why a product isn't surfacing.
- Understanding score differences between catalog products and search-link fallbacks.

### 7.2 Preview Form

Accessible via a "Preview" button in the Products Tab header. Opens a dialog:

```
┌─ Product Match Preview ────────────────────────────────────────────────┐
│                                                                        │
│  Gift name:      [Merino Running Headband               ]              │
│  Keywords:       [merino, headband, running, wool        ]             │
│  Category:       [sports ▼]                                            │
│  Price anchor:   [42         ] (USD)                                   │
│  Budget:         [30  ] to  [75  ]                                     │
│  Country:        [IN ▼]                                                │
│  Plan:           [spark ▼]                                             │
│                                                                        │
│  [ Run Preview ]                                                       │
│                                                                        │
│  Results: (stores ordered by priority; catalog match shown if score>0) │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Amazon.in     Score: 67  Smartwool Merino 150 Headband  $42     │   │
│  │               Match reason: Top curated catalog match           │   │
│  │ Flipkart      Score:  0  [Search link: "merino headband"]       │   │
│  │               Match reason: Fallback to live search link        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  2 of 4 stores shown (spark plan). 2 locked stores not shown.         │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Implementation (`simulateMarketplacePreview`)

Lives in `src/lib/marketplaceMatching.ts`. Runs entirely client-side using data fetched from Supabase:

```typescript
// Called with stores + products already in memory from React Query cache
const result = simulateMarketplacePreview({
  stores,          // marketplace_config rows for target country
  products,        // marketplace_products rows for target country
  concept: {
    name: form.name,
    search_keywords: form.keywords.split(",").map(k => k.trim()),
    product_category: form.product_category,
    price_anchor: parseFloat(form.price_anchor),
  },
  targetCountry: form.country_code,
  budgetMin: parseFloat(form.budget_min),
  budgetMax: parseFloat(form.budget_max),
  userPlan: form.plan,
  identitySeed: null,  // anonymous preview
});
```

**`PreviewResult` shape:**

```typescript
interface PreviewResult {
  rows: PreviewRow[];             // one per accessible store
  total_stores_available: number;
  stores_shown: number;
  locked_store_count_total: number;
  is_global_fallback: boolean;
  target_country: string;
}

interface PreviewRow {
  store_id: string;
  store_name: string;
  domain: string;
  score: number;
  is_search_link: boolean;
  product_title: string | null;   // null if search link
  price_amount: number | null;
  stock_status: StockStatus | null;
  keyword: string;
  match_reason: string;
}
```

**Alignment with Edge Function:** The preview uses the same `scoreProductMatch` function as the `search-products` Edge Function (copied into `marketplaceMatching.ts`). Any changes to the scoring algorithm must be kept in sync between both locations. See §11 Q3.

---

## 8. Catalog Health Dashboard

### 8.1 DB View — `admin_product_catalog_health`

```sql
CREATE OR REPLACE VIEW public.admin_product_catalog_health AS
SELECT
  mp.store_id,
  mc.store_name,
  mp.country_code,
  mp.product_category,
  COUNT(*)                                                 AS total_products,
  COUNT(*) FILTER (WHERE mp.stock_status = 'in_stock')    AS in_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'out_of_stock') AS out_of_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'unknown')      AS unknown_stock,
  COUNT(*) FILTER (WHERE mp.image_url IS NOT NULL)         AS has_image,
  COUNT(*) FILTER (WHERE mp.affiliate_url IS NOT NULL)     AS has_affiliate_url,
  MAX(mp.updated_at)                                       AS last_updated
FROM public.marketplace_products mp
LEFT JOIN public.marketplace_config mc
  ON mc.store_id = mp.store_id AND mc.country_code = mp.country_code
WHERE mp.is_active = true
GROUP BY mp.store_id, mc.store_name, mp.country_code, mp.product_category
ORDER BY mp.country_code, mp.store_id, mp.product_category;
```

RLS: view is read-only, secured at the row level via the `admin_product_catalog_health` type definition. Only accessible to authenticated users with an admin role.

### 8.2 Current State — Health Data is Available But Not Surfaced

The `CatalogHealthRow` type from `admin_product_catalog_health` is typed and imported in `AdminMarketplaces.tsx`, but **no dedicated health dashboard UI has been built yet**. The data is available via React Query but is only used for internal state.

**Phase 3 requirement: Build a "Health" tab in `AdminMarketplaces.tsx`**

### 8.3 Health Tab — Spec (Phase 3)

```
┌─ Catalog Health ──────────────────────────────────────────────────────┐
│                                                                       │
│  Summary cards:                                                       │
│  [Total Products: 412] [In Stock: 351 (85%)] [OOS: 28 (7%)]         │
│  [No Image: 82]        [No Affiliate URL: 54] [Stale (>30d): 16]    │
│                                                                       │
│  Filter: [Country ▼] [Store ▼]                                       │
│                                                                       │
│  By store × category table:                                           │
│  Store         Country  Category    Total  In Stock  OOS  Last Sync  │
│  ─────────────────────────────────────────────────────────────────── │
│  Amazon.in     IN       sports      14     12        0    2 days ago │
│  Amazon.in     IN       fashion     8      6         2    14 days ago│
│  Flipkart      IN       electronics 5      5         0    45 days ago│  ← STALE
│                                                                       │
│  [Export Health Report CSV]                                           │
└───────────────────────────────────────────────────────────────────────┘
```

**Health alerts (automatic):**
- Row where `last_updated` > 30 days → row highlighted amber with "Stale" badge.
- Row where `out_of_stock / total > 0.3` (>30% OOS rate) → amber warning badge.
- Row where `has_affiliate_url / total < 0.5` (< 50% have affiliate URLs) → amber badge ("Low affiliate coverage").
- Row where `has_image / total < 0.5` (< 50% have images) → informational badge.

---

## 9. Database Schema — Remaining Migrations

### 9.1 Already Applied

| Migration | Description |
|---|---|
| `20260412120000_add_marketplace_products.sql` | Creates `marketplace_products` table + indexes |
| `20260420101500_recommendation_results_product_clicks.sql` | Adds rich columns to `product_clicks` |
| `20260423_product_clicks_rate_limit_rls.sql` | Rate-limiting RLS on `product_clicks` |
| `20260423_marketplace_config_enrichment.sql` | Adds `notes`, `affiliate_network` to `marketplace_config` |
| `20260423_product_catalog_health_view.sql` | Creates `admin_product_catalog_health` view |
| `20260426_marketplace_affiliate_variants.sql` | Adds `affiliate_variants` jsonb to `marketplace_config` |

### 9.2 Required — Phase 3

#### Track affiliate variant in click log

```sql
-- FILE: 20260501_product_clicks_affiliate_variant.sql
ALTER TABLE public.product_clicks
  ADD COLUMN IF NOT EXISTS affiliate_variant_label text DEFAULT NULL;

COMMENT ON COLUMN public.product_clicks.affiliate_variant_label IS
  'Label of the affiliate_variants entry selected for this click. NULL if default affiliate_param was used.';
```

#### Unique constraint on store_id + country_code

```sql
-- FILE: 20260501_marketplace_config_unique_store_country.sql
ALTER TABLE public.marketplace_config
  ADD CONSTRAINT marketplace_config_store_country_unique
  UNIQUE (store_id, country_code);
```

#### Auto-stale deactivation

Supabase CRON job (daily at 02:00 UTC) that deactivates products stuck in `out_of_stock` for > 48 hours:

```sql
-- Scheduled via pg_cron (enabled in Supabase):
SELECT cron.schedule(
  'deactivate-stale-oos-products',
  '0 2 * * *',
  $$
    UPDATE public.marketplace_products
    SET is_active = false,
        updated_at = now()
    WHERE stock_status = 'out_of_stock'
      AND is_active = true
      AND updated_at < now() - INTERVAL '48 hours';
  $$
);
```

---

## 10. `search-products` Edge Function — Alignment

### 10.1 Scoring Algorithm Sync

The `scoreProductMatch` function exists in two places:
1. `supabase/functions/search-products/index.ts` — production path.
2. `src/lib/marketplaceMatching.ts` — client-side preview.

These must remain identical. Any scoring change (weights, new signal, penalty) must be applied to both files simultaneously.

**Recommended (Phase 3):** Extract the scoring algorithm into a shared module consumed by both the Edge Function and the client. Currently not possible due to Deno/browser module boundary — evaluate a shared `scoring.ts` file that can be imported in both contexts via an import map.

### 10.2 `affiliate_variants` in Edge Function

The `search-products` Edge Function must call `pickAffiliateParam(store, userId)` when constructing affiliate URLs for enriched products and search links. Verify this is wired correctly whenever `buildSearchUrl` is called in the Edge Function. The client-side `buildSearchUrl` in `marketplaceMatching.ts` already calls `pickAffiliateParam` correctly.

### 10.3 CORS Restriction

`Access-Control-Allow-Origin: *` in `search-products` must be scoped to `https://giftmind.in` in production. A TODO comment exists in the code. This is a security hardening item, not a feature — schedule as part of the next Edge Function deploy.

---

## 11. Implementation Checklist

### Phase 2 (Shipped — documented here)
- [x] Products Tab in `AdminMarketplaces.tsx` — CRUD, filters, load more.
- [x] CSV import with row-level validation.
- [x] CSV export (products + stores).
- [x] Stale product detection (visual badge).
- [x] Product Preview Tool (`simulateMarketplacePreview`).
- [x] `affiliate_variants` column + `pickAffiliateParam` weighted selection.
- [x] `affiliate_network` and `notes` columns on `marketplace_config`.
- [x] `admin_product_catalog_health` view + TypeScript types.
- [x] Rate-limiting RLS on `product_clicks`.
- [x] `country` field fix in `product_clicks` (ISO code).

### Phase 3 (Not Started)
- [ ] Catalog Health Tab in `AdminMarketplaces.tsx` (uses `admin_product_catalog_health` view).
- [ ] Health summary cards + stale/OOS/coverage alert badges.
- [ ] `affiliate_variant_label` column on `product_clicks`.
- [ ] Populate `affiliate_variant_label` in `trackProductClick`.
- [ ] Unique constraint migration: `(store_id, country_code)` on `marketplace_config`.
- [ ] Auto-stale OOS deactivation CRON job.
- [ ] CSV import dry-run mode (validate and preview before inserting).
- [ ] Restrict `Access-Control-Allow-Origin` in `search-products` Edge Function.
- [ ] Scoring algorithm shared module (evaluate feasibility).

### Phase 4 — Affiliate Network Integration (V2)
- [ ] Amazon PA-API product sync Edge Function (`sync-amazon-products`).
- [ ] Affiliate conversion webhook endpoint (`webhook-affiliate-event`).
- [ ] `affiliate_conversions` table.
- [ ] Scheduled price/stock refresh via CRON.

---

## 12. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | `STORE_LIMITS` in `marketplaceMatching.ts` only defines `spark` (99) and `pro` (99). The Edge Function applies the real plan-based limits. Should the client-side preview also apply plan-based store counts to show locked stores in the preview? | Engineering | Open |
| Q2 | CSV import dry-run: should we show a diff preview before committing, or is the current "import and report errors" flow sufficient for ops? | Product | Open |
| Q3 | Scoring algorithm duplication: until a shared module is feasible, add a unit test that imports both the Edge Function scorer and `marketplaceMatching.ts` scorer and asserts identical output for the same inputs. Who owns this? | Engineering | Open |
| Q4 | Should the Catalog Health Tab show a "last synced from affiliate network" timestamp once Phase 4 syncs are live, or is `last_updated` sufficient? | Product | Open |
| Q5 | `affiliate_variants` test link always picks variant index 0. Should the Test Link let the admin pick a specific variant to test? | Product | Open |
| Q6 | Should `affiliate_variant_label` be added to `admin_audit_log` payloads for `update_marketplace` actions, or is it sufficient to track it in `product_clicks`? | Engineering | Open |

---

## Appendix A — Store ID Conventions

Store IDs: lowercase letters, numbers, underscores only. Pattern: `{store}_{country_code}` for country-specific, `{store}` for global/single-country platforms.

| Store ID | Store | Country |
|---|---|---|
| `amazon_in` | Amazon India | IN |
| `amazon_us` | Amazon US | US |
| `amazon_gb` | Amazon UK | GB |
| `flipkart` | Flipkart | IN |
| `myntra` | Myntra | IN |
| `nykaa` | Nykaa | IN |
| `john_lewis` | John Lewis | GB |
| `noon_ae` | Noon | AE |

## Appendix B — Affiliate Network Enum

Valid values for `marketplace_config.affiliate_network`:

| Value | Network |
|---|---|
| `amazon_associates` | Amazon Associates |
| `flipkart_affiliate` | Flipkart Affiliate Program |
| `impact` | Impact (formerly Impact Radius) |
| `rakuten` | Rakuten Advertising |
| `admitad` | Admitad |
| `cj_affiliate` | Commission Junction (CJ) |
| `direct` | Direct deal / no network |
| `other` | Other / unlisted |

## Appendix C — Related PRDs

| PRD | Relevance |
|---|---|
| PRD 05 — Product Linking & Affiliate System | Architecture, search-products Edge Function, Phase 1 & 2 history |
| PRD 04 — Recommendation Results Experience | How `ProductLinks.tsx` renders catalog products |
| PRD 09 — Plans, Limits, Paywalls | Defines plan tiers and store-count gating |
| PRD 10 — Admin Dashboard & RBAC | RBAC roles, `useCanDo`, audit log hooks used here |
