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

interface MarketplaceProduct {
  id: string;
  store_id: string;
  country_code: string;
  product_title: string;
  product_url: string;
  affiliate_url: string | null;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  original_price_amount: number | null;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "preorder" | "unknown";
  delivery_eta_text: string | null;
  coupon_code: string | null;
  coupon_text: string | null;
  product_category: string | null;
  keyword_tags: string[] | null;
  affiliate_source: string | null;
  attribution_label: string | null;
  is_affiliate: boolean | null;
  priority: number | null;
  is_active: boolean | null;
}

interface ProductLink {
  store_id: string;
  store_name: string;
  domain: string;
  brand_color: string | null;
  gift_name: string;
  product_category: string;
  is_search_link: boolean;
  search_url?: string;
  product_url?: string;
  affiliate_url?: string | null;
  product_title?: string | null;
  image_url?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  original_price_amount?: number | null;
  stock_status?: string | null;
  delivery_eta_text?: string | null;
  coupon_code?: string | null;
  coupon_text?: string | null;
  affiliate_source?: string | null;
  attribution_label?: string | null;
  is_affiliate?: boolean | null;
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
  spark: 1,         // Amazon only (top-priority store)
  thoughtful: 2,    // Amazon + 1 local store
  confident: 99,    // All stores
  "gifting-pro": 99, // All stores
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

async function fetchProducts(targetCountry: string, storeIds: string[]): Promise<MarketplaceProduct[]> {
  if (storeIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("marketplace_products")
    .select("*")
    .in("store_id", storeIds)
    .in("country_code", [targetCountry, "GLOBAL"])
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(`DB error fetching marketplace products: ${error.message}`);
  return (data ?? []) as MarketplaceProduct[];
}

function tokenize(input: string): string[] {
  return sanitizeString(input, 200)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);
}

function scoreProduct(product: MarketplaceProduct, concept: GiftConcept, targetCountry: string, budgetMin: number, budgetMax: number) {
  let score = 0;

  const title = sanitizeString(product.product_title, 200).toLowerCase();
  const tags = (product.keyword_tags ?? []).map((tag) => sanitizeString(tag, 100).toLowerCase());
  const category = sanitizeString(product.product_category ?? "", 100).toLowerCase();
  const keywordPhrases = [concept.name, ...(concept.search_keywords ?? [])]
    .map((value) => sanitizeString(value, 120).toLowerCase())
    .filter(Boolean);
  const keywordTokens = [...new Set(keywordPhrases.flatMap(tokenize))];

  keywordPhrases.forEach((phrase) => {
    if (phrase && title.includes(phrase)) score += 14;
    if (phrase && tags.some((tag) => tag.includes(phrase))) score += 10;
  });

  keywordTokens.forEach((token) => {
    if (title.includes(token)) score += 4;
    if (tags.some((tag) => tag.includes(token))) score += 3;
  });

  if (category && category === concept.product_category.toLowerCase()) score += 10;
  if (product.country_code === targetCountry) score += 4;

  if (typeof product.price_amount === "number" && Number.isFinite(product.price_amount)) {
    if (product.price_amount >= budgetMin && product.price_amount <= budgetMax) {
      score += 12;
      const distance = Math.abs(product.price_amount - concept.price_anchor);
      score += Math.max(0, 8 - Math.round(distance / Math.max(1, concept.price_anchor || 1) * 10));
    } else {
      score -= 10;
    }
  }

  if (product.stock_status === "in_stock") score += 6;
  if (product.stock_status === "low_stock") score += 3;
  if (product.stock_status === "preorder") score += 1;
  if (product.stock_status === "out_of_stock") score -= 20;

  return score;
}

function buildEnrichedProductLink(store: MarketplaceStore, concept: GiftConcept, product: MarketplaceProduct): ProductLink {
  return {
    store_id: store.store_id,
    store_name: store.store_name,
    domain: store.domain,
    brand_color: store.brand_color,
    gift_name: concept.name,
    product_category: concept.product_category,
    is_search_link: false,
    product_url: product.product_url,
    affiliate_url: product.affiliate_url,
    product_title: product.product_title,
    image_url: product.image_url,
    price_amount: product.price_amount,
    price_currency: product.price_currency,
    original_price_amount: product.original_price_amount,
    stock_status: product.stock_status,
    delivery_eta_text: product.delivery_eta_text,
    coupon_code: product.coupon_code,
    coupon_text: product.coupon_text,
    affiliate_source: product.affiliate_source,
    attribution_label: product.attribution_label,
    is_affiliate: product.is_affiliate,
  };
}

function buildSearchProductLink(store: MarketplaceStore, concept: GiftConcept, keyword: string): ProductLink {
  return {
    store_id: store.store_id,
    store_name: store.store_name,
    domain: store.domain,
    brand_color: store.brand_color,
    gift_name: concept.name,
    product_category: concept.product_category,
    is_search_link: true,
    search_url: buildSearchUrl(store, keyword),
    attribution_label: store.affiliate_param ? "Affiliate search" : "Search",
    is_affiliate: Boolean(store.affiliate_param),
  };
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
    // ── 1. Authenticate caller ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from("users")
      .select("active_plan")
      .eq("id", user.id)
      .single();

    if (userDataError || !userData) {
      return json({ error: "Failed to retrieve user profile" }, 500);
    }

    const serverPlan = userData.active_plan ?? "spark";

    // ── 2. Parse request body ─────────────────────────────────────────────────
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
    } = body;

    // ── 2. Validate required fields ────────────────────────────────────────────
    if (!gift_concepts || !Array.isArray(gift_concepts) || gift_concepts.length === 0) {
      return json({ error: "Missing required field: gift_concepts" }, 400);
    }
    if (!validateBudget(budget_min, budget_max)) {
      return json({ error: "Invalid budget range" }, 400);
    }
    if (!validatePlan(serverPlan)) {
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

    const storeIds = allStores.map((store) => store.store_id);
    let catalogProducts: MarketplaceProduct[] = [];
    try {
      catalogProducts = await fetchProducts(targetCountry, storeIds);
    } catch (err) {
      console.error("Marketplace product fetch error:", err);
    }

    // ── 5. Apply plan-based store limit ────────────────────────────────────────
    const maxStores = STORE_LIMITS[serverPlan] ?? 1;
    const unlockPlan = maxStores <= 1 ? "thoughtful" : "confident";

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

      const products: ProductLink[] = accessibleStores.map((store): ProductLink => {
        const matchedProducts = catalogProducts
          .filter((product) => {
            if (product.store_id !== store.store_id) return false;
            if (product.product_category && product.product_category !== concept.product_category) return false;
            if (!(product.country_code === targetCountry || product.country_code === "GLOBAL")) return false;
            return true;
          })
          .map((product) => ({
            product,
            score: scoreProduct(product, concept, targetCountry, budget_min, budget_max),
          }))
          .sort((left, right) => right.score - left.score || (left.product.priority ?? 0) - (right.product.priority ?? 0));

        const topMatch = matchedProducts[0];
        if (topMatch && topMatch.score > 0) {
          return buildEnrichedProductLink(store, concept, topMatch.product);
        }

        return buildSearchProductLink(store, concept, primaryKeyword);
      });

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
        enriched_products_returned: results.reduce(
          (sum, result) => sum + result.products.filter((product) => !product.is_search_link).length,
          0,
        ),
        total_stores_available: allStores.length,
        stores_shown: Math.min(maxStores, allStores.length),
        is_cross_border: isCrossBorder,
        server_plan: serverPlan,
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
