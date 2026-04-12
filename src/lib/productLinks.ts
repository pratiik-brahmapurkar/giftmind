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

export interface LockedStore {
  store_id: string;
  store_name: string;
  brand_color: string | null;
  is_locked: boolean;
  unlock_plan: string;
}

export interface ProductResult {
  gift_name: string;
  products: ProductLink[];
  locked_stores: LockedStore[];
}

export function getOutboundProductUrl(product: ProductLink) {
  return product.affiliate_url || product.product_url || product.search_url || "";
}
