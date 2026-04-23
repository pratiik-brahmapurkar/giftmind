import type { Json } from "@/integrations/supabase/types";

export const CATEGORY_SUGGESTIONS = [
  "electronics",
  "fashion",
  "accessories",
  "beauty",
  "home_decor",
  "kitchen",
  "books",
  "personalized",
  "flowers_cakes",
  "jewelry",
  "wellness",
  "toys_kids",
  "sports",
  "luxury",
  "handmade",
  "food",
  "experience",
  "general",
] as const;

export const STORE_LIMITS: Record<string, number> = {
  spark: 1,
  thoughtful: 2,
  confident: 99,
  "gifting-pro": 99,
};

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "preorder" | "unknown";

export interface MarketplaceStoreLike {
  id?: string;
  store_id: string;
  store_name: string;
  domain: string;
  country_code: string;
  search_url: string;
  affiliate_param?: string | null;
  brand_color?: string | null;
  categories?: string[] | null;
  priority?: number | null;
  is_active?: boolean | null;
  notes?: string | null;
  affiliate_network?: string | null;
  affiliate_variants?: Json | null;
}

export interface MarketplaceProductLike {
  id: string;
  store_id: string;
  country_code: string;
  product_title: string;
  product_url: string;
  affiliate_url?: string | null;
  image_url?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  original_price_amount?: number | null;
  stock_status: StockStatus;
  delivery_eta_text?: string | null;
  coupon_code?: string | null;
  coupon_text?: string | null;
  product_category?: string | null;
  keyword_tags?: string[] | null;
  affiliate_source?: string | null;
  attribution_label?: string | null;
  is_affiliate?: boolean | null;
  priority?: number | null;
  is_active?: boolean | null;
  metadata?: Json | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GiftConceptInput {
  name: string;
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
}

export interface PreviewRow {
  store_id: string;
  store_name: string;
  domain: string;
  score: number;
  is_search_link: boolean;
  product_title: string | null;
  price_amount: number | null;
  stock_status: StockStatus | null;
  keyword: string;
  match_reason: string;
}

export interface PreviewResult {
  rows: PreviewRow[];
  total_stores_available: number;
  stores_shown: number;
  locked_store_count_total: number;
  is_global_fallback: boolean;
  target_country: string;
}

interface AffiliateVariant {
  param: string;
  weight?: number;
  label?: string;
}

function sanitizeString(input: string | null | undefined, maxLength: number) {
  return String(input ?? "").trim().slice(0, maxLength);
}

function normalizeScalarJson(value: Json | null | undefined) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function normalizeAffiliateVariants(value: Json | null | undefined): AffiliateVariant[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

      const param = normalizeScalarJson(entry.param as Json | undefined);
      const weightValue = entry.weight as Json | undefined;
      const label = normalizeScalarJson(entry.label as Json | undefined);

      if (!param) return null;

      let weight = 1;
      if (typeof weightValue === "number" && Number.isFinite(weightValue) && weightValue > 0) {
        weight = weightValue;
      }

      return {
        param: param.trim(),
        weight,
        label: label?.trim() || undefined,
      };
    })
    .filter((entry): entry is AffiliateVariant => Boolean(entry?.param));
}

function hashSeed(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickAffiliateParam(store: MarketplaceStoreLike, identitySeed?: string | null) {
  const variants = normalizeAffiliateVariants(store.affiliate_variants);
  if (variants.length === 0) {
    return sanitizeString(store.affiliate_param, 500) || null;
  }

  const totalWeight = variants.reduce((sum, variant) => sum + Math.max(1, variant.weight ?? 1), 0);
  const bucket = hashSeed(`${identitySeed ?? "anonymous"}:${store.store_id}`) % totalWeight;

  let cursor = 0;
  for (const variant of variants) {
    cursor += Math.max(1, variant.weight ?? 1);
    if (bucket < cursor) {
      return variant.param;
    }
  }

  return variants[0]?.param ?? (sanitizeString(store.affiliate_param, 500) || null);
}

export function buildSearchUrl(store: MarketplaceStoreLike, keyword: string, identitySeed?: string | null): string {
  const basePattern = sanitizeString(store.search_url, 500);
  const encoded = encodeURIComponent(keyword);
  const affiliateParam = pickAffiliateParam(store, identitySeed);

  if (basePattern.includes("{keyword}")) {
    const withKeyword = basePattern.replace("{keyword}", encoded);
    return affiliateParam ? `${withKeyword}${affiliateParam}` : withKeyword;
  }

  return affiliateParam ? `${basePattern}${encoded}${affiliateParam}` : `${basePattern}${encoded}`;
}

export function tokenize(input: string): string[] {
  return sanitizeString(input, 200)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);
}

