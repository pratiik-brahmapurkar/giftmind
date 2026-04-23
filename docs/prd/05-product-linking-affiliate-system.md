# PRD 05 — Product Linking & Affiliate System
**Feature name (internal):** Product Linking & Affiliate System  
**User-facing name:** Buy from [Store]  
**Owner:** Product / Engineering  
**Version:** 1.0  
**Status:** Phase 1 Shipped — Phase 2 Planning  
**Date:** 2026-04-23  

---

## Section 0: Phase 1 Audit — Current State

### 0.1 System Architecture (as-built)

The Product Linking & Affiliate System connects AI-generated gift recommendations to real, purchasable products. It operates as a three-layer pipeline:

```
Gift Recommendation (generate-gifts Edge Fn)
        │
        ▼
search-products Edge Fn
  ├── Reads: marketplace_config     → store registry (affiliate URLs, search patterns)
  ├── Reads: marketplace_products   → curated product catalog
  ├── Applies: plan-based STORE_LIMITS
  ├── Scores: products against gift concept keywords/budget
  └── Returns: ProductResult[] with locked_store placeholders
        │
        ▼
ProductLinks.tsx (frontend component)
  ├── Horizontal-scroll card list (snap-x)
  ├── Rich product cards (image, price, stock, coupon, delivery ETA)
  ├── Locked store placeholder cards → UpgradeModal
  ├── Cross-border geo banner
  └── Affiliate disclaimer text
        │
        ▼
trackProductClick (useGiftSession.ts hook)
  ├── Writes to: product_clicks table
  └── Opens: outbound URL (affiliate_url > product_url > search_url)
```

### 0.2 Database Tables

#### `marketplace_config` — The Store Registry

```sql
CREATE TABLE public.marketplace_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          text NOT NULL,                    -- e.g. "amazon_in", "flipkart"
  store_name        text NOT NULL,                    -- e.g. "Amazon.in"
  domain            text NOT NULL,                    -- e.g. "amazon.in"
  country_code      text NOT NULL DEFAULT 'GLOBAL',  -- ISO 2-char or "GLOBAL"
  search_url        text NOT NULL,                    -- base URL, keyword appended
  affiliate_param   text,                             -- e.g. "&tag=giftmind-21"
  brand_color       text,                             -- e.g. "#FF9900"
  categories        text[],                           -- gift categories this store supports (empty = all)
  priority          integer NOT NULL DEFAULT 1,       -- lower = shown first
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

**Key design decisions:**
- `country_code = 'GLOBAL'` acts as fallback if no stores exist for recipient's country
- `categories` being empty means the store accepts all gift types
- `affiliate_param` is appended verbatim to the search URL (e.g. `&tag=giftmind-21`)
- No `{keyword}` placeholder patterns currently in production; `search_url` is treated as a prefix with keyword appended directly

#### `marketplace_products` — The Curated Catalog

```sql
CREATE TABLE public.marketplace_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              text NOT NULL,
  country_code          text NOT NULL DEFAULT 'GLOBAL',
  product_title         text NOT NULL,
  product_url           text NOT NULL,             -- direct product page
  affiliate_url         text,                      -- affiliate-wrapped product URL
  image_url             text,
  price_amount          numeric(10,2),
  price_currency        text,
  original_price_amount numeric(10,2),             -- for discount display
  stock_status          text NOT NULL DEFAULT 'unknown'
    CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'preorder', 'unknown')),
  delivery_eta_text     text,                      -- e.g. "2-3 days"
  coupon_code           text,
  coupon_text           text,                      -- e.g. "10% off with GIFT10"
  product_category      text,
  keyword_tags          text[] NOT NULL DEFAULT '{}',
  affiliate_source      text,                      -- e.g. "Amazon Associates"
  attribution_label     text,                      -- displayed to user
  is_affiliate          boolean NOT NULL DEFAULT true,
  priority              integer NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `(store_id, country_code, is_active, priority)` — primary query filter
- `(product_category)` — category filtering
- `USING gin (keyword_tags)` — full-text keyword matching

#### `product_clicks` — Click Attribution Ledger

```sql
CREATE TABLE public.product_clicks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  session_id               uuid REFERENCES public.gift_sessions(id) ON DELETE SET NULL,
  recipient_id             uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  gift_concept_name        text,
  recommendation_index     integer CHECK (recommendation_index IS NULL OR recommendation_index BETWEEN 0 AND 2),
  recommendation_confidence integer,
  store                    text,                    -- legacy: store_id
  store_id                 text,                    -- new field
  store_name               text,                    -- human-readable store name
  product_title            text,
  product_url              text,                    -- the outbound URL opened
  country                  text,
  estimated_price          numeric,
  is_search_link           boolean DEFAULT true,
  clicked_from             text DEFAULT 'results_screen',
  clicked_at               timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `(user_id, clicked_at DESC)` — user click history
- `(session_id)` — per-session analytics
- `(store_name, country)` — store performance by geo
- `(recipient_id)` — per-recipient click history

### 0.3 Edge Function: `search-products/index.ts`

The `search-products` function is the core of the system. Called by `useGiftSession.ts:searchProducts()` immediately after AI returns recommendations.

**Request shape:**
```typescript
interface SearchRequest {
  gift_concepts: GiftConcept[];    // up to 10 concepts (in practice: 3)
  recipient_country?: string | null;
  user_country?: string | null;
  currency: string;
  budget_min: number;
  budget_max: number;
  user_plan: string;               // server reads from DB, not this field
}

interface GiftConcept {
  name: string;                    // e.g. "Merino Running Headband"
  search_keywords: string[];       // from AI response
  product_category: string;        // e.g. "sports"
  price_anchor: number;            // AI's expected price in USD
}
```

**Response shape:**
```typescript
interface SearchResponse {
  success: boolean;
  target_country: string;
  results: GiftResult[];             // one per gift concept
  enriched_products_returned: number; // count of non-search-link products
  total_stores_available: number;
  stores_shown: number;
  is_cross_border: boolean;
  server_plan: string;
}

