import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Globe2,
  GripVertical,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { SEOHead } from "@/components/common/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { parseCsv, toCsv } from "@/lib/csv";
import { SUPPORTED_COUNTRIES } from "@/lib/geoConfig";
import {
  CATEGORY_SUGGESTIONS,
  buildSearchUrl,
  normalizeAffiliateVariants,
  simulateMarketplacePreview,
  type PreviewResult,
  type StockStatus,
} from "@/lib/marketplaceMatching";

const COUNTRY_OPTIONS = [
  ...SUPPORTED_COUNTRIES.filter((country) => country.code !== "OTHER"),
  { code: "GLOBAL", name: "Global Fallback", flag: "🌍" },
] as const;

const AFFILIATE_NETWORK_OPTIONS = [
  "amazon_associates",
  "flipkart_affiliate",
  "impact",
  "rakuten",
  "admitad",
  "cj_affiliate",
  "direct",
  "other",
] as const;

const STOCK_OPTIONS: StockStatus[] = ["in_stock", "low_stock", "out_of_stock", "preorder", "unknown"];
const TEST_STORAGE_KEY = "gm_marketplace_tests";
const PRODUCT_IMPORT_REQUIRED_HEADERS = [
  "store_id",
  "country_code",
  "product_title",
  "product_url",
  "product_category",
  "keyword_tags",
  "stock_status",
];

type MarketplaceRow = Database["public"]["Tables"]["marketplace_config"]["Row"];
type MarketplaceInsert = Database["public"]["Tables"]["marketplace_config"]["Insert"];
type MarketplaceProductRow = Database["public"]["Tables"]["marketplace_products"]["Row"];
type MarketplaceProductInsert = Database["public"]["Tables"]["marketplace_products"]["Insert"];
type ProductClickRow = Database["public"]["Tables"]["product_clicks"]["Row"];
type CatalogHealthRow = Database["public"]["Views"]["admin_product_catalog_health"]["Row"];

type ClickStats = Record<string, { total: number; month: number }>;
type SaveErrorMap = Record<string, string>;
type SavingMap = Record<string, boolean>;
type CategoryInputMap = Record<string, string>;
type VariantInputMap = Record<string, string>;
type TestStateMap = Record<string, { at: string; status: "working" | "manual" | "unreachable"; message: string }>;

interface AddStoreForm {
  store_id: string;
  store_name: string;
  domain: string;
  search_url: string;
  affiliate_param: string;
  brand_color: string;
  priority: number;
  categories: string[];
  notes: string;
  affiliate_network: string;
  affiliate_variants: string;
}

interface ProductFormState {
  id: string | null;
  store_id: string;
  country_code: string;
  product_title: string;
  product_url: string;
  affiliate_url: string;
  image_url: string;
  price_amount: string;
  price_currency: string;
  original_price_amount: string;
  stock_status: StockStatus;
  delivery_eta_text: string;
  coupon_code: string;
  coupon_text: string;
  product_category: string;
  keyword_tags: string;
  affiliate_source: string;
  attribution_label: string;
  is_affiliate: boolean;
  priority: string;
  is_active: boolean;
}

interface PreviewFormState {
  name: string;
  keywords: string;
  product_category: string;
  price_anchor: string;
  budget_min: string;
  budget_max: string;
  country_code: string;
  plan: string;
}

interface ImportPreviewState {
  fileName: string;
  validRows: MarketplaceProductInsert[];
  errors: string[];
}

const EMPTY_STORE_FORM: AddStoreForm = {
  store_id: "",
  store_name: "",
  domain: "",
  search_url: "",
  affiliate_param: "",
  brand_color: "#888888",
  priority: 1,
  categories: [],
  notes: "",
  affiliate_network: "",
  affiliate_variants: "[]",
};

const EMPTY_PRODUCT_FORM: ProductFormState = {
  id: null,
  store_id: "",
  country_code: "IN",
  product_title: "",
  product_url: "",
  affiliate_url: "",
  image_url: "",
  price_amount: "",
  price_currency: "USD",
  original_price_amount: "",
  stock_status: "in_stock",
  delivery_eta_text: "",
  coupon_code: "",
  coupon_text: "",
  product_category: CATEGORY_SUGGESTIONS[0],
  keyword_tags: "",
  affiliate_source: "",
  attribution_label: "",
  is_affiliate: true,
  priority: "0",
  is_active: true,
};

const EMPTY_PREVIEW_FORM: PreviewFormState = {
  name: "Merino Running Headband",
  keywords: "merino, headband, running, wool, cold weather",
  product_category: "sports",
  price_anchor: "42",
  budget_min: "30",
  budget_max: "75",
  country_code: "IN",
  plan: "spark",
};

function parseCountryHash(hash: string) {
  const clean = hash.replace(/^#/, "").toUpperCase();
  return COUNTRY_OPTIONS.some((country) => country.code === clean) ? clean : "IN";
}

function normalizeCategories(categories: string[] | null | undefined) {
  return (categories ?? []).map((category) => category.trim()).filter(Boolean);
}

function isValidUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function readTestState(): TestStateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeTestState(next: TestStateMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(next));
}

function formatTestTimestamp(value?: string) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function countryMeta(countryCode: string) {
  return COUNTRY_OPTIONS.find((country) => country.code === countryCode) ?? { code: countryCode, name: countryCode, flag: "🌍" };
}