export function scoreProductMatch(
  product: MarketplaceProductLike,
  concept: GiftConceptInput,
  targetCountry: string,
  budgetMin: number,
  budgetMax: number,
) {
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
      const anchor = Math.max(1, concept.price_anchor || 1);
      const distance = Math.abs(product.price_amount - concept.price_anchor);
      score += Math.max(0, 8 - Math.round((distance / anchor) * 10));
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

export function storeSupportsCategory(store: MarketplaceStoreLike, category: string) {
  if (!store.categories || store.categories.length === 0) return true;
  return store.categories.includes(category);
}

export function simulateMarketplacePreview({
  stores,
  products,
  concept,
  targetCountry,
  budgetMin,
  budgetMax,
  userPlan,
  identitySeed,
  isGlobalFallback = false,
}: {
  stores: MarketplaceStoreLike[];
  products: MarketplaceProductLike[];
  concept: GiftConceptInput;
  targetCountry: string;
  budgetMin: number;
  budgetMax: number;
  userPlan: string;
  identitySeed?: string | null;
  isGlobalFallback?: boolean;
}): PreviewResult {
  const eligibleStores = stores
    .filter((store) => (store.is_active ?? true) && storeSupportsCategory(store, concept.product_category))
    .sort((left, right) => (left.priority ?? 999) - (right.priority ?? 999));

  const storesShown = Math.min(STORE_LIMITS[userPlan] ?? 1, eligibleStores.length);
  const accessibleStores = eligibleStores.slice(0, storesShown);
  const primaryKeyword = concept.search_keywords[0] ?? concept.name;

  const rows = accessibleStores.map((store) => {
    const matchedProducts = products
      .filter((product) => {
        if (!(product.is_active ?? true)) return false;
        if (product.store_id !== store.store_id) return false;
        if (!(product.country_code === targetCountry || product.country_code === "GLOBAL")) return false;
        if (product.product_category && product.product_category !== concept.product_category) return false;
        return true;
      })
      .map((product) => ({
        product,
        score: scoreProductMatch(product, concept, targetCountry, budgetMin, budgetMax),
      }))
      .sort((left, right) => right.score - left.score || (left.product.priority ?? 0) - (right.product.priority ?? 0));

    const topMatch = matchedProducts[0];
    if (topMatch && topMatch.score > 0) {
      return {
        store_id: store.store_id,
        store_name: store.store_name,
        domain: store.domain,
        score: topMatch.score,
        is_search_link: false,
        product_title: topMatch.product.product_title,
        price_amount: topMatch.product.price_amount ?? null,
        stock_status: topMatch.product.stock_status,
        keyword: primaryKeyword,
        match_reason: "Top curated catalog match",
      } satisfies PreviewRow;
    }

    buildSearchUrl(store, primaryKeyword, identitySeed);

    return {
      store_id: store.store_id,
      store_name: store.store_name,
      domain: store.domain,
      score: 0,
      is_search_link: true,
      product_title: null,
      price_amount: null,
      stock_status: null,
      keyword: primaryKeyword,
      match_reason: "Fallback to live search link",
    } satisfies PreviewRow;
  });

  return {
    rows,
    total_stores_available: eligibleStores.length,
    stores_shown: accessibleStores.length,
    locked_store_count_total: Math.max(0, eligibleStores.length - accessibleStores.length),
    is_global_fallback: isGlobalFallback,
    target_country: targetCountry,
  };
}