interface GiftResult {
  gift_name: string;
  products: ProductLink[];          // accessible stores (max = STORE_LIMITS[plan])
  locked_stores: LockedStore[];     // up to 3 locked store placeholders
}
```

**Plan-based store limits (STORE_LIMITS):**

| Plan         | Stores Shown | Comment                        |
|---|---|---|
| `spark`      | 1            | Amazon/top-priority store only |
| `thoughtful` | 2            | Amazon + 1 local store         |
| `confident`  | 99 (all)     | All stores for country         |
| `gifting-pro`| 99 (all)     | All stores for country         |

**Scoring algorithm (`scoreProduct`):**
```
Score components:
+ 14 pts — phrase match in product_title
+ 10 pts — phrase match in keyword_tags
+ 4 pts  — token match in product_title
+ 3 pts  — token match in keyword_tags
+ 10 pts — exact product_category match
+ 4 pts  — country_code == targetCountry
+ 12 pts — price_amount within budget range
+ 0-8 pts— proximity to price_anchor (inverse of distance)
+ 6 pts  — stock_status == 'in_stock'
+ 3 pts  — stock_status == 'low_stock'
+ 1 pt   — stock_status == 'preorder'
- 20 pts — stock_status == 'out_of_stock'
- 10 pts — price_amount outside budget range
```

If top score > 0 → return enriched product card (with image, price, etc.)  
If no matching product → return search link (uses `buildSearchUrl()` to construct affiliate search URL)

**Country resolution logic:**
```
target_country = recipient_country || user_country || 'US'
is_cross_border = recipient_country && user_country && recipient_country !== user_country
```
Store lookup: tries recipient's country first, falls back to `GLOBAL` if no stores found.

### 0.4 Frontend Components

#### `src/lib/productLinks.ts` — Shared Types

```typescript
export interface ProductLink {
  store_id: string;
  store_name: string;
  domain: string;
  brand_color: string | null;
  gift_name: string;
  product_category: string;
  is_search_link: boolean;
  search_url?: string | null;
  product_url?: string | null;
  affiliate_url?: string | null;
  product_title?: string | null;
  image_url?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  original_price_amount?: number | null;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock" | "preorder" | "unknown" | null;
  delivery_eta_text?: string | null;
  coupon_code?: string | null;
  coupon_text?: string | null;
  affiliate_source?: string | null;
  attribution_label?: string | null;
  is_affiliate?: boolean | null;
}

export function getOutboundProductUrl(product: ProductLink) {
  return product.affiliate_url || product.product_url || product.search_url || "";
}
```

#### `src/components/gift-flow/ProductLinks.tsx` — Product Card List

Current state: horizontal-scroll card list with `snap-x snap-mandatory`. Cards are `min-w-[260px]`. Built.

Rich card elements:
- **Store badge** — brand_color pill with store name
- **Affiliate badge** — "Affiliate" or attribution_label badge (outline variant)
- **Product image** — 112px height, lazy loaded, shows if `image_url` present
- **Product title** — 2-line clamp
- **Price/Stock/Delivery** — nested info box: price, original (strikethrough), stock badge, delivery ETA badge
- **Coupon badge** — emerald badge with TicketPercent icon
- **CTA** — "View on [Store]" or "Browse on [Store]" inline link with ExternalLink icon
- **Affiliate note** — tiny text below CTA: `affiliate_source` or "Affiliate-enabled link"

Locked store card:
- Muted, 80% opacity, `cursor-pointer`
- Brand color pill (70% opacity)
- Lock icon + upgrade text
- Click → UpgradeModal (with `highlightPlan="confident"`)

Cross-border geo banner:
- Shown when `recipient_country !== user_country`
- Sky-200 border, Globe2 icon, "Showing stores that make sense for [country] [flag]"

"X more stores on Confident" tease:
- Rendered below the card scroll when `lockedStores.length > 0`

#### `src/components/AffiliateDisclaimer.tsx`

Standalone component. One sentence with Info icon:
> Prices shown are approximate and may vary. GiftMind may earn a small commission on purchases made through these links, at no extra cost to you.

Currently used inline in ProductLinks. Simple and correct.

#### `src/hooks/useGiftSession.ts:trackProductClick()`

Click tracking + outbound navigation in one function:
1. Resolves outbound URL: `affiliate_url > product_url > search_url`
2. Inserts row into `product_clicks` with all enriched fields
3. Calls `window.open(outboundUrl, "_blank", "noopener,noreferrer")`

Fields written: `user_id`, `session_id`, `recipient_id`, `gift_concept_name`, `recommendation_index`, `recommendation_confidence`, `product_title`, `product_url` (outbound), `store`, `store_id`, `store_name`, `country` (derived from domain TLD), `estimated_price`, `is_search_link`, `clicked_from`

**Note:** `product_title` falls back to `store_name` if null — this means search-link clicks are logged with the store name as the "product title," which is misleading in analytics.

### 0.5 Admin: `AdminMarketplaces.tsx`

Full-featured admin UI for managing `marketplace_config`. Located at `/admin/marketplaces`.

Features:
- Country-tab navigation via URL hash (`#IN`, `#US`, `#GB`, etc.)
- Per-store cards with inline editing: affiliate tag, search URL, brand color, priority, categories
- Active/Inactive toggle (immediate DB write)
- "Test Link" button — opens preview URL in new tab
- "Test All Links" — favicon-based domain reachability test for all stores in country
- Add Store dialog — full validation, duplicate check
- Bulk activate/deactivate by country
- CSV export of all stores
- Click stats (total + this month) per store from `product_clicks` table
- Alert when total store count < 60 (expected: 60+)

**Gap:** No UI to manage `marketplace_products` (the curated catalog). Only the store config is surfaced here.

### 0.6 Known Issues & Gaps

| # | Issue | Severity | Description |
|---|---|---|---|
| 1 | No `marketplace_products` admin UI | High | Curated product catalog can only be managed via direct SQL. Zero SEO visibility, no search/filter, no bulk upload. |
| 2 | `country` field derived incorrectly from domain TLD | Medium | `product.domain?.split(".").pop()` gives "in" or "com" — not ISO codes for analytics queries. Should use `recipient_country`. |
| 3 | `product_title` fallback to `store_name` | Medium | Search-link clicks log the store name as product_title, making analytics noisy. Should log "Search: [keyword]" format or null. |
| 4 | No rate-limiting on product clicks | Medium | `product_clicks_per_hour` is configurable in AdminSettings but enforcement is not verified in search-products or the click insert path. |
| 5 | Affiliate URL prioritized even for "View on…" non-affiliate products | Low | `is_affiliate: false` products still route through `affiliate_url` if set. Should respect `is_affiliate` flag. |
| 6 | No product catalog freshness signal | Medium | `marketplace_products` has `updated_at` but no stale-product alert in admin. Products with out-of-stock status lingering undetected. |
| 7 | `search_url` pattern support inconsistent | Low | Code handles `{keyword}` placeholder but no products in production use it. Undocumented for store operators. |
| 8 | No A/B testing support for affiliate tags | Low | Single `affiliate_param` per store. Cannot test multiple tags or campaigns. |
| 9 | Global fallback silent in UI | Low | When GLOBAL stores are shown instead of country-specific stores, no visual indicator to user or admin. |
| 10 | `locked_stores` slice is hardcoded to 3 | Low | `lockedStoreSource.slice(0, 3)` — if a country has 5+ locked stores, only 3 are shown. No disclosure. |
| 11 | Budget indicator shows `price_anchor` not actual product price | Medium | `BudgetBadge` (per PRD 04) shows AI's `price_anchor`; actual catalog product price may differ. |
| 12 | No webhook/API to sync product catalog from affiliate networks | High | All product data is manually inserted. No Rakuten, Impact, or Amazon PA-API integration. Catalog will go stale. |