function csvDownload(name: string, headers: string[], rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  const csv = toCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function tagList(value: string) {
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatPrice(amount: number | null | undefined, currency = "USD") {
  if (amount == null) return "No price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function stockLabel(status: string) {
  return status.replaceAll("_", " ");
}

function staleDays(updatedAt: string | null) {
  if (!updatedAt) return null;
  const diff = Date.now() - new Date(updatedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function parseAffiliateVariantsInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: [] as Json, error: "" };
  }

  try {
    const parsed = JSON.parse(trimmed) as Json;
    const normalized = normalizeAffiliateVariants(parsed);
    if (Array.isArray(parsed) && parsed.length > 0 && normalized.length === 0) {
      return {
        value: [] as Json,
        error: "Affiliate variants must be an array of objects with at least a `param` field.",
      };
    }
    return { value: parsed, error: "" };
  } catch {
    return { value: [] as Json, error: "Affiliate variants must be valid JSON." };
  }
}

function buildPreviewUrl(store: MarketplaceRow) {
  if (!store.search_url.trim()) return "";
  return buildSearchUrl(store, "birthday gift", "manual-preview");
}

function sanitizeNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildProductFormFromRow(product: MarketplaceProductRow): ProductFormState {
  return {
    id: product.id,
    store_id: product.store_id,
    country_code: product.country_code,
    product_title: product.product_title,
    product_url: product.product_url,
    affiliate_url: product.affiliate_url ?? "",
    image_url: product.image_url ?? "",
    price_amount: product.price_amount?.toString() ?? "",
    price_currency: product.price_currency ?? "USD",
    original_price_amount: product.original_price_amount?.toString() ?? "",
    stock_status: (product.stock_status as StockStatus) ?? "unknown",
    delivery_eta_text: product.delivery_eta_text ?? "",
    coupon_code: product.coupon_code ?? "",
    coupon_text: product.coupon_text ?? "",
    product_category: product.product_category ?? "general",
    keyword_tags: (product.keyword_tags ?? []).join(", "),
    affiliate_source: product.affiliate_source ?? "",
    attribution_label: product.attribution_label ?? "",
    is_affiliate: product.is_affiliate,
    priority: String(product.priority ?? 0),
    is_active: product.is_active,
  };
}

function validateProductForm(form: ProductFormState) {
  const keywordTags = tagList(form.keyword_tags);
  if (!form.store_id) return { error: "Store is required.", payload: null };
  if (!COUNTRY_OPTIONS.some((country) => country.code === form.country_code)) return { error: "Choose a valid country.", payload: null };
  if (!form.product_title.trim() || form.product_title.trim().length > 300) return { error: "Product title is required and must be under 300 characters.", payload: null };
  if (!isValidUrl(form.product_url)) return { error: "Product URL must start with http:// or https://.", payload: null };
  if (form.affiliate_url.trim() && !isValidUrl(form.affiliate_url)) return { error: "Affiliate URL must start with http:// or https://.", payload: null };
  if (form.image_url.trim() && !isValidUrl(form.image_url)) return { error: "Image URL must start with http:// or https://.", payload: null };
  if (!CATEGORY_SUGGESTIONS.includes(form.product_category as (typeof CATEGORY_SUGGESTIONS)[number])) {
    return { error: "Choose a valid product category.", payload: null };
  }
  if (keywordTags.length < 2 || keywordTags.length > 20) {
    return { error: "Provide between 2 and 20 keyword tags.", payload: null };
  }

  const priceAmount = sanitizeNumberInput(form.price_amount);
  const originalPriceAmount = sanitizeNumberInput(form.original_price_amount);
  const priority = sanitizeNumberInput(form.priority);

  if (priceAmount !== null && Number.isNaN(priceAmount)) return { error: "Price must be a valid number.", payload: null };
  if (originalPriceAmount !== null && Number.isNaN(originalPriceAmount)) return { error: "Original price must be a valid number.", payload: null };
  if (priority === null || Number.isNaN(priority)) return { error: "Priority is required.", payload: null };

  const payload: MarketplaceProductInsert = {
    store_id: form.store_id,
    country_code: form.country_code,
    product_title: form.product_title.trim(),
    product_url: form.product_url.trim(),
    affiliate_url: form.affiliate_url.trim() || null,
    image_url: form.image_url.trim() || null,
    price_amount: priceAmount,
    price_currency: form.price_currency.trim() || "USD",
    original_price_amount: originalPriceAmount,
    stock_status: form.stock_status,
    delivery_eta_text: form.delivery_eta_text.trim() || null,
    coupon_code: form.coupon_code.trim() || null,
    coupon_text: form.coupon_text.trim() || null,
    product_category: form.product_category,
    keyword_tags: keywordTags,
    affiliate_source: form.affiliate_source.trim() || null,
    attribution_label: form.attribution_label.trim() || null,
    is_affiliate: form.is_affiliate,
    priority,
    is_active: form.is_active,
  };

  return { error: "", payload };
}

function parseProductCsvRecord(record: Record<string, string>) {
  const missingHeaders = PRODUCT_IMPORT_REQUIRED_HEADERS.filter((header) => !(header in record));
  if (missingHeaders.length > 0) {
    return { error: `Missing required headers: ${missingHeaders.join(", ")}` };
  }

  const payloadForm: ProductFormState = {
    ...EMPTY_PRODUCT_FORM,
    store_id: record.store_id || "",
    country_code: (record.country_code || "GLOBAL").toUpperCase(),
    product_title: record.product_title || "",
    product_url: record.product_url || "",
    affiliate_url: record.affiliate_url || "",
    image_url: record.image_url || "",
    price_amount: record.price_amount || "",
    price_currency: record.price_currency || "USD",
    original_price_amount: record.original_price_amount || "",
    stock_status: (record.stock_status || "unknown") as StockStatus,
    delivery_eta_text: record.delivery_eta_text || "",
    coupon_code: record.coupon_code || "",
    coupon_text: record.coupon_text || "",
    product_category: record.product_category || "",
    keyword_tags: (record.keyword_tags || "").replaceAll(";", ","),
    affiliate_source: record.affiliate_source || "",
    attribution_label: record.attribution_label || "",
    is_affiliate: record.is_affiliate ? record.is_affiliate.toLowerCase() !== "false" : true,
    priority: record.priority || "0",
    is_active: record.is_active ? record.is_active.toLowerCase() !== "false" : true,
  };

  return validateProductForm(payloadForm);
}

function StoreCard({
  store,
  original,
  clickStats,
  testState,
  categoryInput,
  affiliateVariantsInput,
  affiliateVariantsError,
  isSaving,
  saveError,
  onFieldChange,
  onAffiliateVariantsChange,
  onToggleActive,
  onSave,
  onDelete,
  onCopyAffiliate,
  onTestLink,
  onCategoryInputChange,
  onAddCategory,
  onRemoveCategory,
}: {
  store: MarketplaceRow;
  original: MarketplaceRow | undefined;
  clickStats: { total: number; month: number };
  testState?: TestStateMap[string];
  categoryInput: string;
  affiliateVariantsInput: string;
  affiliateVariantsError: string;
  isSaving: boolean;
  saveError?: string;
  onFieldChange: (patch: Partial<MarketplaceRow>) => void;
  onAffiliateVariantsChange: (value: string) => void;
  onToggleActive: (next: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
  onCopyAffiliate: () => void;
  onTestLink: () => void;
  onCategoryInputChange: (value: string) => void;
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
}) {
  const categories = normalizeCategories(store.categories);
  const dirty = JSON.stringify({
    affiliate_param: store.affiliate_param,
    search_url: store.search_url,
    brand_color: store.brand_color,
    priority: store.priority,
    categories,
    is_active: store.is_active,
    notes: store.notes,
    affiliate_network: store.affiliate_network,
    affiliate_variants: store.affiliate_variants,
  }) !== JSON.stringify({
    affiliate_param: original?.affiliate_param,
    search_url: original?.search_url,
    brand_color: original?.brand_color,
    priority: original?.priority,
    categories: normalizeCategories(original?.categories),
    is_active: original?.is_active,
    notes: original?.notes,
    affiliate_network: original?.affiliate_network,
    affiliate_variants: original?.affiliate_variants ?? [],
  });

  return (
    <Card className={`${store.is_active ? "" : "opacity-60"} ${saveError ? "border-destructive" : ""} transition-all`}>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start gap-4">
          <div className="hidden pt-2 text-muted-foreground lg:block">
            <GripVertical className="h-4 w-4" />
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: store.brand_color || "#888888" }}
          >
            {store.store_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-base font-semibold text-foreground">{store.store_name}</p>
                <p className="text-sm text-muted-foreground">{store.domain}</p>
                <p className="mt-1 text-xs text-muted-foreground">Store ID: {store.store_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-xs font-medium ${store.is_active ? "text-emerald-600" : "text-rose-600"}`}>
                    {store.is_active ? "Active" : "Inactive"}
                  </p>
                  <Badge variant="secondary" className="mt-1">Priority: {store.priority ?? 0}</Badge>
                </div>
                <Switch checked={Boolean(store.is_active)} onCheckedChange={onToggleActive} />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Affiliate Tag</Label>
            <div className="flex gap-2">
              <Input
                value={store.affiliate_param ?? ""}
                onChange={(event) => onFieldChange({ affiliate_param: event.target.value })}
                placeholder="&tag=giftmind-21"
              />
              <Button variant="outline" size="icon" onClick={onCopyAffiliate} aria-label={`Copy affiliate tag for ${store.store_name}`}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Search URL Pattern</Label>
            <Input
              value={store.search_url}
              onChange={(event) => onFieldChange({ search_url: event.target.value })}
              placeholder="https://www.amazon.in/s?k="
            />
            <p className="text-xs text-muted-foreground break-all">
              Preview: {buildPreviewUrl(store) || "Enter a valid search URL to preview the final link."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  value={store.brand_color ?? "#888888"}
                  onChange={(event) => onFieldChange({ brand_color: event.target.value })}
                />
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border">
                  <input
                    className="sr-only"
                    type="color"
                    value={isValidHex(store.brand_color ?? "") ? (store.brand_color as string) : "#888888"}
                    onChange={(event) => onFieldChange({ brand_color: event.target.value })}
                  />
                  <span className="h-5 w-5 rounded-sm border" style={{ backgroundColor: store.brand_color ?? "#888888" }} />
                </label>
              </div>
              {!isValidHex(store.brand_color ?? "") ? <p className="text-xs text-destructive">Use a valid hex color like #FF9900.</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Priority (lower = shown first)</Label>
              <Input
                type="number"
                min="1"
                max="99"
                value={store.priority ?? 1}
                onChange={(event) => onFieldChange({ priority: Number(event.target.value) || 1 })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Affiliate Network</Label>
              <select
                value={store.affiliate_network ?? ""}
                onChange={(event) => onFieldChange({ affiliate_network: event.target.value || null })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Unspecified</option>
                {AFFILIATE_NETWORK_OPTIONS.map((network) => (
                  <option key={network} value={network}>{network}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Input
                value={store.notes ?? ""}
                onChange={(event) => onFieldChange({ notes: event.target.value })}
                placeholder="Marketplace notes for ops"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Affiliate Variants JSON</Label>
            <Textarea
              value={affiliateVariantsInput}
              onChange={(event) => onAffiliateVariantsChange(event.target.value)}
              className="min-h-[120px] font-mono text-xs"
              placeholder='[{"param":"&tag=giftmind-a","weight":1},{"param":"&tag=giftmind-b","weight":1}]'
            />
            {affiliateVariantsError ? <p className="text-xs text-destructive">{affiliateVariantsError}</p> : (
              <p className="text-xs text-muted-foreground">Optional weighted variants for deterministic A/B affiliate-tag tests.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {categories.length === 0 ? <Badge variant="outline">All gift types</Badge> : null}
              {categories.map((category) => (
                <Badge key={category} variant="secondary" className="gap-1">
                  {category}
                  <button type="button" onClick={() => onRemoveCategory(category)} aria-label={`Remove ${category}`}>
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={categoryInput}
                onChange={(event) => onCategoryInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddCategory();
                  }
                }}
                placeholder="Add category"
                list={`categories-${store.id}`}
              />
              <datalist id={`categories-${store.id}`}>
                {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
              </datalist>
              <Button variant="outline" onClick={onAddCategory}>+ Add</Button>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2 lg:flex-row">
          <Button variant="outline" onClick={onTestLink} disabled={!isValidUrl(store.search_url)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Test Link
          </Button>
          <Button onClick={onSave} disabled={!dirty || isSaving || !isValidUrl(store.search_url) || !isValidHex(store.brand_color ?? "") || Number(store.priority ?? 0) < 1 || Boolean(affiliateVariantsError)}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>

        {saveError ? <p className="text-sm text-destructive">Failed to save: {saveError}</p> : null}

        <div className="flex flex-col gap-2 text-xs text-muted-foreground xl:flex-row xl:items-center xl:justify-between">
          <p>
            Last tested: {formatTestTimestamp(testState?.at)}
            {testState ? ` | ${testState.status === "unreachable" ? "❌" : "✅"} ${testState.message}` : ""}
          </p>
          <p>Total clicks: {clickStats.total} | This month: {clickStats.month}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductCard({
  product,
  storeName,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  product: MarketplaceProductRow;
  storeName: string;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const stale = staleDays(product.updated_at);
  const isStale = typeof stale === "number" && stale >= 14;

  return (
    <Card className={`${product.is_active ? "" : "opacity-65"} transition-all`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-4">
          {product.image_url ? (
            <img src={product.image_url} alt={product.product_title} className="h-16 w-16 rounded-xl border object-cover" loading="lazy" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="line-clamp-2 text-base font-semibold text-foreground">{product.product_title}</p>
              {!product.is_active ? <Badge variant="outline">Inactive</Badge> : null}
              {isStale ? <Badge variant="outline" className="border-amber-300 text-amber-800">Stale {stale}d</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Store: {storeName} · {product.country_code} · {product.product_category || "general"} · {formatPrice(product.price_amount, product.price_currency || "USD")} · {stockLabel(product.stock_status)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Priority {product.priority}</Badge>
              {(product.keyword_tags ?? []).slice(0, 6).map((tag) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onEdit}>Edit</Button>
          <Button variant="outline" onClick={onToggleActive}>{product.is_active ? "Deactivate" : "Activate"}</Button>
          <Button variant="outline" onClick={() => window.open(product.product_url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Product
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export default function AdminMarketplaces() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"stores" | "products" | "health">("stores");
  const [selectedCountry, setSelectedCountry] = useState<string>(() => parseCountryHash(window.location.hash));
  const [allStores, setAllStores] = useState<MarketplaceRow[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedStoreSearch, setDebouncedStoreSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [testState, setTestState] = useState<TestStateMap>(() => readTestState());
  const [categoryInputs, setCategoryInputs] = useState<CategoryInputMap>({});
  const [affiliateVariantInputs, setAffiliateVariantInputs] = useState<VariantInputMap>({});
  const [savingMap, setSavingMap] = useState<SavingMap>({});
  const [saveErrors, setSaveErrors] = useState<SaveErrorMap>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddSaving, setIsAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [addCategoryInput, setAddCategoryInput] = useState("");
  const [deleteStore, setDeleteStore] = useState<MarketplaceRow | null>(null);
  const [bulkAction, setBulkAction] = useState<null | "activate" | "deactivate">(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testProgress, setTestProgress] = useState("");
  const [addForm, setAddForm] = useState<AddStoreForm>({ ...EMPTY_STORE_FORM });
  const [productCountryFilter, setProductCountryFilter] = useState<string>(() => parseCountryHash(window.location.hash));
  const [productStoreFilter, setProductStoreFilter] = useState("all");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState("all");
  const [healthCountryFilter, setHealthCountryFilter] = useState<string>(() => parseCountryHash(window.location.hash));
  const [healthStoreFilter, setHealthStoreFilter] = useState("all");
  const [visibleProductCount, setVisibleProductCount] = useState(24);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productDialogError, setProductDialogError] = useState("");
  const [isProductSaving, setIsProductSaving] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>({ ...EMPTY_PRODUCT_FORM });
  const [deleteProduct, setDeleteProduct] = useState<MarketplaceProductRow | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const [previewForm, setPreviewForm] = useState<PreviewFormState>({ ...EMPTY_PREVIEW_FORM });
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [isCatalogCleanupRunning, setIsCatalogCleanupRunning] = useState(false);

  const selectedMeta = countryMeta(selectedCountry);

  const storesQuery = useQuery({
    queryKey: ["admin-marketplaces", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_config")
        .select("*")
        .order("country_code", { ascending: true })
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MarketplaceRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["admin-marketplaces", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_products")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketplaceProductRow[];
    },
  });

  const catalogHealthQuery = useQuery({
    queryKey: ["admin-marketplaces", "catalog-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_product_catalog_health")
        .select("*");
      if (error) throw error;
      return (data ?? []) as CatalogHealthRow[];
    },
  });

  const clicksQuery = useQuery({
    queryKey: ["admin-marketplaces", "clicks", selectedCountry],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from("product_clicks")
        .select("store, store_id, clicked_at, country, gift_concept_name, is_search_link, estimated_price, recommendation_confidence")
        .eq("country", selectedCountry)
        .gte("clicked_at", since.toISOString());
      if (error) throw error;
      return (data ?? []) as ProductClickRow[];
    },
  });

  useEffect(() => {
    setAllStores(storesQuery.data ?? []);
  }, [storesQuery.data]);

  useEffect(() => {
    setAffiliateVariantInputs((prev) => {
      const next = { ...prev };
      (storesQuery.data ?? []).forEach((store) => {
        next[store.id] = next[store.id] ?? JSON.stringify(store.affiliate_variants ?? [], null, 2);
      });
      return next;
    });
  }, [storesQuery.data]);

  useEffect(() => {
    const next = window.setTimeout(() => setDebouncedStoreSearch(storeSearch.trim().toLowerCase()), 250);
    return () => window.clearTimeout(next);
  }, [storeSearch]);

  useEffect(() => {
    const next = window.setTimeout(() => setDebouncedProductSearch(productSearch.trim().toLowerCase()), 250);
    return () => window.clearTimeout(next);
  }, [productSearch]);

  useEffect(() => {
    const nextCountry = parseCountryHash(location.hash);
    setSelectedCountry(nextCountry);
    setProductCountryFilter((current) => (current === "all" ? current : nextCountry));
    setHealthCountryFilter((current) => (current === "all" ? current : nextCountry));
    setPreviewForm((prev) => ({ ...prev, country_code: nextCountry }));
  }, [location.hash]);

  useEffect(() => {
    setAddForm((prev) => ({ ...prev, priority: Math.max(1, allStores.filter((store) => store.country_code === selectedCountry).length + 1) }));
  }, [allStores, selectedCountry]);

  const countryStores = useMemo(
    () => allStores
      .filter((store) => store.country_code === selectedCountry)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
    [allStores, selectedCountry],
  );

  const filteredStores = useMemo(() => {
    if (!debouncedStoreSearch) return countryStores;
    return countryStores.filter((store) =>
      store.store_name.toLowerCase().includes(debouncedStoreSearch)
      || store.domain.toLowerCase().includes(debouncedStoreSearch)
      || store.store_id.toLowerCase().includes(debouncedStoreSearch),
    );
  }, [countryStores, debouncedStoreSearch]);

  const allProducts = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const filteredProducts = useMemo(() => {
    return allProducts
      .filter((product) => productCountryFilter === "all" || product.country_code === productCountryFilter)
      .filter((product) => productStoreFilter === "all" || product.store_id === productStoreFilter)
      .filter((product) => productCategoryFilter === "all" || product.product_category === productCategoryFilter)
      .filter((product) => productStatusFilter === "all" || (productStatusFilter === "active" ? product.is_active : !product.is_active))
      .filter((product) => {
        if (!debouncedProductSearch) return true;
        const haystack = [
          product.product_title,
          product.store_id,
          product.product_category,
          ...(product.keyword_tags ?? []),
        ].join(" ").toLowerCase();
        return haystack.includes(debouncedProductSearch);
      });
  }, [allProducts, productCountryFilter, productStoreFilter, productCategoryFilter, productStatusFilter, debouncedProductSearch]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductCount),
    [filteredProducts, visibleProductCount],
  );

  const summary = useMemo(() => {
    const total = allStores.length;
    const active = allStores.filter((store) => store.is_active).length;
    const countries = new Set(allStores.map((store) => store.country_code)).size;
    return {
      countries,
      total,
      active,
      inactive: total - active,
    };
  }, [allStores]);

  const productSummary = useMemo(() => {
    const total = allProducts.length;
    const active = allProducts.filter((product) => product.is_active).length;
    const inStock = allProducts.filter((product) => product.stock_status === "in_stock").length;
    const stale = allProducts.filter((product) => {
      const days = staleDays(product.updated_at);
      return typeof days === "number" && days >= 14;
    }).length;
    return { total, active, inStock, stale };
  }, [allProducts]);

  const filteredHealthRows = useMemo(() => {
    return (catalogHealthQuery.data ?? [])
      .filter((row) => healthCountryFilter === "all" || row.country_code === healthCountryFilter)
      .filter((row) => healthStoreFilter === "all" || row.store_id === healthStoreFilter);
  }, [catalogHealthQuery.data, healthCountryFilter, healthStoreFilter]);

  const healthProducts = useMemo(() => {
    return allProducts
      .filter((product) => healthCountryFilter === "all" || product.country_code === healthCountryFilter)
      .filter((product) => healthStoreFilter === "all" || product.store_id === healthStoreFilter);
  }, [allProducts, healthCountryFilter, healthStoreFilter]);

  const healthSummary = useMemo(() => {
    const total = healthProducts.length;
    const inStock = healthProducts.filter((product) => product.stock_status === "in_stock").length;
    const oos = healthProducts.filter((product) => product.stock_status === "out_of_stock").length;
    const noImage = healthProducts.filter((product) => !product.image_url).length;
    const noAffiliateUrl = healthProducts.filter((product) => !product.affiliate_url).length;
    const stale = healthProducts.filter((product) => {
      const days = staleDays(product.updated_at);
      return typeof days === "number" && days > 30;
    }).length;

    return { total, inStock, oos, noImage, noAffiliateUrl, stale };
  }, [healthProducts]);

  const clickStats = useMemo(() => {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    return (clicksQuery.data ?? []).reduce<ClickStats>((acc, row) => {
      const storeId = row.store_id || row.store || "unknown";
      if (!acc[storeId]) acc[storeId] = { total: 0, month: 0 };
      acc[storeId].total += 1;
      if (row.clicked_at && new Date(row.clicked_at) >= firstDayOfMonth) {
        acc[storeId].month += 1;
      }
      return acc;
    }, {});
  }, [clicksQuery.data]);

  const clickAnalytics = useMemo(() => {
    const rows = clicksQuery.data ?? [];
    const searchLinks = rows.filter((row) => row.is_search_link).length;
    const enriched = rows.length - searchLinks;
    const topGifts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.gift_concept_name || "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: rows.length,
      enriched,
      searchLinks,
      topGifts: Object.entries(topGifts).sort((left, right) => right[1] - left[1]).slice(0, 5),
    };
  }, [clicksQuery.data]);

  const activeCount = countryStores.filter((store) => store.is_active).length;
  const inactiveCount = countryStores.length - activeCount;

  const storeOptions = useMemo(
    () => Array.from(
      allStores.reduce((map, store) => {
        if (!map.has(store.store_id)) {
          map.set(store.store_id, { value: store.store_id, label: `${store.store_name} (${store.country_code})` });
        }
        return map;
      }, new Map<string, { value: string; label: string }>()),
      ([, value]) => value,
    ),
    [allStores],
  );

  const selectedCountryStoreOptions = useMemo(() => {
    if (productForm.country_code === "GLOBAL") {
      return allStores.filter((store) => store.country_code === "GLOBAL");
    }
    return allStores.filter((store) => store.country_code === productForm.country_code || store.country_code === "GLOBAL");
  }, [allStores, productForm.country_code]);

  function updateCountryHash(countryCode: string) {
    navigate({ hash: `#${countryCode}` }, { replace: true });
  }

  function setCardError(storeId: string, message: string) {
    setSaveErrors((prev) => ({ ...prev, [storeId]: message }));
    window.setTimeout(() => {
      setSaveErrors((prev) => {
        const next = { ...prev };
        delete next[storeId];
        return next;
      });
    }, 5000);
  }

  function updateStoreInState(storeId: string, patch: Partial<MarketplaceRow>) {
    setAllStores((prev) => prev.map((store) => (store.id === storeId ? { ...store, ...patch } : store)));
  }

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-marketplaces", "stores"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-marketplaces", "products"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-marketplaces", "catalog-health"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-marketplaces", "clicks"] }),
    ]);
  }

  async function saveStore(store: MarketplaceRow) {
    const variantsValidation = parseAffiliateVariantsInput(JSON.stringify(store.affiliate_variants ?? []));
    if (variantsValidation.error) {
      setCardError(store.id, variantsValidation.error);
      return;
    }

    setSavingMap((prev) => ({ ...prev, [store.id]: true }));
    const { error } = await supabase
      .from("marketplace_config")
      .update({
        affiliate_param: store.affiliate_param,
        search_url: store.search_url,
        brand_color: store.brand_color,
        priority: store.priority,
        categories: normalizeCategories(store.categories),
        is_active: store.is_active,
        notes: store.notes,
        affiliate_network: store.affiliate_network,
        affiliate_variants: store.affiliate_variants ?? [],
      })
      .eq("id", store.id);

    setSavingMap((prev) => ({ ...prev, [store.id]: false }));

    if (error) {
      setCardError(store.id, error.message);
      return;
    }

    toast.success(`${store.store_name} saved`);
    await refreshAll();
  }

  async function toggleActive(store: MarketplaceRow, nextValue: boolean) {
    updateStoreInState(store.id, { is_active: nextValue });
    const { error } = await supabase
      .from("marketplace_config")
      .update({ is_active: nextValue })
      .eq("id", store.id);

    if (error) {
      updateStoreInState(store.id, { is_active: store.is_active });
      setCardError(store.id, error.message);
      return;
    }

    toast.success(nextValue ? "Store activated" : "Store deactivated");
    await refreshAll();
  }

  async function deleteStoreConfirmed() {
    if (!deleteStore) return;
    const target = deleteStore;
    const { error } = await supabase
      .from("marketplace_config")
      .delete()
      .eq("id", target.id);

    if (error) {
      toast.error(`Failed to delete store: ${error.message}`);
      return;
    }

    setDeleteStore(null);
    toast.success(`${target.store_name} deleted`);
    await refreshAll();
  }

  async function addStore() {
    setAddError("");

    const variantsValidation = parseAffiliateVariantsInput(addForm.affiliate_variants);
    if (variantsValidation.error) {
      setAddError(variantsValidation.error);
      return;
    }

    const payload: MarketplaceInsert = {
      country_code: selectedCountry,
      store_id: addForm.store_id.trim(),
      store_name: addForm.store_name.trim(),
      domain: addForm.domain.trim().replace(/^https?:\/\//i, ""),
      search_url: addForm.search_url.trim(),
      affiliate_param: addForm.affiliate_param.trim() || null,
      brand_color: addForm.brand_color.trim() || "#888888",
      priority: Number(addForm.priority) || Math.max(1, countryStores.length + 1),
      categories: addForm.categories,
      is_active: true,
      notes: addForm.notes.trim() || null,
      affiliate_network: addForm.affiliate_network || null,
      affiliate_variants: variantsValidation.value,
    };

    if (!/^[a-z0-9_]{1,50}$/.test(payload.store_id)) {
      setAddError("Store ID must be lowercase letters, numbers, or underscores only.");
      return;
    }
    if (!payload.store_name || payload.store_name.length > 100) {
      setAddError("Store name is required and must be under 100 characters.");
      return;
    }
    if (!payload.domain || payload.domain.length > 200 || /^https?:\/\//i.test(addForm.domain.trim())) {
      setAddError("Domain is required and must not include http:// or https://.");
      return;
    }
    if (!payload.search_url || payload.search_url.length > 500 || !isValidUrl(payload.search_url)) {
      setAddError("Search URL must start with http:// or https://.");
      return;
    }
    if (!isValidHex(payload.brand_color ?? "")) {
      setAddError("Brand color must be a valid hex value like #888888.");
      return;
    }

    setIsAddSaving(true);
    const { data: existing, error: duplicateError } = await supabase
      .from("marketplace_config")
      .select("id")
      .eq("country_code", selectedCountry)
      .eq("store_id", payload.store_id)
      .maybeSingle();

    if (duplicateError) {
      setIsAddSaving(false);
      setAddError(duplicateError.message);
      return;
    }

    if (existing) {
      setIsAddSaving(false);
      setAddError("A store with this ID already exists in this country.");
      return;
    }

    const { error } = await supabase.from("marketplace_config").insert(payload);
    setIsAddSaving(false);

    if (error) {
      setAddError(error.message);
      return;
    }

    setIsAddOpen(false);
    setAddForm({ ...EMPTY_STORE_FORM, priority: Math.max(1, countryStores.length + 2) });
    setAddCategoryInput("");
    toast.success(`${payload.store_name} added to ${selectedMeta.name}`);
    await refreshAll();
  }

  async function setCountryActiveState(nextActive: boolean) {
    if (countryStores.length === 0) return;
    setIsBulkSaving(true);
    const { error } = await supabase
      .from("marketplace_config")
      .update({ is_active: nextActive })
      .eq("country_code", selectedCountry);
    setIsBulkSaving(false);

    if (error) {
      toast.error(`Failed to update stores: ${error.message}`);
      return;
    }

    setBulkAction(null);
    toast.success(nextActive ? `Activated all ${selectedMeta.name} stores` : `Deactivated all ${selectedMeta.name} stores`);
    await refreshAll();
  }

  function exportStoreCsv() {
    csvDownload(
      `giftmind-marketplaces-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "country_code",
        "store_id",
        "store_name",
        "domain",
        "search_url",
        "affiliate_param",
        "affiliate_network",
        "brand_color",
        "categories",
        "priority",
        "notes",
        "affiliate_variants",
        "is_active",
      ],
      allStores.map((store) => ({
        country_code: store.country_code,
        store_id: store.store_id,
        store_name: store.store_name,
        domain: store.domain,
        search_url: store.search_url,
        affiliate_param: store.affiliate_param ?? "",
        affiliate_network: store.affiliate_network ?? "",
        brand_color: store.brand_color ?? "",
        categories: normalizeCategories(store.categories).join(";"),
        priority: store.priority ?? "",
        notes: store.notes ?? "",
        affiliate_variants: JSON.stringify(store.affiliate_variants ?? []),
        is_active: store.is_active,
      })),
    );
  }

  function exportProductCsv() {
    csvDownload(
      `giftmind-marketplace-products-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "store_id",
        "country_code",
        "product_title",
        "product_url",
        "affiliate_url",
        "image_url",
        "price_amount",
        "price_currency",
        "original_price_amount",
        "stock_status",
        "delivery_eta_text",
        "coupon_code",
        "coupon_text",
        "product_category",
        "keyword_tags",
        "affiliate_source",
        "attribution_label",
        "is_affiliate",
        "priority",
        "is_active",
      ],
      filteredProducts.map((product) => ({
        store_id: product.store_id,
        country_code: product.country_code,
        product_title: product.product_title,
        product_url: product.product_url,
        affiliate_url: product.affiliate_url ?? "",
        image_url: product.image_url ?? "",
        price_amount: product.price_amount ?? "",
        price_currency: product.price_currency ?? "",
        original_price_amount: product.original_price_amount ?? "",
        stock_status: product.stock_status,
        delivery_eta_text: product.delivery_eta_text ?? "",
        coupon_code: product.coupon_code ?? "",
        coupon_text: product.coupon_text ?? "",
        product_category: product.product_category ?? "",
        keyword_tags: (product.keyword_tags ?? []).join(";"),
        affiliate_source: product.affiliate_source ?? "",
        attribution_label: product.attribution_label ?? "",
        is_affiliate: product.is_affiliate,
        priority: product.priority,
        is_active: product.is_active,
      })),
    );
  }

  function formatPercent(part: number | null | undefined, total: number | null | undefined) {
    const denominator = Number(total ?? 0);
    if (denominator <= 0) return "0%";
    return `${Math.round((Number(part ?? 0) / denominator) * 100)}%`;
  }

  function formatRelativeDays(value: string | null | undefined) {
    if (!value) return "Never";
    const days = staleDays(value);
    if (days == null) return "Never";
    if (days <= 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function exportHealthCsv() {
    csvDownload(
      `giftmind-catalog-health-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "store_id",
        "store_name",
        "country_code",
        "product_category",
        "total_products",
        "in_stock",
        "out_of_stock",
        "unknown_stock",
        "has_image",
        "has_affiliate_url",
        "last_updated",
      ],
      filteredHealthRows.map((row) => ({
        store_id: row.store_id ?? "",
        store_name: row.store_name ?? "",
        country_code: row.country_code ?? "",
        product_category: row.product_category ?? "",
        total_products: row.total_products ?? 0,
        in_stock: row.in_stock ?? 0,
        out_of_stock: row.out_of_stock ?? 0,
        unknown_stock: row.unknown_stock ?? 0,
        has_image: row.has_image ?? 0,
        has_affiliate_url: row.has_affiliate_url ?? 0,
        last_updated: row.last_updated ?? "",
      })),
    );
  }

  async function testLink(store: MarketplaceRow) {
    const previewUrl = buildPreviewUrl(store);
    if (!previewUrl) {
      toast.error("Set a valid search URL first.");
      return;
    }
    const opened = window.open(previewUrl, "_blank", "noopener,noreferrer");
    const next: TestStateMap = {
      ...testState,
      [store.id]: {
        at: new Date().toISOString(),
        status: opened ? "manual" : "unreachable",
        message: opened ? "Link opened — verify the page loaded correctly" : "Popup blocked or link failed to open",
      },
    };
    setTestState(next);
    writeTestState(next);
    toast.success(opened ? "Link opened in a new tab" : "Could not open the test link");
  }

  async function testAllLinks() {
    if (countryStores.length === 0) return;
    setIsTestingAll(true);
    const nextState = { ...testState };
    let reachable = 0;
    let unreachable = 0;

    for (let index = 0; index < countryStores.length; index += 1) {
      const store = countryStores[index];
      setTestProgress(`Testing ${index + 1}/${countryStores.length} stores...`);
      const status = await new Promise<"working" | "unreachable">((resolve) => {
        const image = new Image();
        image.onload = () => resolve("working");
        image.onerror = () => resolve("unreachable");
        image.src = `https://${store.domain}/favicon.ico?ts=${Date.now()}`;
      });

      nextState[store.id] = {
        at: new Date().toISOString(),
        status,
        message: status === "working" ? "Domain reachable" : "Domain unreachable or blocked",
      };
      if (status === "working") reachable += 1;
      else unreachable += 1;
    }

    setTestState(nextState);
    writeTestState(nextState);
    setIsTestingAll(false);
    setTestProgress("");
    toast.success(`Best-effort test finished: ${reachable} reachable, ${unreachable} unreachable.`);
  }

  async function saveProduct() {
    setProductDialogError("");
    const validation = validateProductForm(productForm);
    if (validation.error || !validation.payload) {
      setProductDialogError(validation.error || "Invalid product form.");
      return;
    }

    setIsProductSaving(true);
    const payload = validation.payload;
    const query = productForm.id
      ? supabase.from("marketplace_products").update(payload).eq("id", productForm.id)
      : supabase.from("marketplace_products").insert(payload);

    const { error } = await query;
    setIsProductSaving(false);

    if (error) {
      setProductDialogError(error.message);
      return;
    }

    setProductDialogOpen(false);
    setProductForm({ ...EMPTY_PRODUCT_FORM, country_code: productCountryFilter === "all" ? selectedCountry : productCountryFilter });
    toast.success(productForm.id ? "Product updated" : "Product added");
    await refreshAll();
  }

  async function toggleProductActive(product: MarketplaceProductRow) {
    const { error } = await supabase
      .from("marketplace_products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(product.is_active ? "Product deactivated" : "Product activated");
    await refreshAll();
  }

  async function deleteProductConfirmed() {
    if (!deleteProduct) return;
    const target = deleteProduct;
    const { error } = await supabase
      .from("marketplace_products")
      .delete()
      .eq("id", target.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setDeleteProduct(null);
    toast.success("Product deleted");
    await refreshAll();
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    const missingHeaders = PRODUCT_IMPORT_REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
    if (missingHeaders.length > 0) {
      setImportPreview({
        fileName: file.name,
        validRows: [],
        errors: [`Missing required headers: ${missingHeaders.join(", ")}`],
      });
      return;
    }

    const validRows: MarketplaceProductInsert[] = [];
    const errors: string[] = [];

    parsed.rows.forEach((row, index) => {
      const result = parseProductCsvRecord(row);
      if (result.error || !result.payload) {
        errors.push(`Row ${index + 2}: ${result.error || "Invalid row"}`);
      } else {
        validRows.push(result.payload);
      }
    });

    setImportPreview({
      fileName: file.name,
      validRows,
      errors,
    });
  }

  async function commitImport() {
    if (!importPreview?.validRows.length) {
      toast.error("No valid rows to import.");
      return;
    }

    setIsImportSaving(true);
    const { error } = await supabase
      .from("marketplace_products")
      .insert(importPreview.validRows);
    setIsImportSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Imported ${importPreview.validRows.length} products`);
    setImportDialogOpen(false);
    setImportPreview(null);
    await refreshAll();
  }

  function runPreview() {
    const budgetMin = Number(previewForm.budget_min);
    const budgetMax = Number(previewForm.budget_max);
    const priceAnchor = Number(previewForm.price_anchor);

    if (!previewForm.name.trim()) {
      toast.error("Gift name is required for preview.");
      return;
    }
    if (!previewForm.product_category) {
      toast.error("Choose a category for preview.");
      return;
    }
    if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax) || budgetMin >= budgetMax) {
      toast.error("Enter a valid budget range.");
      return;
    }
    if (!Number.isFinite(priceAnchor)) {
      toast.error("Enter a valid price anchor.");
      return;
    }

    let stores = allStores.filter((store) => store.country_code === previewForm.country_code && store.is_active);
    let isGlobalFallback = false;
    if (stores.length === 0) {
      stores = allStores.filter((store) => store.country_code === "GLOBAL" && store.is_active);
      isGlobalFallback = true;
    }

    const result = simulateMarketplacePreview({
      stores,
      products: allProducts,
      concept: {
        name: previewForm.name.trim(),
        search_keywords: tagList(previewForm.keywords),
        product_category: previewForm.product_category,
        price_anchor: priceAnchor,
      },
      targetCountry: previewForm.country_code,
      budgetMin,
      budgetMax,
      userPlan: previewForm.plan,
      identitySeed: "admin-preview",
      isGlobalFallback,
    });

    setPreviewResult(result);
  }

  async function runCatalogCleanup() {
    setIsCatalogCleanupRunning(true);
    const { data, error } = await supabase.rpc("deactivate_stale_marketplace_products");
    setIsCatalogCleanupRunning(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const affected = typeof data === "object" && data && "affected_count" in data ? Number((data as { affected_count?: number }).affected_count ?? 0) : 0;
    toast.success(`Catalog cleanup ran. ${affected} stale products were deactivated.`);
    await refreshAll();
  }

  const isStoresLoading = storesQuery.isLoading || storesQuery.isFetching;
  const isProductsLoading = productsQuery.isLoading || productsQuery.isFetching;
  const storesError = storesQuery.error;
  const productsError = productsQuery.error;

  return (
    <div className="space-y-6">
      <SEOHead title="Marketplace Configuration - GiftMind" description="Manage stores, products, and affiliate linking for each country." noIndex={true} />

      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Marketplace Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage store routing, curated product links, catalog freshness, and affiliate instrumentation from one place.
        </p>
      </div>

      {allStores.length > 0 && allStores.length < 60 ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              The marketplace configuration only has {allStores.length} stores. The PRD target is 60+. Seed more country coverage before broad rollout.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Countries", summary.countries, <Globe key="countries" className="h-5 w-5" />],
          ["Stores", summary.total, <Store key="stores" className="h-5 w-5" />],
          ["Products", productSummary.total, <Package key="products" className="h-5 w-5" />],
          ["Stale Products", productSummary.stale, <Clock3 key="stale" className="h-5 w-5" />],
        ].map(([label, value, icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
              </div>
              <div className="rounded-full border border-border/70 p-3 text-muted-foreground">{icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto">
            {COUNTRY_OPTIONS.map((country) => {
              const active = selectedCountry === country.code;
              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => updateCountryHash(country.code)}
                  className={`snap-start whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${active ? "border-b-2 border-primary bg-primary/5 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {country.flag} {country.name}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "stores" | "products" | "health")} className="space-y-6">
        <TabsList className="inline-flex h-auto min-w-max gap-1 bg-muted/70 p-1">
          <TabsTrigger value="stores" className="gap-2 px-4 py-2">
            <Store className="h-4 w-4" />
            Stores
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2 px-4 py-2">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2 px-4 py-2">
            <RefreshCw className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="space-y-6">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {selectedMeta.flag} {selectedMeta.name} — {countryStores.length} stores ({activeCount} active, {inactiveCount} inactive)
                </p>
                {testProgress ? <p className="mt-1 text-xs text-muted-foreground">{testProgress}</p> : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={testAllLinks} disabled={isTestingAll || countryStores.length === 0}>
                  {isTestingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  Test All Links
                </Button>
                <Button onClick={() => {
                  setAddForm({ ...EMPTY_STORE_FORM, priority: Math.max(1, countryStores.length + 1) });
                  setAddCategoryInput("");
                  setAddError("");
                  setIsAddOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Store
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setBulkAction("activate")} disabled={countryStores.length === 0 || isBulkSaving}>Activate All</Button>
                <Button variant="outline" onClick={() => setBulkAction("deactivate")} disabled={countryStores.length === 0 || isBulkSaving}>Deactivate All</Button>
                <Button variant="outline" onClick={exportStoreCsv} disabled={allStores.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Search by store name, domain, or ID" className="pl-9" />
              </div>
            </CardContent>
          </Card>

          {storesError ? (
            <Card className="border-destructive/40">
              <CardContent className="space-y-3 p-6 text-center">
                <p className="text-sm text-destructive">Failed to load marketplace data.</p>
                <Button variant="outline" onClick={() => storesQuery.refetch()}>Retry</Button>
              </CardContent>
            </Card>
          ) : isStoresLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[780px] rounded-xl" />
              ))}
            </div>
          ) : filteredStores.length === 0 ? (
            <Card>
              <CardContent className="space-y-4 p-10 text-center">
                <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">No stores configured for {selectedMeta.name}.</p>
                  <p className="text-sm text-muted-foreground">Add stores to enable product links for users in this region.</p>
                </div>
                <Button onClick={() => {
                  setAddForm({ ...EMPTY_STORE_FORM, priority: 1 });
                  setAddCategoryInput("");
                  setAddError("");
                  setIsAddOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Store
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredStores.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  original={storesQuery.data?.find((row) => row.id === store.id)}
                  clickStats={clickStats[store.store_id] ?? { total: 0, month: 0 }}
              testState={testState[store.id]}
              categoryInput={categoryInputs[store.id] ?? ""}
              affiliateVariantsInput={affiliateVariantInputs[store.id] ?? JSON.stringify(store.affiliate_variants ?? [], null, 2)}
              affiliateVariantsError={parseAffiliateVariantsInput(affiliateVariantInputs[store.id] ?? JSON.stringify(store.affiliate_variants ?? [], null, 2)).error}
              isSaving={Boolean(savingMap[store.id])}
              saveError={saveErrors[store.id]}
              onFieldChange={(patch) => updateStoreInState(store.id, patch)}
              onAffiliateVariantsChange={(value) => {
                setAffiliateVariantInputs((prev) => ({ ...prev, [store.id]: value }));
                const parsed = parseAffiliateVariantsInput(value);
                if (!parsed.error) {
                  updateStoreInState(store.id, { affiliate_variants: parsed.value });
                }
              }}
              onToggleActive={(next) => void toggleActive(store, next)}
                  onSave={() => void saveStore(store)}
                  onDelete={() => setDeleteStore(store)}
                  onCopyAffiliate={async () => {
                    await navigator.clipboard.writeText(store.affiliate_param ?? "");
                    toast.success("Affiliate parameter copied");
                  }}
                  onTestLink={() => void testLink(store)}
                  onCategoryInputChange={(value) => setCategoryInputs((prev) => ({ ...prev, [store.id]: value }))}
                  onAddCategory={() => {
                    const nextCategory = (categoryInputs[store.id] ?? "").trim().toLowerCase();
                    if (!nextCategory) return;
                    if (normalizeCategories(store.categories).includes(nextCategory)) return;
                    updateStoreInState(store.id, { categories: [...normalizeCategories(store.categories), nextCategory] });
                    setCategoryInputs((prev) => ({ ...prev, [store.id]: "" }));
                  }}
                  onRemoveCategory={(category) => updateStoreInState(store.id, {
                    categories: normalizeCategories(store.categories).filter((entry) => entry !== category),
                  })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5" />
                  Catalog Overview
                </CardTitle>
                <CardDescription>Track curated product coverage, freshness, and live-search dependency.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Total Products", productSummary.total],
                  ["Active Products", productSummary.active],
                  ["In Stock", productSummary.inStock],
                  ["Stale 14d+", productSummary.stale],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5" />
                  Click Analytics
                </CardTitle>
                <CardDescription>30-day click mix for {selectedMeta.name} using the corrected ISO-country attribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Clicks</p>
                    <p className="text-xl font-semibold">{clickAnalytics.total}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Enriched</p>
                    <p className="text-xl font-semibold">{clickAnalytics.enriched}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Search</p>
                    <p className="text-xl font-semibold">{clickAnalytics.searchLinks}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Gift Concepts</p>
                  {clickAnalytics.topGifts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No click data yet for this country.</p>
                  ) : (
                    clickAnalytics.topGifts.map(([gift, count]) => (
                      <div key={gift} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <span className="line-clamp-1">{gift}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5" />
                  Preview Product Match
                </CardTitle>
                <CardDescription>Runs the same scoring rules as the product linking pipeline against the current catalog.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Gift Name</Label>
                    <Input value={previewForm.name} onChange={(event) => setPreviewForm((prev) => ({ ...prev, name: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Keywords</Label>
                    <Input value={previewForm.keywords} onChange={(event) => setPreviewForm((prev) => ({ ...prev, keywords: event.target.value }))} placeholder="comma-separated keywords" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <FilterSelect
                      value={previewForm.product_category}
                      onChange={(value) => setPreviewForm((prev) => ({ ...prev, product_category: value }))}
                      options={CATEGORY_SUGGESTIONS.map((category) => ({ value: category, label: category }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price Anchor</Label>
                    <Input type="number" value={previewForm.price_anchor} onChange={(event) => setPreviewForm((prev) => ({ ...prev, price_anchor: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <FilterSelect
                      value={previewForm.plan}
                      onChange={(value) => setPreviewForm((prev) => ({ ...prev, plan: value }))}
                      options={[
                        { value: "spark", label: "Spark" },
                        { value: "pro", label: "Pro" },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Budget Min</Label>
                    <Input type="number" value={previewForm.budget_min} onChange={(event) => setPreviewForm((prev) => ({ ...prev, budget_min: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Budget Max</Label>
                    <Input type="number" value={previewForm.budget_max} onChange={(event) => setPreviewForm((prev) => ({ ...prev, budget_max: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <FilterSelect
                      value={previewForm.country_code}
                      onChange={(value) => setPreviewForm((prev) => ({ ...prev, country_code: value }))}
                      options={COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: `${country.flag} ${country.name}` }))}
                    />
                  </div>
                </div>

                <Button onClick={runPreview}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Run Preview
                </Button>

                {previewResult ? (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{previewResult.target_country}</Badge>
                      <Badge variant="secondary">{previewResult.stores_shown}/{previewResult.total_stores_available} stores visible</Badge>
                      {previewResult.is_global_fallback ? (
                        <Badge variant="outline" className="border-sky-300 text-sky-800">
                          <Globe2 className="mr-1 h-3 w-3" />
                          GLOBAL fallback
                        </Badge>
                      ) : null}
                    </div>

                    {previewResult.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No eligible stores are configured for this category in the selected country.</p>
                    ) : (
                      previewResult.rows.map((row, index) => (
                        <div key={`${row.store_id}-${index}`} className="rounded-xl border border-border/60 bg-background p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-foreground">
                              #{index + 1} Score: {row.score} · {row.store_name}
                            </p>
                            <Badge variant={row.is_search_link ? "outline" : "secondary"}>
                              {row.is_search_link ? "Search link" : "Catalog match"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {row.product_title || `Fallback search for "${row.keyword}"`} {row.price_amount != null ? `· ${formatPrice(row.price_amount)}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.match_reason}</p>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RefreshCw className="h-5 w-5" />
                  Catalog Health
                </CardTitle>
                <CardDescription>Store/category rollups from the `admin_product_catalog_health` view plus a manual stale-OOS cleanup trigger.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" onClick={runCatalogCleanup} disabled={isCatalogCleanupRunning}>
                  {isCatalogCleanupRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Deactivate stale OOS products
                </Button>

                <div className="space-y-2">
                  {(catalogHealthQuery.data ?? [])
                    .filter((row) => row.country_code === selectedCountry)
                    .slice(0, 8)
                    .map((row) => (
                      <div key={`${row.store_id}-${row.product_category}`} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span>{row.store_name} · {row.product_category || "general"}</span>
                          <Badge variant="secondary">{row.total_products || 0}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          In stock {row.in_stock || 0} · OOS {row.out_of_stock || 0} · Updated {row.last_updated ? new Date(row.last_updated).toLocaleDateString() : "never"}
                        </p>
                      </div>
                    ))}
                  {(catalogHealthQuery.data ?? []).filter((row) => row.country_code === selectedCountry).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No health rows yet for {selectedMeta.name}.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button onClick={() => {
                  setProductDialogError("");
                  setProductForm({
                    ...EMPTY_PRODUCT_FORM,
                    country_code: productCountryFilter === "all" ? selectedCountry : productCountryFilter,
                  });
                  setProductDialogOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
                <Button variant="outline" onClick={exportProductCsv} disabled={filteredProducts.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button variant="outline" onClick={() => {
                  setImportPreview(null);
                  setImportDialogOpen(true);
                }}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <FilterSelect
                  value={productCountryFilter}
                  onChange={(value) => {
                    setProductCountryFilter(value);
                    setVisibleProductCount(24);
                  }}
                  options={[
                    { value: "all", label: "All countries" },
                    ...COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: `${country.flag} ${country.name}` })),
                  ]}
                />
                <FilterSelect
                  value={productStoreFilter}
                  onChange={(value) => {
                    setProductStoreFilter(value);
                    setVisibleProductCount(24);
                  }}
                  options={[
                    { value: "all", label: "All stores" },
                    ...storeOptions,
                  ]}
                />
                <FilterSelect
                  value={productCategoryFilter}
                  onChange={(value) => {
                    setProductCategoryFilter(value);
                    setVisibleProductCount(24);
                  }}
                  options={[
                    { value: "all", label: "All categories" },
                    ...CATEGORY_SUGGESTIONS.map((category) => ({ value: category, label: category })),
                  ]}
                />
                <FilterSelect
                  value={productStatusFilter}
                  onChange={(value) => {
                    setProductStatusFilter(value);
                    setVisibleProductCount(24);
                  }}
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
                <div className="relative min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products" className="pl-9" />
                </div>
              </div>
            </CardContent>
          </Card>

          {productsError ? (
            <Card className="border-destructive/40">
              <CardContent className="space-y-3 p-6 text-center">
                <p className="text-sm text-destructive">Failed to load marketplace products.</p>
                <Button variant="outline" onClick={() => productsQuery.refetch()}>Retry</Button>
              </CardContent>
            </Card>
          ) : isProductsLoading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[220px] rounded-xl" />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <Card>
              <CardContent className="space-y-4 p-10 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">No products match the current filters.</p>
                  <p className="text-sm text-muted-foreground">Import a catalog CSV or add products manually to improve enriched result coverage.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    storeName={allStores.find((store) => store.store_id === product.store_id && (store.country_code === product.country_code || store.country_code === "GLOBAL"))?.store_name || product.store_id}
                    onEdit={() => {
                      setProductDialogError("");
                      setProductForm(buildProductFormFromRow(product));
                      setProductDialogOpen(true);
                    }}
                    onToggleActive={() => void toggleProductActive(product)}
                    onDelete={() => setDeleteProduct(product)}
                  />
                ))}
              </div>

              {visibleProductCount < filteredProducts.length ? (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => setVisibleProductCount((prev) => prev + 24)}>
                    Load More
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5" />
                Catalog Health
              </CardTitle>
              <CardDescription>Store/category freshness, stock, image coverage, and affiliate URL coverage.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["Total Products", healthSummary.total, ""],
                ["In Stock", healthSummary.inStock, formatPercent(healthSummary.inStock, healthSummary.total)],
                ["OOS", healthSummary.oos, formatPercent(healthSummary.oos, healthSummary.total)],
                ["No Image", healthSummary.noImage, ""],
                ["No Affiliate URL", healthSummary.noAffiliateUrl, ""],
                ["Stale >30d", healthSummary.stale, ""],
              ].map(([label, value, detail]) => (
                <div key={String(label)} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <div className="mt-2 flex items-end gap-2">
                    <p className="text-2xl font-semibold text-foreground">{value}</p>
                    {detail ? <p className="pb-1 text-xs text-muted-foreground">{detail}</p> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <FilterSelect
                  value={healthCountryFilter}
                  onChange={setHealthCountryFilter}
                  options={[
                    { value: "all", label: "All countries" },
                    ...COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: `${country.flag} ${country.name}` })),
                  ]}
                />
                <FilterSelect
                  value={healthStoreFilter}
                  onChange={setHealthStoreFilter}
                  options={[
                    { value: "all", label: "All stores" },
                    ...storeOptions,
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={exportHealthCsv} disabled={filteredHealthRows.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Health Report CSV
                </Button>
                <Button variant="outline" onClick={runCatalogCleanup} disabled={isCatalogCleanupRunning}>
                  {isCatalogCleanupRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Deactivate stale OOS products
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {catalogHealthQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : filteredHealthRows.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-lg font-semibold text-foreground">No health rows match the current filters.</p>
                  <p className="text-sm text-muted-foreground">Add active products to populate catalog health rollups.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[1.4fr,0.6fr,1fr,0.6fr,0.7fr,0.6fr,1fr,1.7fr] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Store</span>
                      <span>Country</span>
                      <span>Category</span>
                      <span>Total</span>
                      <span>In Stock</span>
                      <span>OOS</span>
                      <span>Last Sync</span>
                      <span>Alerts</span>
                    </div>
                    {filteredHealthRows.map((row) => {
                      const total = Number(row.total_products ?? 0);
                      const stale = row.last_updated ? (staleDays(row.last_updated) ?? 0) > 30 : true;
                      const oosRate = total > 0 ? Number(row.out_of_stock ?? 0) / total : 0;
                      const affiliateCoverage = total > 0 ? Number(row.has_affiliate_url ?? 0) / total : 1;
                      const imageCoverage = total > 0 ? Number(row.has_image ?? 0) / total : 1;

                      return (
                        <div
                          key={`${row.country_code}-${row.store_id}-${row.product_category}`}
                          className={`grid grid-cols-[1.4fr,0.6fr,1fr,0.6fr,0.7fr,0.6fr,1fr,1.7fr] gap-3 border-b px-4 py-3 text-sm ${stale || oosRate > 0.3 || affiliateCoverage < 0.5 ? "bg-amber-50/70" : ""}`}
                        >
                          <span className="font-medium text-foreground">{row.store_name || row.store_id}</span>
                          <span>{row.country_code}</span>
                          <span>{row.product_category || "general"}</span>
                          <span>{total}</span>
                          <span>{row.in_stock ?? 0}</span>
                          <span>{row.out_of_stock ?? 0}</span>
                          <span>{formatRelativeDays(row.last_updated)}</span>
                          <span className="flex flex-wrap gap-1">
                            {stale ? <Badge variant="outline" className="border-amber-300 text-amber-800">Stale</Badge> : null}
                            {oosRate > 0.3 ? <Badge variant="outline" className="border-amber-300 text-amber-800">High OOS</Badge> : null}
                            {affiliateCoverage < 0.5 ? <Badge variant="outline" className="border-amber-300 text-amber-800">Low affiliate coverage</Badge> : null}
                            {imageCoverage < 0.5 ? <Badge variant="secondary">Low image coverage</Badge> : null}
                            {!stale && oosRate <= 0.3 && affiliateCoverage >= 0.5 && imageCoverage >= 0.5 ? (
                              <Badge variant="secondary">Healthy</Badge>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Store</DialogTitle>
            <DialogDescription>Add a new marketplace for {selectedMeta.name}.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Store ID</Label>
              <Input value={addForm.store_id} onChange={(event) => setAddForm((prev) => ({ ...prev, store_id: event.target.value }))} placeholder="amazon_in" />
            </div>
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input value={addForm.store_name} onChange={(event) => setAddForm((prev) => ({ ...prev, store_name: event.target.value }))} placeholder="Amazon.in" />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input value={addForm.domain} onChange={(event) => setAddForm((prev) => ({ ...prev, domain: event.target.value }))} placeholder="www.amazon.in" />
            </div>
            <div className="space-y-2">
              <Label>Search URL</Label>
              <Input value={addForm.search_url} onChange={(event) => setAddForm((prev) => ({ ...prev, search_url: event.target.value }))} placeholder="https://www.amazon.in/s?k=" />
            </div>
            <div className="space-y-2">
              <Label>Affiliate Tag</Label>
              <Input value={addForm.affiliate_param} onChange={(event) => setAddForm((prev) => ({ ...prev, affiliate_param: event.target.value }))} placeholder="&tag=giftmind-21" />
            </div>
            <div className="space-y-2">
              <Label>Brand Color</Label>
              <Input value={addForm.brand_color} onChange={(event) => setAddForm((prev) => ({ ...prev, brand_color: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={addForm.priority} onChange={(event) => setAddForm((prev) => ({ ...prev, priority: Number(event.target.value) || 1 }))} />
            </div>
            <div className="space-y-2">
              <Label>Affiliate Network</Label>
              <FilterSelect
                value={addForm.affiliate_network}
                onChange={(value) => setAddForm((prev) => ({ ...prev, affiliate_network: value }))}
                options={[
                  { value: "", label: "Unspecified" },
                  ...AFFILIATE_NETWORK_OPTIONS.map((network) => ({ value: network, label: network })),
                ]}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {addForm.categories.map((category) => (
                <Badge key={category} variant="secondary" className="gap-1">
                  {category}
                  <button type="button" onClick={() => setAddForm((prev) => ({ ...prev, categories: prev.categories.filter((entry) => entry !== category) }))}>
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={addCategoryInput} onChange={(event) => setAddCategoryInput(event.target.value)} list="add-store-categories" placeholder="Add category" />
              <datalist id="add-store-categories">
                {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
              </datalist>
              <Button variant="outline" onClick={() => {
                const nextCategory = addCategoryInput.trim().toLowerCase();
                if (!nextCategory || addForm.categories.includes(nextCategory)) return;
                setAddForm((prev) => ({ ...prev, categories: [...prev.categories, nextCategory] }));
                setAddCategoryInput("");
              }}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Input value={addForm.notes} onChange={(event) => setAddForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Affiliate Variants JSON</Label>
            <Textarea value={addForm.affiliate_variants} onChange={(event) => setAddForm((prev) => ({ ...prev, affiliate_variants: event.target.value }))} className="min-h-[120px] font-mono text-xs" />
          </div>

          {addError ? <p className="text-sm text-destructive">{addError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void addStore()} disabled={isAddSaving}>
              {isAddSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{productForm.id ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>Manage curated product pages, pricing, stock, and attribution metadata.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Store</Label>
              <FilterSelect
                value={productForm.store_id}
                onChange={(value) => setProductForm((prev) => ({ ...prev, store_id: value }))}
                options={[
                  { value: "", label: "Select a store" },
                  ...selectedCountryStoreOptions.map((store) => ({ value: store.store_id, label: `${store.store_name} (${store.country_code})` })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <FilterSelect
                value={productForm.country_code}
                onChange={(value) => setProductForm((prev) => ({ ...prev, country_code: value }))}
                options={COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: `${country.flag} ${country.name}` }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Product Title</Label>
              <Input value={productForm.product_title} onChange={(event) => setProductForm((prev) => ({ ...prev, product_title: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Product URL</Label>
              <Input value={productForm.product_url} onChange={(event) => setProductForm((prev) => ({ ...prev, product_url: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Affiliate URL</Label>
              <Input value={productForm.affiliate_url} onChange={(event) => setProductForm((prev) => ({ ...prev, affiliate_url: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input value={productForm.image_url} onChange={(event) => setProductForm((prev) => ({ ...prev, image_url: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Price Amount</Label>
              <Input type="number" value={productForm.price_amount} onChange={(event) => setProductForm((prev) => ({ ...prev, price_amount: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={productForm.price_currency} onChange={(event) => setProductForm((prev) => ({ ...prev, price_currency: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Original Price</Label>
              <Input type="number" value={productForm.original_price_amount} onChange={(event) => setProductForm((prev) => ({ ...prev, original_price_amount: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Stock Status</Label>
              <FilterSelect
                value={productForm.stock_status}
                onChange={(value) => setProductForm((prev) => ({ ...prev, stock_status: value as StockStatus }))}
                options={STOCK_OPTIONS.map((stock) => ({ value: stock, label: stockLabel(stock) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery ETA</Label>
              <Input value={productForm.delivery_eta_text} onChange={(event) => setProductForm((prev) => ({ ...prev, delivery_eta_text: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Coupon Code</Label>
              <Input value={productForm.coupon_code} onChange={(event) => setProductForm((prev) => ({ ...prev, coupon_code: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Coupon Text</Label>
              <Input value={productForm.coupon_text} onChange={(event) => setProductForm((prev) => ({ ...prev, coupon_text: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <FilterSelect
                value={productForm.product_category}
                onChange={(value) => setProductForm((prev) => ({ ...prev, product_category: value }))}
                options={CATEGORY_SUGGESTIONS.map((category) => ({ value: category, label: category }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={productForm.priority} onChange={(event) => setProductForm((prev) => ({ ...prev, priority: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Keyword Tags</Label>
              <Input value={productForm.keyword_tags} onChange={(event) => setProductForm((prev) => ({ ...prev, keyword_tags: event.target.value }))} placeholder="comma or semicolon separated tags" />
            </div>
            <div className="space-y-2">
              <Label>Affiliate Source</Label>
              <Input value={productForm.affiliate_source} onChange={(event) => setProductForm((prev) => ({ ...prev, affiliate_source: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Attribution Label</Label>
              <Input value={productForm.attribution_label} onChange={(event) => setProductForm((prev) => ({ ...prev, attribution_label: event.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
              <div>
                <p className="font-medium text-foreground">Affiliate Link</p>
                <p className="text-xs text-muted-foreground">Controls disclosure and outbound-link priority.</p>
              </div>
              <Switch checked={productForm.is_affiliate} onCheckedChange={(checked) => setProductForm((prev) => ({ ...prev, is_affiliate: checked }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
              <div>
                <p className="font-medium text-foreground">Active Product</p>
                <p className="text-xs text-muted-foreground">Inactive products are excluded from matching.</p>
              </div>
              <Switch checked={productForm.is_active} onCheckedChange={(checked) => setProductForm((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>

          {productDialogError ? <p className="text-sm text-destructive">{productDialogError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveProduct()} disabled={isProductSaving}>
              {isProductSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {productForm.id ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Product CSV</DialogTitle>
            <DialogDescription>Upload a CSV, review dry-run validation, then commit valid rows.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border p-4">
              <Label htmlFor="product-csv-upload" className="mb-2 block">CSV File</Label>
              <Input
                id="product-csv-upload"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleImportFile(file);
                }}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Required headers: {PRODUCT_IMPORT_REQUIRED_HEADERS.join(", ")}. Keyword tags should be semicolon-separated.
              </p>
            </div>

            {importPreview ? (
              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{importPreview.fileName}</Badge>
                  <Badge variant="secondary">{importPreview.validRows.length} valid rows</Badge>
                  <Badge variant={importPreview.errors.length > 0 ? "outline" : "secondary"}>
                    {importPreview.errors.length} errors
                  </Badge>
                </div>

                {importPreview.errors.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Validation errors</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-background p-3 text-sm">
                      {importPreview.errors.map((error) => (
                        <p key={error} className="text-destructive">{error}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700">Dry run passed. You can import these rows directly.</p>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Close</Button>
            <Button onClick={() => void commitImport()} disabled={!importPreview?.validRows.length || isImportSaving}>
              {isImportSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import Valid Rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteStore)} onOpenChange={(open) => !open && setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete store?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the store configuration immediately. Curated products with the same `store_id` will remain until you delete them separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteStoreConfirmed()}>Delete Store</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteProduct)} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the curated product from the catalog. Future matches will fall back to live search links if no other product wins scoring.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteProductConfirmed()}>Delete Product</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(bulkAction)} onOpenChange={(open) => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkAction === "activate" ? "Activate" : "Deactivate"} all stores in {selectedMeta.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This updates every store in the selected country immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void setCountryActiveState(bulkAction === "activate")}>
              {isBulkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
