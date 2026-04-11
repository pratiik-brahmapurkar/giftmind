import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeArray, sanitizeString, validateBudget, validateCountryCode, validatePlan } from "../_shared/validate.ts";

// ── Environment ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Supabase admin client ──────────────────────────────────────────────────────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// TODO: Before production, change Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
// ── CORS headers ───────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface GiftConcept {
  name: string;
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
}

interface SearchRequest {
  gift_concepts: GiftConcept[];
  recipient_country?: string | null;
  user_country?: string | null;
  currency: string;
  budget_min: number;
  budget_max: number;
  user_plan: string;
}

// Real column names from marketplace_config table
interface MarketplaceStore {
  id: string;
  store_id: string;
  store_name: string;
  domain: string;
  country_code: string;
  search_url: string;
  affiliate_param: string | null;
  brand_color: string | null;
  categories: string[] | null;
  priority: number | null;
  is_active: boolean | null;
}

interface ProductLink {
  store_id: string;
  store_name: string;
  domain: string;
  brand_color: string | null;
  search_url: string;
  is_search_link: true;
  gift_name: string;
  product_category: string;
}

interface LockedStore {
  store_id: string;
  store_name: string;
  brand_color: string | null;
  is_locked: true;
  unlock_plan: string;
}

interface GiftResult {
  gift_name: string;
  products: ProductLink[];
  locked_stores: LockedStore[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Plan-based store limits ────────────────────────────────────────────────────
const STORE_LIMITS: Record<string, number> = {
  free: 1,      // Amazon only (top-priority store)
  starter: 2,   // Amazon + 1 local store
  popular: 99,  // All stores
  pro: 99,      // All stores
};

// ── Build an affiliate search URL from store config ────────────────────────────
// search_url_pattern is typically the base search URL, e.g.:
//   "https://www.amazon.in/s?k="
// affiliate_tag is the tag value, e.g. "giftmind-21"
// We append: <encoded_keyword>&tag=<affiliate_tag>  (for Amazon-style)
// For non-Amazon stores the pattern may already be complete or use a different param.
function buildSearchUrl(store: MarketplaceStore, keyword: string): string {
  const basePattern = store.search_url;

  const encoded = encodeURIComponent(keyword);

  // If the pattern already includes a placeholder token, replace it
  if (basePattern.includes("{keyword}")) {
    const withKeyword = basePattern.replace("{keyword}", encoded);
    if (store.affiliate_param) {
      return `${withKeyword}${store.affiliate_param}`;
    }
    return withKeyword;
  }

  // Otherwise treat the pattern as a prefix (most common format: "https://...?k=")
  if (store.affiliate_param) {
    return `${basePattern}${encoded}${store.affiliate_param}`;
  }
  return `${basePattern}${encoded}`;
}

// ── Fetch stores with country-then-GLOBAL fallback ────────────────────────────
async function fetchStores(targetCountry: string): Promise<MarketplaceStore[]> {
  const { data: countryStores, error: countryError } = await supabaseAdmin
    .from("marketplace_config")
    .select("*")
    .eq("country_code", targetCountry)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (countryError) throw new Error(`DB error fetching stores: ${countryError.message}`);

  if (countryStores && countryStores.length > 0) {
    return countryStores as MarketplaceStore[];
  }

  // No stores for this country — try GLOBAL fallback
  const { data: globalStores, error: globalError } = await supabaseAdmin
    .from("marketplace_config")
    .select("*")
    .eq("country_code", "GLOBAL")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (globalError) throw new Error(`DB error fetching global stores: ${globalError.message}`);

  return (globalStores ?? []) as MarketplaceStore[];
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ── 1. Parse request body ──────────────────────────────────────────────────
    const parsedBody = await parseJsonBody<SearchRequest>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const {
      gift_concepts,
      recipient_country,
      user_country,
      currency,
      budget_min,
      budget_max,
      user_plan,
    } = body;

    // ── 2. Validate required fields ────────────────────────────────────────────
    if (!gift_concepts || !Array.isArray(gift_concepts) || gift_concepts.length === 0) {
      return json({ error: "Missing required field: gift_concepts" }, 400);
    }
    if (!validateBudget(budget_min, budget_max)) {
      return json({ error: "Invalid budget range" }, 400);
    }
    if (!validatePlan(user_plan)) {
      return json({ error: "Invalid user plan" }, 400);
    }
    if (recipient_country && !validateCountryCode(recipient_country)) {
      return json({ error: "Invalid recipient country code" }, 400);
    }
    if (user_country && !validateCountryCode(user_country)) {
      return json({ error: "Invalid user country code" }, 400);
    }

    const cleanGiftConcepts = gift_concepts.slice(0, 10).map((concept) => ({
      ...concept,
      name: sanitizeString(concept.name, 200),
      search_keywords: sanitizeArray(concept.search_keywords ?? [], 10),
      product_category: sanitizeString(concept.product_category, 50),
    }));

    // ── 3. Determine target country ────────────────────────────────────────────
    // Prefer the recipient's country for cross-border gifting
    const targetCountry =
      sanitizeString(recipient_country ?? "", 20).toUpperCase() ||
      sanitizeString(user_country ?? "", 20).toUpperCase() ||
      "US";

    const isCrossBorder =
      !!(recipient_country && user_country) &&
      recipient_country.toUpperCase() !== user_country.toUpperCase();

    // ── 4. Fetch stores ────────────────────────────────────────────────────────
    let allStores: MarketplaceStore[];
    try {
      allStores = await fetchStores(targetCountry);
    } catch (err) {
      console.error("Store fetch error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch marketplace data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // No stores at all — return gracefully with empty results (UI handles messaging)
    if (allStores.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          target_country: targetCountry,
          results: cleanGiftConcepts.map((c) => ({
            gift_name: c.name,
            products: [],
            locked_stores: [],
          })),
          total_stores_available: 0,
          stores_shown: 0,
          is_cross_border: isCrossBorder,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. Apply plan-based store limit ────────────────────────────────────────
    const maxStores = STORE_LIMITS[user_plan] ?? 1;
    const unlockPlan = maxStores <= 1 ? "starter" : "popular";

    // ── 6. Build results per gift concept ──────────────────────────────────────
    const results: GiftResult[] = cleanGiftConcepts.map((concept): GiftResult => {
      // Use the first search keyword (most specific) for URL construction
      const primaryKeyword = concept.search_keywords?.[0] ?? concept.name;

      // Filter stores to those supporting the gift's product_category
      // (stores with empty categories array support everything)
      const categoryMatchedStores = allStores.filter((store) => {
        if (!store.categories || store.categories.length === 0) return true;
        return store.categories.includes(concept.product_category);
      });

      // Split into accessible vs locked
      const accessibleStores = categoryMatchedStores.slice(0, maxStores);
      const lockedStoreSource = categoryMatchedStores.slice(maxStores);

      // Build product links for accessible stores
      const products: ProductLink[] = accessibleStores.map((store): ProductLink => ({
        store_id: store.store_id,
        store_name: store.store_name,
        domain: store.domain,
        brand_color: store.brand_color,
        search_url: buildSearchUrl(store, primaryKeyword),
        is_search_link: true,
        gift_name: concept.name,
        product_category: concept.product_category,
      }));

      // Build locked store placeholders (max 3 shown)
      const locked_stores: LockedStore[] = lockedStoreSource
        .slice(0, 3)
        .map((store): LockedStore => ({
          store_id: store.store_id,
          store_name: store.store_name,
          brand_color: store.brand_color,
          is_locked: true,
          unlock_plan: unlockPlan,
        }));

      return {
        gift_name: concept.name,
        products,
        locked_stores,
      };
    });

    // ── 7. Return success ──────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        target_country: targetCountry,
        results,
        total_stores_available: allStores.length,
        stores_shown: Math.min(maxStores, allStores.length),
        is_cross_border: isCrossBorder,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error in search-products:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