---

## Section 1: Overview

### 1.1 Feature Description

The Product Linking & Affiliate System is the bridge between GiftMind's AI recommendations and the real-world act of buying a gift. When the AI says "Merino Running Headband," this system finds the nearest matching product in a curated catalog or constructs a clean affiliate search URL — and delivers it to the user in a geo-aware, plan-gated card.

The system has two primary jobs:

1. **User-facing:** Show actionable buy links that match the gift recommendation, respect the user's budget, update in real time with stock and pricing, and open the correct store for the recipient's location.

2. **Business-facing:** Capture affiliate commission on every outbound click, attribute those clicks precisely to the recommendation and user context, and provide admins with full visibility and control over which stores are shown in each country.

### 1.2 Business Model Context

GiftMind is building toward an affiliate-first monetization layer alongside subscription revenue. The current affiliate infrastructure is:
- **Built but thin** — the plumbing exists (affiliate_url field, affiliate_param in store config, is_affiliate flag, click tracking), but the catalog has no automated refresh mechanism and no affiliate network integration.
- **Correctly disclosed** — `AffiliateDisclaimer.tsx` and per-product attribution_label ensure FTC compliance.
- **Plan-gated for upgrade pressure** — hiding stores behind plan locks converts affiliate revenue opportunity into subscription upgrade pressure. This is intentional and correct.

### 1.3 Where This System Sits

```
[Gift Flow Steps 1-4: Inputs]
        │
        ▼
[generate-gifts: AI Recommendations]
        │
        ▼
[search-products: Product Lookup]    ← THIS SYSTEM (backend)
        │
        ▼
[ProductLinks.tsx: Store Cards]      ← THIS SYSTEM (frontend)
        │
        ▼
[Outbound Click → Affiliate Store]   ← THIS SYSTEM (click handling)
        │
        ▼
[product_clicks: Analytics]          ← THIS SYSTEM (attribution)
```

### 1.4 Scope

**In scope (this PRD):**
- `marketplace_config` schema, admin UI, and store management
- `marketplace_products` schema, admin UI (currently missing), and catalog management
- `search-products` Edge Function: algorithm, geo logic, plan gating, scoring
- `ProductLinks.tsx` component design and behavior
- `trackProductClick` attribution logic and `product_clicks` schema
- `AffiliateDisclaimer` component and FTC compliance approach
- Rate limiting and security for outbound click tracking
- Affiliate network integration readiness (architecture only, not implementation)
- Admin analytics: click attribution, store performance, catalog health

**Not in scope:**
- AI recommendation generation (Gift Recommendation Engine PRD)
- Plan upgrade flows and UpgradeModal design (Credits & Plans PRD)
- Results screen card layout and Signal Check (Recommendation Results Experience PRD)
- PayPal checkout integration (Payment PRD)
- Specific affiliate network API integrations (future V2 PRD)

---

## Section 2: User Problem & Goals

### 2.1 End-User Problem

> "GiftMind suggested a perfect gift. But when I clicked 'View on Amazon,' the product was out of stock. And the link didn't take me to the right thing — it searched 'merino running headband' on Amazon UK when my recipient is in India. I had to figure out the right site myself."

Users on the free (Spark) plan see:
> "Only Amazon? Can I see what this looks like on Flipkart? Why is it locked?"

### 2.2 Business Problem

> Every recommendation that converts to a click is a potential affiliate commission. Every out-of-stock product shown is a broken promise. Every missing store for a country is a missed conversion. And without a real-time product catalog, GiftMind is just a searchbar with extra steps.

Current gaps that directly reduce revenue:
1. No automated product catalog sync → stale prices, out-of-stock items
2. No `marketplace_products` admin UI → catalog management requires SQL access
3. Country field in click logs is wrong → affiliate attribution analysis is unreliable
4. No webhook for affiliate network events → can't verify conversion or optimize

### 2.3 Jobs-to-be-Done

1. **JTBD — Right store, right country:** When my recipient lives in India, show me Amazon.in, Flipkart, and Myntra — not Amazon.com.

2. **JTBD — Real product, not a search:** When I click "View on [Store]," take me to the exact product page (or the closest match), not a generic search results page.

3. **JTBD — Know what I'm clicking:** When I see a price and a "Buy" button, I want to know if this is an affiliate link, whether it's in stock, and roughly when it'll arrive.

4. **JTBD — Upgrade feels worth it:** When I see a locked store, I want to immediately understand what I'm missing and feel the upgrade is $3 well spent.

5. **JTBD — Admin: full catalog control:** As GiftMind admin, I need to add, edit, activate/deactivate products in the curated catalog without touching SQL, and see which products are being clicked.

6. **JTBD — Admin: affiliate health:** As GiftMind admin, I need to know which stores are generating affiliate clicks, which are showing stale/OOS products, and what the top-clicked gift categories are by country.

### 2.4 Success Metrics

| Metric | Target | Current Baseline | How Measured |
|---|---|---|---|
| Click-to-buy rate (≥1 product click per session with results) | ≥60% | Unknown (logs exist but unreliable due to country field bug) | product_clicks / sessions with results |
| Enriched product served rate (non-search-link cards / total cards) | ≥40% | Unknown | enriched_products_returned / total results |
| Out-of-stock product shown rate | <5% | Unknown | product_clicks.store_id WHERE stock_status='out_of_stock' |
| Avg clicks per session | ≥1.5 | Unknown | COUNT(product_clicks) / sessions with results |
| Affiliate conversion (store-side, via network) | ≥2% of clicks | Unknown | Affiliate network dashboard |
| Locked store upgrade conversion rate | ≥4% | Unknown | upgrade modal open / locked store click |
| Catalog coverage (enriched product available for top 10 gift categories) | ≥80% | Unknown | manual audit |
| Admin product CRUD time | <2 min per product | N/A (SQL only) | Admin UX target |

---

## Section 3: Store Management System

### 3.1 Marketplace Config Schema (Current — No Changes Needed)

The `marketplace_config` table is correct as built. The schema satisfies:
- Country-specific stores with GLOBAL fallback
- Affiliate tag per store (Amazon Associates, Flipkart affiliate, etc.)
- Priority-based ordering within country
- Category filtering (empty = all categories)
- Active/Inactive toggle for instant on/off

