import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SEOHead } from "@/components/common/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Globe,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Store,
  Trash2,
} from "lucide-react";

const COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "USA", flag: "🇺🇸" },
  { code: "GB", name: "UK", flag: "🇬🇧" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "GLOBAL", name: "Global Fallback", flag: "🌍" },
] as const;

const CATEGORY_SUGGESTIONS = [
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

const TEST_STORAGE_KEY = "gm_marketplace_tests";

type MarketplaceRow = Database["public"]["Tables"]["marketplace_config"]["Row"];
type ProductClickRow = Database["public"]["Tables"]["product_clicks"]["Row"];

type ClickStats = Record<string, { total: number; month: number }>;
type SaveErrorMap = Record<string, string>;
type SavingMap = Record<string, boolean>;
type CategoryInputMap = Record<string, string>;
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
}

const EMPTY_FORM: AddStoreForm = {
  store_id: "",
  store_name: "",
  domain: "",
  search_url: "",
  affiliate_param: "",
  brand_color: "#888888",
  priority: 1,
  categories: [],
};

function parseCountryHash(hash: string) {
  const clean = hash.replace(/^#/, "").toUpperCase();
  return COUNTRIES.some((country) => country.code === clean) ? clean : "IN";
}

function normalizeCategories(categories: string[] | null | undefined) {
  return (categories ?? []).map((category) => category.trim()).filter(Boolean);
}

function buildPreviewUrl(searchUrl: string, affiliateParam: string) {
  const cleanSearch = searchUrl.trim();
  const cleanAffiliate = affiliateParam.trim();
  if (!cleanSearch) return "";
  return `${cleanSearch}birthday+gift${cleanAffiliate}`;
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
  return COUNTRIES.find((country) => country.code === countryCode) ?? { code: countryCode, name: countryCode, flag: "🌍" };
}

function StoreCard({
  store,
  original,
  clickStats,
  testState,
  categoryInput,
  isSaving,
  saveError,
  onFieldChange,
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
  isSaving: boolean;
  saveError?: string;
  onFieldChange: (patch: Partial<MarketplaceRow>) => void;
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
  const dirty = JSON.stringify(store) !== JSON.stringify(original);
  const previewUrl = buildPreviewUrl(store.search_url, store.affiliate_param ?? "");
  const statusClass = store.is_active ? "text-emerald-600" : "text-rose-600";

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
                  <p className={`text-xs font-medium ${statusClass}`}>{store.is_active ? "Active" : "Inactive"}</p>
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
            <p className="text-xs text-muted-foreground break-all">
              Example: {previewUrl || "Enter a valid search URL to preview the final link."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Search URL Pattern</Label>
            <Input
              value={store.search_url}
              onChange={(event) => onFieldChange({ search_url: event.target.value })}
              placeholder="https://www.amazon.in/s?k="
            />
            {!isValidUrl(store.search_url) ? (
              <p className="text-xs text-destructive">Search URL must start with http:// or https://</p>
            ) : (
              <p className="text-xs text-muted-foreground">Base URL where search keywords get appended.</p>
            )}
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
              <p className="text-xs text-muted-foreground">Lower priority number = shown first in product results.</p>
            </div>
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
            <div className="flex flex-wrap gap-2">
              {CATEGORY_SUGGESTIONS.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    if (!categories.includes(category)) onFieldChange({ categories: [...categories, category] });
                  }}
                  className="rounded-full border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {category}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Empty = shows for all gift types.</p>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2 lg:flex-row">
          <Button variant="outline" onClick={onTestLink} disabled={!isValidUrl(store.search_url)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Test Link
          </Button>
          <Button onClick={onSave} disabled={!dirty || isSaving || !isValidUrl(store.search_url) || !isValidHex(store.brand_color ?? "") || Number(store.priority ?? 0) < 1}>
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
          <p>📊 Total clicks: {clickStats.total} | This month: {clickStats.month}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminMarketplaces() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedCountry, setSelectedCountry] = useState<string>(() => parseCountryHash(window.location.hash));
  const [allStores, setAllStores] = useState<MarketplaceRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [testState, setTestState] = useState<TestStateMap>(() => readTestState());
  const [categoryInputs, setCategoryInputs] = useState<CategoryInputMap>({});
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
  const [addForm, setAddForm] = useState<AddStoreForm>({ ...EMPTY_FORM });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-marketplaces"],
    queryFn: async () => {
      const { data: rows, error: queryError } = await supabase
        .from("marketplace_config")
        .select("*")
        .order("country_code", { ascending: true })
        .order("priority", { ascending: true });
      if (queryError) throw queryError;
      return rows ?? [];
    },
  });

  useEffect(() => {
    setAllStores((data ?? []) as MarketplaceRow[]);
  }, [data]);

  useEffect(() => {
    const next = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => window.clearTimeout(next);
  }, [search]);

  useEffect(() => {
    const nextCountry = parseCountryHash(location.hash);
    setSelectedCountry(nextCountry);
  }, [location.hash]);

  useEffect(() => {
    setAddForm((prev) => ({ ...prev, priority: Math.max(1, allStores.filter((store) => store.country_code === selectedCountry).length + 1) }));
  }, [allStores, selectedCountry]);

  const selectedMeta = countryMeta(selectedCountry);

  const countryStores = useMemo(
    () => allStores
      .filter((store) => store.country_code === selectedCountry)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
    [allStores, selectedCountry],
  );

  const filteredStores = useMemo(() => {
    if (!debouncedSearch) return countryStores;
    return countryStores.filter((store) =>
      store.store_name.toLowerCase().includes(debouncedSearch) ||
      store.domain.toLowerCase().includes(debouncedSearch),
    );
  }, [countryStores, debouncedSearch]);

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

  const activeCount = countryStores.filter((store) => store.is_active).length;
  const inactiveCount = countryStores.length - activeCount;

  const { data: clicksByStore = {}, isLoading: clicksLoading } = useQuery<ClickStats>({
    queryKey: ["admin-marketplace-clicks", selectedCountry],
    enabled: countryStores.length > 0,
    queryFn: async () => {
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const { data: clickRows, error: clickError } = await supabase
        .from("product_clicks")
        .select("store, clicked_at, country")
        .eq("country", selectedCountry);

      if (clickError) {
        console.error("Failed to load marketplace analytics", clickError);
        return {};
      }

      return (clickRows ?? []).reduce<ClickStats>((acc, row) => {
        const storeId = row.store || "unknown";
        if (!acc[storeId]) {
          acc[storeId] = { total: 0, month: 0 };
        }
        acc[storeId].total += 1;
        if (row.clicked_at && new Date(row.clicked_at) >= firstDayOfMonth) {
          acc[storeId].month += 1;
        }
        return acc;
      }, {});
    },
  });

  function updateCountryHash(countryCode: string) {
    navigate({ hash: `#${countryCode}` }, { replace: true });
  }

  function updateStoreInState(storeId: string, patch: Partial<MarketplaceRow>) {
    setAllStores((prev) => prev.map((store) => (store.id === storeId ? { ...store, ...patch } : store)));
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

  async function saveStore(store: MarketplaceRow) {
    setSavingMap((prev) => ({ ...prev, [store.id]: true }));
    const { error: updateError } = await supabase
      .from("marketplace_config")
      .update({
        affiliate_param: store.affiliate_param,
        search_url: store.search_url,
        brand_color: store.brand_color,
        priority: store.priority,
        categories: normalizeCategories(store.categories),
        is_active: store.is_active,
      })
      .eq("id", store.id);

    setSavingMap((prev) => ({ ...prev, [store.id]: false }));

    if (updateError) {
      setCardError(store.id, updateError.message);
      return;
    }

    toast.success(`${store.store_name} saved successfully`);
    await queryClient.invalidateQueries({ queryKey: ["admin-marketplaces"] });
  }

  async function toggleActive(store: MarketplaceRow, nextValue: boolean) {
    updateStoreInState(store.id, { is_active: nextValue });
    const { error: updateError } = await supabase
      .from("marketplace_config")
      .update({ is_active: nextValue })
      .eq("id", store.id);

    if (updateError) {
      updateStoreInState(store.id, { is_active: store.is_active });
      setCardError(store.id, updateError.message);
      return;
    }

    toast.success(nextValue ? "Store activated" : "Store deactivated");
    await queryClient.invalidateQueries({ queryKey: ["admin-marketplaces"] });
  }

  async function deleteStoreConfirmed() {
    if (!deleteStore) return;
    const target = deleteStore;
    const { error: deleteError } = await supabase
      .from("marketplace_config")
      .delete()
      .eq("id", target.id);

    if (deleteError) {
      toast.error(`Failed to delete store: ${deleteError.message}`);
      return;
    }

    setAllStores((prev) => prev.filter((store) => store.id !== target.id));
    setDeleteStore(null);
    toast.success(`${target.store_name} deleted from ${countryMeta(target.country_code).name}`);
    await queryClient.invalidateQueries({ queryKey: ["admin-marketplaces"] });
  }

  async function addStore() {
    setAddError("");

    const payload = {
      store_id: addForm.store_id.trim(),
      store_name: addForm.store_name.trim(),
      domain: addForm.domain.trim().replace(/^https?:\/\//i, ""),
      search_url: addForm.search_url.trim(),
      affiliate_param: addForm.affiliate_param.trim(),
      brand_color: addForm.brand_color.trim() || "#888888",
      priority: Number(addForm.priority) || Math.max(1, countryStores.length + 1),
      categories: addForm.categories,
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
    if (payload.affiliate_param.length > 200) {
      setAddError("Affiliate parameter must be under 200 characters.");
      return;
    }
    if (!isValidHex(payload.brand_color)) {
      setAddError("Brand color must be a valid hex value like #888888.");
      return;
    }
    if (payload.priority < 1 || payload.priority > 99) {
      setAddError("Priority must be between 1 and 99.");
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

    const { error: insertError } = await supabase.from("marketplace_config").insert({
      country_code: selectedCountry,
      store_id: payload.store_id,
      store_name: payload.store_name,
      domain: payload.domain,
      search_url: payload.search_url,
      affiliate_param: payload.affiliate_param,
      brand_color: payload.brand_color,
      categories: payload.categories,
      priority: payload.priority,
      is_active: true,
    });

    setIsAddSaving(false);

    if (insertError) {
      setAddError(insertError.message);
      return;
    }

    setIsAddOpen(false);
    setAddForm({ ...EMPTY_FORM, priority: Math.max(1, countryStores.length + 2) });
    setAddCategoryInput("");
    toast.success(`${payload.store_name} added to ${selectedMeta.name}`);
    await queryClient.invalidateQueries({ queryKey: ["admin-marketplaces"] });
  }

  async function setCountryActiveState(nextActive: boolean) {
    if (countryStores.length === 0) return;
    setIsBulkSaving(true);
    const { error: bulkError } = await supabase
      .from("marketplace_config")
      .update({ is_active: nextActive })
      .eq("country_code", selectedCountry);
    setIsBulkSaving(false);

    if (bulkError) {
      toast.error(`Failed to update stores: ${bulkError.message}`);
      return;
    }

    setAllStores((prev) => prev.map((store) => store.country_code === selectedCountry ? { ...store, is_active: nextActive } : store));
    setBulkAction(null);
    toast.success(nextActive ? `Activated all ${selectedMeta.name} stores` : `Deactivated all ${selectedMeta.name} stores`);
    await queryClient.invalidateQueries({ queryKey: ["admin-marketplaces"] });
  }

  function exportCsv() {
    const rows = [
      ["country_code", "store_id", "store_name", "domain", "search_url", "affiliate_param", "brand_color", "categories", "priority", "is_active"],
      ...allStores.map((store) => [
        store.country_code,
        store.store_id,
        store.store_name,
        store.domain,
        store.search_url,
        store.affiliate_param ?? "",
        store.brand_color ?? "",
        normalizeCategories(store.categories).join(";"),
        String(store.priority ?? ""),
        String(Boolean(store.is_active)),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `giftmind-marketplaces-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function testLink(store: MarketplaceRow) {
    const previewUrl = buildPreviewUrl(store.search_url, store.affiliate_param ?? "");
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
    let reachable = 0;
    let unreachable = 0;
    const nextState = { ...testState };

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

  return (
    <div className="space-y-6">
      <SEOHead title="Marketplace Configuration - GiftMind" description="Manage store links and affiliate tags for each country." noIndex={true} />

      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">🏪 Marketplace Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage store links, affiliate tags, and availability for each country. Changes affect product links immediately.
        </p>
      </div>

      {allStores.length > 0 && allStores.length < 60 ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              The marketplace_config table has only {allStores.length} stores. Expected 60+. Run the seed SQL from the schema setup guide.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["🌍", summary.countries, "Countries"],
          ["🏪", summary.total, "Total"],
          ["✅", summary.active, "Active"],
          ["❌", summary.inactive, "Inactive"],
        ].map(([icon, value, label]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-center gap-4 p-5 text-center">
              <div className="text-2xl">{icon}</div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto">
            {COUNTRIES.map((country) => {
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
              setAddForm({ ...EMPTY_FORM, priority: Math.max(1, countryStores.length + 1) });
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
            <Button variant="outline" onClick={exportCsv} disabled={allStores.length === 0}>Export CSV</Button>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by store name or domain" className="pl-9" />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load marketplace data. Check your connection.</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : isLoading || isFetching ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[520px] rounded-xl" />
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
              setAddForm({ ...EMPTY_FORM, priority: 1 });
              setAddCategoryInput("");
              setAddError("");
              setIsAddOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Store for {selectedMeta.name}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredStores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              original={(data ?? []).find((row) => row.id === store.id) as MarketplaceRow | undefined}
              clickStats={clicksByStore[store.store_id] ?? { total: 0, month: 0 }}
              testState={testState[store.id]}
              categoryInput={categoryInputs[store.id] ?? ""}
              isSaving={Boolean(savingMap[store.id])}
              saveError={saveErrors[store.id]}
              onFieldChange={(patch) => updateStoreInState(store.id, patch)}
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
                const next = (categoryInputs[store.id] ?? "").trim().toLowerCase();
                if (!next) return;
                const categories = normalizeCategories(store.categories);
                if (!categories.includes(next)) {
                  updateStoreInState(store.id, { categories: [...categories, next] });
                }
                setCategoryInputs((prev) => ({ ...prev, [store.id]: "" }));
              }}
              onRemoveCategory={(category) => {
                updateStoreInState(store.id, { categories: normalizeCategories(store.categories).filter((item) => item !== category) });
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl sm:max-w-2xl max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none">
          <DialogHeader>
            <DialogTitle>Add New Store to {selectedMeta.name} {selectedMeta.flag}</DialogTitle>
            <DialogDescription>Configure a store that will appear in product links for this country.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-sm:max-h-[75dvh]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Store ID *</Label>
                <Input value={addForm.store_id} onChange={(event) => setAddForm((prev) => ({ ...prev, store_id: event.target.value }))} placeholder="amazon_in" />
                <p className="text-xs text-muted-foreground">Lowercase, numbers, underscores only. Max 50 chars.</p>
              </div>
              <div className="space-y-2">
                <Label>Store Name *</Label>
                <Input value={addForm.store_name} onChange={(event) => setAddForm((prev) => ({ ...prev, store_name: event.target.value }))} placeholder="Amazon" />
              </div>
              <div className="space-y-2">
                <Label>Domain *</Label>
                <Input value={addForm.domain} onChange={(event) => setAddForm((prev) => ({ ...prev, domain: event.target.value }))} placeholder="amazon.in" />
                <p className="text-xs text-muted-foreground">Without https://</p>
              </div>
              <div className="space-y-2">
                <Label>Search URL *</Label>
                <Input value={addForm.search_url} onChange={(event) => setAddForm((prev) => ({ ...prev, search_url: event.target.value }))} placeholder="https://www.amazon.in/s?k=" />
                <p className="text-xs text-muted-foreground">Must start with http:// or https://</p>
              </div>
              <div className="space-y-2">
                <Label>Affiliate Parameter</Label>
                <Input value={addForm.affiliate_param} onChange={(event) => setAddForm((prev) => ({ ...prev, affiliate_param: event.target.value }))} placeholder="&tag=giftmind-21" />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" min="1" max="99" value={addForm.priority} onChange={(event) => setAddForm((prev) => ({ ...prev, priority: Number(event.target.value) || 1 }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Brand Color</Label>
                <div className="flex gap-2">
                  <Input value={addForm.brand_color} onChange={(event) => setAddForm((prev) => ({ ...prev, brand_color: event.target.value }))} />
                  <input type="color" value={isValidHex(addForm.brand_color) ? addForm.brand_color : "#888888"} onChange={(event) => setAddForm((prev) => ({ ...prev, brand_color: event.target.value }))} className="h-10 w-12 rounded-md border p-1" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2">
                {addForm.categories.map((category) => (
                  <Badge key={category} variant="secondary" className="gap-1">
                    {category}
                    <button type="button" onClick={() => setAddForm((prev) => ({ ...prev, categories: prev.categories.filter((item) => item !== category) }))}>×</button>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={addCategoryInput}
                  onChange={(event) => setAddCategoryInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const next = addCategoryInput.trim().toLowerCase();
                      if (!next) return;
                      setAddForm((prev) => ({ ...prev, categories: prev.categories.includes(next) ? prev.categories : [...prev.categories, next] }));
                      setAddCategoryInput("");
                    }
                  }}
                  list="add-store-categories"
                  placeholder="Add categories"
                />
                <datalist id="add-store-categories">
                  {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
                </datalist>
                <Button variant="outline" onClick={() => {
                  const next = addCategoryInput.trim().toLowerCase();
                  if (!next) return;
                  setAddForm((prev) => ({ ...prev, categories: prev.categories.includes(next) ? prev.categories : [...prev.categories, next] }));
                  setAddCategoryInput("");
                }}>+ Add</Button>
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to show for all gift types.</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="break-all text-sm text-muted-foreground">Test URL: {buildPreviewUrl(addForm.search_url, addForm.affiliate_param) || "Enter search URL to preview"}</p>
                <Button
                  variant="outline"
                  onClick={() => window.open(buildPreviewUrl(addForm.search_url, addForm.affiliate_param), "_blank", "noopener,noreferrer")}
                  disabled={!buildPreviewUrl(addForm.search_url, addForm.affiliate_param)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Test URL
                </Button>
              </CardContent>
            </Card>

            {addError ? <p className="text-sm text-destructive">{addError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void addStore()} disabled={isAddSaving}>
              {isAddSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteStore)} onOpenChange={(open) => !open && setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteStore?.store_name} from {deleteStore ? countryMeta(deleteStore.country_code).name : selectedMeta.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the store from product link results for this country. Users will no longer see links to this store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteStoreConfirmed()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(bulkAction)} onOpenChange={(open) => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkAction === "activate" ? `Activate all ${countryStores.length} stores in ${selectedMeta.name}?` : `Deactivate all ${countryStores.length} stores in ${selectedMeta.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "activate"
                ? "All stores in this country will become available for product links immediately."
                : "Users won't see any product links for this country until stores are reactivated."}
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

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Drag-to-reorder is not enabled in this version. Use the priority field instead. Lower priority number = shown first in product results.
          {clicksLoading ? " Loading click analytics..." : ""}
        </CardContent>
      </Card>
    </div>
  );
}