**One recommended addition (V1.1):**
```sql
ALTER TABLE public.marketplace_config
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL,          -- internal ops notes
  ADD COLUMN IF NOT EXISTS affiliate_network text DEFAULT NULL;  -- e.g. 'amazon_associates', 'impact', 'admitad'
```

### 3.2 Supported Countries (as-built)

| Code | Country | Flag |
|---|---|---|
| `IN` | India | 🇮🇳 |
| `US` | USA | 🇺🇸 |
| `GB` | UK | 🇬🇧 |
| `AE` | UAE | 🇦🇪 |
| `FR` | France | 🇫🇷 |
| `DE` | Germany | 🇩🇪 |
| `IT` | Italy | 🇮🇹 |
| `ES` | Spain | 🇪🇸 |
| `NL` | Netherlands | 🇳🇱 |
| `CA` | Canada | 🇨🇦 |
| `AU` | Australia | 🇦🇺 |
| `SG` | Singapore | 🇸🇬 |
| `GLOBAL` | Global Fallback | 🌍 |

**Target: 60+ stores across all countries.** Admin dashboard shows a warning when count < 60.

### 3.3 Store Priority & Plan Gating Logic

```
Country stores sorted by priority (ASC):
  priority 1 → Amazon (always highest priority for Spark users)
  priority 2 → Major local store (Flipkart for IN, John Lewis for GB, etc.)
  priority 3+ → Specialist stores (Myntra, Nykaa, Not On The High Street, etc.)

Plan limits applied:
  spark → stores[0]          (Amazon only)
  thoughtful → stores[0..1]  (Amazon + priority 2)
  confident → all stores      (unlimited)
  gifting-pro → all stores    (unlimited)

Locked stores → up to 3 from remainder, shown as upgrade placeholders
```

### 3.4 Admin Marketplace UI (as-built in `AdminMarketplaces.tsx`)

The admin UI for `marketplace_config` is fully built and covers:
- Country tab navigation via URL hash
- Per-store edit cards: affiliate tag, search URL, brand color, priority, categories
- Active/Inactive toggle
- Test Link + Test All Links
- Add Store dialog
- Bulk activate/deactivate
- CSV export
- Click stats per store

**Gap: No UI for `marketplace_products` catalog.** See Section 4.

---

## Section 4: Product Catalog Management (Gap — Build Required)

### 4.1 The Problem

`marketplace_products` exists as a database table but has **no admin UI**. The only way to add products is via direct SQL inserts. This means:
- Product catalog growth requires developer access
- Stale/OOS products cannot be audited or cleaned up by non-engineers
- There is no way to preview which products will be served for a given gift concept

### 4.2 Required: Admin Products Tab in AdminMarketplaces

Add a "Products" tab to the existing `AdminMarketplaces.tsx` admin page, alongside the existing "Stores" tab.

**Products Tab Layout:**

```
┌─ Products ─────────────────────────────────────────────────────────┐
│                                                                    │
│  [+ Add Product]          [↓ Export CSV]  [↑ Import CSV]          │
│                                                                    │
│  Filters: [Country ▼] [Store ▼] [Category ▼] [Status ▼] [Search] │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [img] Amazon Merino Running Headband                         │   │
│  │       Store: amazon_in · IN · sports · $42 · ✅ In stock    │   │
│  │       Priority: 1 · Tags: merino, headband, running         │   │
│  │       [Edit] [Deactivate] [Delete]                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  [Load more...]                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Add/Edit Product Form fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `store_id` | Select (from marketplace_config) | ✓ | Validated against active stores |
| `country_code` | Select | ✓ | From supported countries list |
| `product_title` | Text | ✓ | Max 300 chars |
| `product_url` | URL | ✓ | Direct product page |
| `affiliate_url` | URL | — | Affiliate-wrapped URL |
| `image_url` | URL | — | Product image |
| `price_amount` | Number | — | In USD |
| `price_currency` | Text | — | Default: USD |
| `original_price_amount` | Number | — | For discount badge |
| `stock_status` | Select | ✓ | in_stock / low_stock / out_of_stock / preorder / unknown |
| `delivery_eta_text` | Text | — | e.g. "2-3 business days" |
| `coupon_code` | Text | — | Code to display |
| `coupon_text` | Text | — | Description of discount |
| `product_category` | Select | ✓ | From CATEGORY_SUGGESTIONS |
| `keyword_tags` | Tag input | ✓ | Min 2, max 20 tags |
| `affiliate_source` | Text | — | e.g. "Amazon Associates" |
| `attribution_label` | Text | — | User-facing label, e.g. "Paid link" |
| `is_affiliate` | Toggle | ✓ | Default: true |
| `priority` | Number | ✓ | 0 = highest |
| `is_active` | Toggle | ✓ | Default: true |

**CSV Import spec:**
- Required headers: store_id, country_code, product_title, product_url, product_category, keyword_tags (semicolon-separated), stock_status
- Optional headers: all other fields
- On import: validate required fields, skip invalid rows, show row-level errors
- Dry run mode: show what would be inserted before committing

### 4.3 Product Preview Tool (Admin)

A critical addition: let admins **simulate what the search-products function would return** for a given gift concept, without having to actually run a gift flow.

```
┌─ Preview Product Match ─────────────────────────────────────────────┐
│                                                                     │
│  Gift name:      [Merino Running Headband               ]           │
│  Keywords:       [merino, headband, running, wool, head ]           │
│  Category:       [sports                                ]           │
│  Price anchor:   [$42         ]                                     │
│  Budget range:   [$30  ] to  [$75  ]                               │
│  Country:        [IN ▼]                                             │
│  Plan:           [spark ▼]                                          │
│                                                                     │
│  [▶ Run Preview]                                                    │
│                                                                     │
│  Results: (simulates search-products scoring for this concept)      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ #1 Score: 67  Amazon Merino Running Headband — $42         │     │
│  │ #2 Score: 34  Flipkart Wool Headband — $38                 │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

This tool runs the scoring algorithm client-side using the same logic as `scoreProduct()` in the Edge Function, pulling products from Supabase directly.

---

## Section 5: The `search-products` Edge Function

### 5.1 Current Algorithm Assessment

The scoring algorithm in `scoreProduct()` is sound for MVP. Key correctness notes:

- **Phrase matching before token matching** (phrase = 14pts, token = 4pts) — correct, prevents false positives from single-word matches
- **Price score degrades by distance from price_anchor** — correct, rewards closest price
- **Out-of-stock penalty (-20pts)** is large enough to disqualify even highly keyword-matched OOS products
- **Country match bonus (+4pts)** is intentionally small — a GLOBAL product should still win on keyword match
- **Category match (+10pts)** prevents electronics accessories from surfacing in jewelry searches

**Recommended improvement (search-products v1.1):** Add score threshold. If top score ≤ 0, fall through to search link immediately rather than returning a 0-score product.

```typescript
// Current (can return a product with score 0)
if (topMatch && topMatch.score > 0) {
  return buildEnrichedProductLink(store, concept, topMatch.product);
}
return buildSearchProductLink(store, concept, primaryKeyword);

// This is already correct — score > 0 check is there. ✓
```

### 5.2 Geo Resolution Logic

Current geo logic is correct. Document for clarity:

```
1. target_country = recipient_country.toUpperCase() || user_country.toUpperCase() || 'US'
2. is_cross_border = recipient_country && user_country && recipient_country !== user_country
3. fetchStores(target_country):
   a. Query marketplace_config WHERE country_code = target_country AND is_active = true
   b. If 0 results → fallback: WHERE country_code = 'GLOBAL' AND is_active = true
4. fetchProducts: WHERE store_id IN [stores] AND country_code IN [target_country, 'GLOBAL']
```

**Bug to fix (Issue #2 from audit):** The `country` field in `product_clicks` is currently set using:
```typescript
country: product.domain?.split(".").pop() || ""
```
This gives "in", "com", "uk" — not ISO codes. Fix:
```typescript
country: recipientCountry ?? userCountry ?? null,
```
This requires passing `recipientCountry` through to `trackProductClick`. Update the `onTrackClick` prop in `ProductLinks.tsx` and the call sites in `StepResults.tsx`.

### 5.3 Security & Rate Limiting

**Current enforcement:**
- Auth: bearer token validation on every request (correct)
- Plan: server reads `users.active_plan` from DB — not trusted from client (correct, prevents plan spoofing)
- CORS: `Access-Control-Allow-Origin: *` — should be restricted to `giftmind.in` in production (TODO comment exists in code)

**Rate limiting (gap):**
`AdminSettings.tsx` allows configuring `product_clicks_per_hour` but the `search-products` function does not enforce this. The click tracking is client-side (useGiftSession.ts inserts into `product_clicks` directly via Supabase client). This means:

1. The click insert path has RLS policies (correct)
2. The `product_clicks_per_hour` setting in `platform_settings` is not enforced at the DB level
3. A motivated user could spam the `product_clicks` table

**Required fix (Row-Level Security):**
```sql
-- Add to product_clicks RLS:
CREATE POLICY rate_limit_product_clicks
ON public.product_clicks
FOR INSERT TO authenticated
WITH CHECK (
  (
    SELECT COUNT(*) FROM public.product_clicks
    WHERE user_id = auth.uid()
    AND clicked_at > NOW() - INTERVAL '1 hour'
  ) < (
    SELECT COALESCE(
      (SELECT (value->>'product_clicks_per_hour')::integer FROM public.platform_settings LIMIT 1),
      100
    )
  )
);
```

### 5.4 Affiliate URL Construction

**Current `buildSearchUrl()` logic:**
```typescript
function buildSearchUrl(store: MarketplaceStore, keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  if (basePattern.includes("{keyword}")) {
    const withKeyword = basePattern.replace("{keyword}", encoded);
    return affiliate_param ? `${withKeyword}${affiliate_param}` : withKeyword;
  }
  // Default: treat as prefix
  return affiliate_param
    ? `${basePattern}${encoded}${affiliate_param}`
    : `${basePattern}${encoded}`;
}
```

**Example for Amazon India (correct):**
```
search_url = "https://www.amazon.in/s?k="
affiliate_param = "&tag=giftmind-21"
keyword = "merino headband running"
result = "https://www.amazon.in/s?k=merino%20headband%20running&tag=giftmind-21"
```

**Current behavior is correct.** The `{keyword}` placeholder support is correctly implemented but not needed for any current stores.

**For enriched products (catalog match):**
- If `product.affiliate_url` is set → use it directly (already encoded, affiliate tag already embedded)
- If only `product.product_url` → open that (may not earn commission; acceptable for is_affiliate=false)
- Fallback: construct search URL

**Priority order (existing, correct):**
```typescript
getOutboundProductUrl(product) = product.affiliate_url || product.product_url || product.search_url || ""
```

---

## Section 6: ProductLinks Component Spec

### 6.1 Current Design Assessment

The `ProductLinks.tsx` component is well-built. The horizontal scroll with `snap-x snap-mandatory`, the rich product cards with stock/price/coupon, and the locked store placeholders are all correct.

**Changes required (from gap analysis):**

### 6.2 Bug Fix: Correct Country in Click Tracking

Update `ProductLinks.tsx` to accept and pass `recipientCountry` through `onTrackClick`:

```typescript
// Current onTrackClick signature in ProductLinks.tsx:
onTrackClick: (product: ProductLinkRecord) => void;

// Updated:
onTrackClick: (product: ProductLinkRecord, meta?: { recipientCountry?: string | null }) => void;
```

Update call site in `StepResults.tsx`:
```typescript
onTrackClick={(product) => giftSession.trackProductClick({
  ...product,
  recipientCountry: giftParams.recipientCountry,  // pass through
  recommendationIndex: index,
  recommendationConfidence: recommendation.confidence_score,
  recipientId: giftParams.recipient.id,
  clickedFrom: "results_screen",
})}
```

Update `trackProductClick` signature:
```typescript
async (product: {
  // ...existing fields...
  recipientCountry?: string | null;  // ADD THIS
}) => {
  // Change:
  country: product.recipientCountry ?? null,  // WAS: domain TLD extraction
}
```

### 6.3 Bug Fix: Product Title for Search Links

Current behavior: search-link clicks log `product.store_name` as `product_title`.

Fix:
```typescript
product_title: product.product_title
  || (product.is_search_link
      ? `Search: ${product.gift_name} on ${product.store_name}`
      : product.store_name),
```

### 6.4 Loading State Alignment

Current skeleton cards are `min-h-[132px]`. Actual product cards have `min-h-[220px]`. The jump from skeleton → content causes layout shift.

Fix:
```typescript
<Card key={item} className="min-h-[220px] min-w-[260px] animate-pulse border-border/60 snap-center">
```

### 6.5 Affiliate Disclosure Placement

Current: The `AffiliateDisclaimer` component is placed inside the `<div className="space-y-3">` wrapper in `ProductLinks.tsx` as a small text line.

The current placement is correct for FTC compliance — it's visible before the user clicks. No change required.

**Note for future:** If GiftMind adds more prominent product cards in a grid layout (e.g., dedicated gift history purchase section), the disclaimer must follow the product display.

### 6.6 GLOBAL Store Fallback Indicator (New)

When stores come from GLOBAL fallback (no country-specific stores found), show a subtle indicator:

```tsx
{isGlobalFallback && (
  <div className="rounded-xl border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
    <Globe2 className="mr-1.5 inline h-3.5 w-3.5" />
    International store links shown — no region-specific stores available yet.
  </div>
)}
```

`isGlobalFallback` prop comes from the `search-products` response metadata (add to response type).

---

## Section 7: Click Attribution Analytics

### 7.1 `product_clicks` Schema (Current — Mostly Complete)

The schema migration `20260420101500_recommendation_results_product_clicks.sql` added the richer columns. Current live schema has all fields from PRD 04's audit:

```sql
-- Current complete schema (after migration):
product_clicks (
  id, user_id, session_id, recipient_id,
  gift_concept_name, recommendation_index, recommendation_confidence,
  product_title, product_url, store, store_id, store_name,
  country, estimated_price, is_search_link, clicked_from,
  clicked_at
)
```

**Remaining gap:** `country` values are wrong (TLD strings, not ISO codes). Fix described in Section 6.2.

### 7.2 Analytics Queries for Admin

These queries power the store performance analytics in `AdminMarketplaces.tsx`. Currently only `total` and `month` counts are shown. Add:

```sql
-- Top gift categories by store (for AdminGiftAnalytics extension)
SELECT 
  store_name,
  gift_concept_name,
  COUNT(*) as clicks,
  AVG(estimated_price) as avg_price_clicked,
  AVG(recommendation_confidence) as avg_confidence
FROM product_clicks
WHERE country = 'IN'
  AND clicked_at > NOW() - INTERVAL '30 days'
GROUP BY store_name, gift_concept_name
ORDER BY clicks DESC
LIMIT 50;

-- Enriched product vs search link ratio
SELECT
  store_name,
  COUNT(*) FILTER (WHERE is_search_link = false) as enriched,
  COUNT(*) FILTER (WHERE is_search_link = true) as search_links,
  COUNT(*) as total
FROM product_clicks
GROUP BY store_name;

-- Click-to-buy rate by plan
SELECT
  u.active_plan,
  COUNT(DISTINCT gs.id) as sessions_with_results,
  COUNT(DISTINCT pc.session_id) as sessions_with_clicks,
  ROUND(COUNT(DISTINCT pc.session_id)::numeric /
        NULLIF(COUNT(DISTINCT gs.id), 0) * 100, 1) as click_rate
FROM gift_sessions gs
JOIN users u ON u.id = gs.user_id
LEFT JOIN product_clicks pc ON pc.session_id = gs.id
WHERE gs.status = 'active' OR gs.status = 'completed'
GROUP BY u.active_plan;
```

### 7.3 PostHog Event Tracking

Events to add to the click path:

```typescript
// When user opens a product link
posthog.capture("product_link_clicked", {
  store_id: product.store_id,
  store_name: product.store_name,
  is_search_link: product.is_search_link,
  is_affiliate: product.is_affiliate,
  gift_concept: product.gift_name,
  product_category: product.product_category,
  recommendation_index: recommendationIndex,
  estimated_price: product.price_amount,
  country: recipientCountry,
  clicked_from: clickedFrom,
});

// When locked store card is clicked
posthog.capture("locked_store_clicked", {
  store_id: store.store_id,
  store_name: store.store_name,
  unlock_plan: store.unlock_plan,
  current_plan: userPlan,
});
```

---

## Section 8: Affiliate Network Integration (Architecture — V2)

### 8.1 The Gap

All products in `marketplace_products` are manually inserted. There is no:
- Automated price refresh from affiliate networks
- Real-time stock status update
- Affiliate link validation/health check
- Conversion event from the affiliate network back to GiftMind

This is acceptable for MVP but becomes a problem at scale (100+ products). Products go stale. Prices drift. OOS items remain visible.

### 8.2 Recommended Architecture (V2 Implementation Basis)

```
Affiliate Network APIs                     GiftMind
━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amazon Product               →   sync-amazon-products  (Edge Fn)
Advertising API (PA-API)              ↓
                             →   marketplace_products (upsert)
                                      ↓
Impact / Rakuten             →   webhook-affiliate-event (Edge Fn)
Conversion Webhook                    ↓
                             →   affiliate_conversions (new table)
```

**New Edge Functions required (V2):**
- `sync-amazon-products` — calls Amazon PA-API, upserts products with fresh prices/stock
- `sync-flipkart-products` — calls Flipkart affiliate catalog API
- `webhook-affiliate-event` — receives conversion webhooks from Impact/Rakuten

**New table (V2):**
```sql
CREATE TABLE public.affiliate_conversions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network         text NOT NULL,    -- 'amazon_associates', 'impact', 'rakuten'
  order_id        text NOT NULL,
  product_url     text,
  commission      numeric(10,2),
  currency        text,
  click_id        text,             -- correlate with product_clicks
  session_id      uuid REFERENCES gift_sessions(id),
  user_id         uuid REFERENCES users(id),
  converted_at    timestamptz NOT NULL DEFAULT now(),
  reported_at     timestamptz NOT NULL DEFAULT now()
);
```

**Catalog refresh schedule (V2 target):**
- Amazon prices/stock: every 6 hours via Supabase CRON
- Flipkart catalog: daily
- Out-of-stock auto-deactivation: if `stock_status = 'out_of_stock'` for > 48 hours, set `is_active = false`

---

## Section 9: API Contracts

### 9.1 `search-products` Request

```typescript
POST /functions/v1/search-products
Authorization: Bearer <user_access_token>
Content-Type: application/json

{
  "gift_concepts": [
    {
      "name": "Merino Running Headband",
      "search_keywords": ["merino headband", "wool running headband", "cold weather running accessory"],
      "product_category": "sports",
      "price_anchor": 42
    }
  ],
  "recipient_country": "IN",
  "user_country": "US",
  "currency": "USD",
  "budget_min": 30,
  "budget_max": 75,
  "user_plan": "spark"   // NOTE: server ignores this; reads from DB
}
```

### 9.2 `search-products` Response (Success)

```typescript
{
  "success": true,
  "target_country": "IN",
  "results": [
    {
      "gift_name": "Merino Running Headband",
      "products": [
        {
          "store_id": "amazon_in",
          "store_name": "Amazon.in",
          "domain": "amazon.in",
          "brand_color": "#FF9900",
          "gift_name": "Merino Running Headband",
          "product_category": "sports",
          "is_search_link": false,               // enriched catalog match
          "product_url": "https://amazon.in/dp/B0XXXXX",
          "affiliate_url": "https://amazon.in/dp/B0XXXXX?tag=giftmind-21",
          "product_title": "Smartwool Merino 150 Running Headband",
          "image_url": "https://m.media-amazon.com/images/I/xxx.jpg",
          "price_amount": 42,
          "price_currency": "USD",
          "original_price_amount": 55,
          "stock_status": "in_stock",
          "delivery_eta_text": "2-3 days",
          "coupon_code": null,
          "coupon_text": null,
          "affiliate_source": "Amazon Associates",
          "attribution_label": "Affiliate",
          "is_affiliate": true
        }
      ],
      "locked_stores": [
        {
          "store_id": "flipkart",
          "store_name": "Flipkart",
          "brand_color": "#F7941D",
          "is_locked": true,
          "unlock_plan": "thoughtful"
        }
      ]
    }
  ],
  "enriched_products_returned": 1,
  "total_stores_available": 4,
  "stores_shown": 1,
  "is_cross_border": true,
  "server_plan": "spark"
}
```

### 9.3 `search-products` Error Responses

| Status | Error | Cause |
|---|---|---|
| 401 | `Missing Authorization header` | No bearer token |
| 401 | `Unauthorized` | Invalid/expired token |
| 400 | `Missing required field: gift_concepts` | Empty concepts array |
| 400 | `Invalid budget range` | budget_min >= budget_max or negatives |
| 400 | `Invalid user plan` | Unknown plan string |
| 400 | `Invalid recipient country code` | Non-2-char country code |
| 500 | `Failed to fetch marketplace data` | Supabase query error on stores |
| 500 | `An unexpected error occurred` | Unhandled exception |

---

## Section 10: FTC Compliance & Affiliate Disclosure

### 10.1 Current Disclosure Implementation

GiftMind's affiliate disclosure is correctly implemented at three levels:

1. **Per-product badge:** `is_affiliate: true` products show "Affiliate" or `attribution_label` as a Badge (outline variant) in the top-right of the product card.

2. **Per-product inline note:** Below the CTA link, small text: `{affiliate_source || "Affiliate-enabled link"}.`

3. **Section-level disclaimer:** `AffiliateDisclaimer.tsx` shows at the bottom of the ProductLinks section: "Prices shown are approximate and may vary. GiftMind may earn a small commission on purchases made through these links, at no extra cost to you."

### 10.2 FTC Requirements Checklist

| Requirement | Status | Implementation |
|---|---|---|
| Disclosure before click | ✅ | Badge + disclaimer visible above/near links |
| Clear and conspicuous | ✅ | Not hidden in footer or fine print |
| "Affiliate" or "Paid" language | ✅ | "Affiliate" badge + commission language |
| Applies to all affiliate links | ✅ | `is_affiliate` flag controls both badge and disclaimer |
| No deceptive pricing | ✅ | "Prices shown are approximate" caveat |
| Applies to all users including free | ✅ | Disclaimer renders regardless of plan |

### 10.3 Disclosure Language (Canonical)

The canonical short-form disclosure for GiftMind:
> "GiftMind may earn a commission on purchases made through these links, at no extra cost to you."

Long-form (for Privacy Policy / Terms of Service):
> "Some product links on GiftMind are affiliate links. This means GiftMind may receive a commission if you click through and make a purchase. This comes at no additional cost to you. We only recommend products we believe are relevant to your search. Affiliate relationships do not influence our AI's recommendations."

---

## Section 11: Database Migration Plan

### 11.1 Migrations Already Applied

| Migration | Description | Status |
|---|---|---|
| `20260412120000_add_marketplace_products.sql` | Creates `marketplace_products` table + indexes + RLS | ✅ Applied |
| `20260420101500_recommendation_results_product_clicks.sql` | Adds rich columns to `product_clicks` | ✅ Applied |

### 11.2 Remaining Migrations Required (Phase 2)

#### Migration: Fix product_clicks RLS rate limiting

```sql
-- FILE: 20260423_product_clicks_rate_limit_rls.sql

-- Remove any existing permissive insert policy
DROP POLICY IF EXISTS insert_own_product_clicks ON public.product_clicks;

-- Add rate-limited insert policy
CREATE POLICY insert_own_product_clicks
ON public.product_clicks
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    SELECT COUNT(*) FROM public.product_clicks
    WHERE user_id = auth.uid()
    AND clicked_at > NOW() - INTERVAL '1 hour'
  ) < 100  -- default limit; override via platform_settings
);

-- Allow users to read their own clicks (for gift history purchase CTA)
CREATE POLICY select_own_product_clicks
ON public.product_clicks
FOR SELECT TO authenticated
USING (user_id = auth.uid());
```

#### Migration: marketplace_config enrichment

```sql
-- FILE: 20260423_marketplace_config_enrichment.sql

ALTER TABLE public.marketplace_config
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affiliate_network text DEFAULT NULL
    CHECK (affiliate_network IS NULL OR affiliate_network IN (
      'amazon_associates', 'flipkart_affiliate', 'impact', 'rakuten',
      'admitad', 'cj_affiliate', 'direct', 'other'
    ));
```

#### View: admin_product_catalog_health

```sql
-- FILE: 20260423_product_catalog_health_view.sql

CREATE OR REPLACE VIEW public.admin_product_catalog_health AS
SELECT
  mp.store_id,
  mc.store_name,
  mp.country_code,
  mp.product_category,
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE mp.stock_status = 'in_stock') as in_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'out_of_stock') as out_of_stock,
  COUNT(*) FILTER (WHERE mp.stock_status = 'unknown') as unknown_stock,
  COUNT(*) FILTER (WHERE mp.image_url IS NOT NULL) as has_image,
  COUNT(*) FILTER (WHERE mp.affiliate_url IS NOT NULL) as has_affiliate_url,
  MAX(mp.updated_at) as last_updated
FROM public.marketplace_products mp
LEFT JOIN public.marketplace_config mc
  ON mc.store_id = mp.store_id AND mc.country_code = mp.country_code
WHERE mp.is_active = true
GROUP BY mp.store_id, mc.store_name, mp.country_code, mp.product_category
ORDER BY mp.country_code, mp.store_id, mp.product_category;

-- RLS: superadmin only
ALTER VIEW public.admin_product_catalog_health SET (security_invoker = true);
```

---

## Section 12: Implementation Priorities

### Phase 1 (Shipped)
- [x] `marketplace_config` table + admin UI (`AdminMarketplaces.tsx`)
- [x] `marketplace_products` table + scoring algorithm
- [x] `search-products` Edge Function (geo logic, plan gating, scoring)
- [x] `ProductLinks.tsx` component (cards, locked stores, cross-border banner)
- [x] `trackProductClick` in `useGiftSession.ts` (enriched schema)
- [x] `AffiliateDisclaimer.tsx`
- [x] FTC compliant affiliate disclosure

### Phase 2 (Build Now)
- [ ] Fix `country` field in `product_clicks` (ISO code not TLD) — **Bug fix**
- [ ] Fix `product_title` for search-link clicks — **Bug fix**
- [ ] Fix loading skeleton height mismatch — **Polish**
- [ ] Add GLOBAL fallback indicator in `ProductLinks.tsx` — **UX**
- [ ] Add `marketplace_products` admin UI tab in `AdminMarketplaces.tsx` — **Admin**
- [ ] Add Admin Product Preview Tool — **Admin debug**
- [ ] Apply rate-limiting RLS policy on `product_clicks` — **Security**
- [ ] Apply `marketplace_config` enrichment migration (`notes`, `affiliate_network`) — **Infra**
- [ ] Apply `admin_product_catalog_health` view — **Analytics**
- [ ] Add PostHog events for product clicks and locked store clicks — **Analytics**

### Phase 3 (V2 — Affiliate Automation)
- [ ] Amazon PA-API integration for product sync
- [ ] Webhook endpoint for affiliate conversion events
- [ ] `affiliate_conversions` table
- [ ] Auto-deactivate OOS products after 48h
- [ ] CSV import for bulk product management
- [ ] A/B testing support for affiliate tags

---

## Section 13: Testing Strategy

### 13.1 Unit Tests

| Test | Location | Description |
|---|---|---|
| `scoreProduct()` | `search-products.test.ts` | Phrase match scores, token match, budget in/out, stock status penalties |
| `buildSearchUrl()` | `search-products.test.ts` | With/without affiliate param, with/without `{keyword}` placeholder |
| `getOutboundProductUrl()` | `productLinks.test.ts` | Priority: affiliate_url > product_url > search_url |
| `tokenize()` | `search-products.test.ts` | Special chars, numbers, short tokens filtered |

### 13.2 Edge Function Integration Tests

| Scenario | Expected |
|---|---|
| Spark plan user, IN country | 1 store returned, 3 locked |
| Thoughtful plan, IN country | 2 stores returned, 2 locked |
| Confident plan, IN country | All stores returned, 0 locked |
| Recipient country = IN, user = US | IN stores used, is_cross_border = true |
| No IN stores in config | GLOBAL stores used |
| Budget too tight (all products OOS or wrong price) | Search link returned |
| Invalid budget_min > budget_max | 400 error |
| Unauthenticated request | 401 error |

### 13.3 UI Component Tests

| Test | Component |
|---|---|
| Renders enriched product card with all fields | `ProductLinks.tsx` |
| Renders search-link card with correct CTA text | `ProductLinks.tsx` |
| Renders locked store card + opens UpgradeModal on click | `ProductLinks.tsx` |
| Shows cross-border banner when recipient ≠ user country | `ProductLinks.tsx` |
| Shows "+N more stores on Confident" when lockedStores.length > 0 | `ProductLinks.tsx` |
| Empty state (no products, not loading) shows Amazon fallback | `ProductLinks.tsx` |
| Loading state shows skeleton at correct height | `ProductLinks.tsx` |

### 13.4 Admin UI Tests

| Test | Component |
|---|---|
| Add store — duplicate store_id validation | `AdminMarketplaces.tsx` |
| Add store — invalid search URL rejected | `AdminMarketplaces.tsx` |
| Toggle store active/inactive — immediate DB write | `AdminMarketplaces.tsx` |
| CSV export contains all stores for all countries | `AdminMarketplaces.tsx` |
| Test Link — opens correct preview URL | `AdminMarketplaces.tsx` |
| Click stats show correct total/month counts | `AdminMarketplaces.tsx` |

---

## Section 14: Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Product catalog goes stale | High | Phase 3 PA-API sync; for now, admin catalog health view + stale-date alerts |
| Affiliate link breaks (domain change, product removed) | High | Fallback to search_url when affiliate_url returns 404 (client-side) |
| CORS not restricted in production | Medium | Change `Access-Control-Allow-Origin: *` to `giftmind.in` (TODO already in code) |
| Amazon Associates TOS violation via proxy | Medium | Never store PII or modify affiliate parameters server-side; open in new tab only |
| Plan spoofing via client-sent user_plan | ✅ Mitigated | Server reads `users.active_plan` from DB; ignores client-sent value |
| product_clicks table spam | Medium | RLS rate-limiting policy (Phase 2) |
| OOS products degrading user experience | Medium | -20 score penalty in algorithm; catalog health view to surface stale OOS |
| Cross-border geo mismatch | Low | recipient_country takes priority; GLOBAL fallback; cross-border banner informs user |
| Missing affiliate disclosure | ✅ Mitigated | Per-product badge + section-level disclaimer (FTC compliant) |

---

## Appendix A: Store ID Conventions

Store IDs must be lowercase letters, numbers, underscores. Convention:
- `amazon_in` — Amazon India
- `amazon_us` — Amazon US
- `flipkart` — Flipkart (India only)
- `john_lewis` — John Lewis (GB)
- `noon_ae` — Noon (UAE)
- `nykaa` — Nykaa (IN)
- `myntra` — Myntra (IN)

## Appendix B: Category Reference

These are the canonical product categories shared between `marketplace_config.categories` filtering and `marketplace_products.product_category`:

| Value | Description |
|---|---|
| `electronics` | Gadgets, devices, accessories |
| `fashion` | Clothing, apparel |
| `accessories` | Bags, jewelry, watches |
| `beauty` | Skincare, makeup, fragrance |
| `home_decor` | Furnishings, art, décor |
| `kitchen` | Cookware, appliances, tools |
| `books` | Books, stationery |
| `personalized` | Custom engraved, monogrammed items |
| `flowers_cakes` | Gifting services |
| `jewelry` | Fine and fashion jewelry |
| `wellness` | Spa, supplements, fitness |
| `toys_kids` | Children's gifts |
| `sports` | Sports equipment and apparel |
| `luxury` | Premium brands (Tiffany, LV, etc.) |
| `handmade` | Artisan, craft, Etsy-style |
| `food` | Gourmet, chocolates, hampers |
| `experience` | Events, subscriptions, vouchers |
| `general` | Catch-all for uncategorized |

## Appendix C: Related PRDs

| PRD | Relevance |
|---|---|
| PRD 03 — Gift Flow Orchestration | How gift flow creates session, calls search-products |
| PRD 04 — Recommendation Results Experience | How ProductLinks.tsx renders within gift cards |
| Gift Recommendation Engine PRD | Produces gift concepts consumed by search-products |
| Credits & Plans PRD | Defines STORE_LIMITS and plan upgrade flow |
