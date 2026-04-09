import { SEOHead } from "@/components/common/SEOHead";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, X, Store } from "lucide-react";

const ADMIN_COUNTRIES = [
  { value: "IN", label: "India", flag: "🇮🇳" },
  { value: "US", label: "USA", flag: "🇺🇸" },
  { value: "GB", label: "UK", flag: "🇬🇧" },
  { value: "AE", label: "UAE", flag: "🇦🇪" },
  { value: "FR", label: "France", flag: "🇫🇷" },
  { value: "DE", label: "Germany", flag: "🇩🇪" },
  { value: "NL", label: "Netherlands", flag: "🇳🇱" },
  { value: "CA", label: "Canada", flag: "🇨🇦" },
  { value: "AU", label: "Australia", flag: "🇦🇺" },
  { value: "SG", label: "Singapore", flag: "🇸🇬" },
  { value: "OTHER", label: "Global", flag: "🌍" },
];

const GIFT_CATEGORIES = [
  "Personalized", "Electronics", "Fashion", "Home & Living",
  "Books", "Experience", "Food & Gourmet", "Beauty",
  "Toys & Games", "Sports", "Jewelry", "Handmade",
];

type Marketplace = {
  id: string;
  country_code: string;
  store_name: string;
  domain: string;
  search_url: string;
  affiliate_param: string;
  brand_color: string | null;
  categories: string[] | null;
  priority: number;
  is_active: boolean;
  store_id: string;
};

const emptyForm = {
  country_code: "IN",
  store_name: "",
  domain: "",
  search_url: "",
  affiliate_param: "",
  brand_color: "#6366f1",
  categories: [] as string[],
  priority: 0,
};

export default function AdminMarketplaces() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("IN");
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [edits, setEdits] = useState<Record<string, Partial<Marketplace>>>({});

  const { data: marketplaces = [], isLoading } = useQuery({
    queryKey: ["marketplace-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_config")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as Marketplace[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (mp: Marketplace) => {
      const updates = edits[mp.id] || {};
      const { error } = await supabase
        .from("marketplace_config")
        .update({
          affiliate_param: updates.affiliate_param ?? mp.affiliate_param,
          is_active: updates.is_active ?? mp.is_active,
          categories: updates.categories ?? mp.categories,
          priority: updates.priority ?? mp.priority,
        })
        .eq("id", mp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-config"] });
      toast.success("Marketplace saved");
    },
    onError: (e: any) => toast.error("Save failed: " + e.message),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const storeId = form.store_name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.random().toString(36).substring(2, 6);
      const { error } = await supabase.from("marketplace_config").insert({
        country_code: form.country_code,
        store_name: form.store_name,
        domain: form.domain,
        search_url: form.search_url || "",
        affiliate_param: form.affiliate_param || "",
        brand_color: form.brand_color || "#6366f1",
        categories: form.categories,
        priority: form.priority,
        store_id: storeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-config"] });
      setAddModal(false);
      setForm({ ...emptyForm, country_code: tab });
      toast.success("Marketplace added");
    },
    onError: (e: any) => toast.error("Add failed: " + e.message),
  });

  const getEdit = (id: string) => edits[id] || {};
  const setEdit = (id: string, patch: Partial<Marketplace>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleCategory = (id: string, current: string[], cat: string) => {
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setEdit(id, { categories: next });
  };

  const toggleFormCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter((c) => c !== cat) : [...f.categories, cat],
    }));
  };

  const filtered = marketplaces.filter((m) => m.country_code === tab);

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Marketplace Config</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-2 p-2">
          {ADMIN_COUNTRIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>{c.flag} {c.label}</TabsTrigger>
          ))}
        </TabsList>

        {ADMIN_COUNTRIES.map((country) => (
          <TabsContent key={country.value} value={country.value} className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <Button onClick={() => { setForm({ ...emptyForm, country_code: country.value }); setAddModal(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Marketplace
              </Button>
              <div className="text-sm font-medium text-muted-foreground">
                {marketplaces.filter((m) => m.country_code === country.value && m.is_active).length} active stores
              </div>
            </div>

            {filtered.length === 0 && !isLoading && (
              <p className="text-muted-foreground text-center py-12">No marketplaces configured for {country.label}.</p>
            )}

            <div className="grid gap-4">
              {filtered.map((mp) => {
                const e = getEdit(mp.id);
                const cats = e.categories ?? mp.categories ?? [];
                const active = e.is_active ?? mp.is_active;
                const tag = e.affiliate_param ?? mp.affiliate_param ?? "";
                const prio = e.priority ?? mp.priority;

                return (
                  <Card key={mp.id} className={!active ? "opacity-60" : ""}>
                    <CardContent className="py-4 px-5">
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        {/* Logo / initial */}
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
                          style={{ backgroundColor: mp.brand_color || "#6366f1" }}
                        >
                          {mp.store_name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 space-y-3">
                          <div>
                            <p className="font-bold text-base">{mp.store_name}</p>
                            <p className="text-xs text-muted-foreground">{mp.domain}</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Affiliate Tag</Label>
                              <Input
                                value={tag}
                                onChange={(ev) => setEdit(mp.id, { affiliate_param: ev.target.value })}
                                className="h-8 text-xs"
                                placeholder="e.g. giftmind-21"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Priority</Label>
                              <Input
                                type="number"
                                value={prio}
                                onChange={(ev) => setEdit(mp.id, { priority: parseInt(ev.target.value) || 0 })}
                                className="h-8 text-xs w-20"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-4">
                              <Switch checked={active} onCheckedChange={(v) => setEdit(mp.id, { is_active: v })} />
                              <Label className="text-xs">{active ? "Active" : "Inactive"}</Label>
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs mb-1 block">Categories</Label>
                            <div className="flex flex-wrap gap-1">
                              {GIFT_CATEGORIES.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => toggleCategory(mp.id, cats, cat)}
                                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                                    cats.includes(cat)
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                  }`}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <Button size="sm" onClick={() => saveMutation.mutate(mp)} disabled={saveMutation.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" /> Save
                          </Button>
                          {mp.search_url && (
                            <Button size="sm" variant="outline" onClick={() => window.open(mp.search_url + encodeURIComponent("test gift"), "_blank")}>
                              Test Link
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground border-t pt-4 mt-6">
              Changes take effect immediately. No code deploy needed.<br />
              Affiliate tags are appended to all product links for this store.
            </p>
          </TabsContent>
        ))}
      </Tabs>

      {/* Add Modal */}
      <Dialog open={addModal} onOpenChange={setAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Add Marketplace</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Country</Label>
              <Select value={form.country_code} onValueChange={(v) => setForm((f) => ({ ...f, country_code: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADMIN_COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Store Name *</Label>
                <Input value={form.store_name} onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))} placeholder="Amazon" />
              </div>
              <div>
                <Label className="text-xs">Domain *</Label>
                <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="amazon.in" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Search URL Pattern</Label>
              <Input value={form.search_url} onChange={(e) => setForm((f) => ({ ...f, search_url: e.target.value }))} placeholder="https://amazon.in/s?k=" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Affiliate Tag</Label>
                <Input value={form.affiliate_param} onChange={(e) => setForm((f) => ({ ...f, affiliate_param: e.target.value }))} placeholder="giftmind-21" />
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs">Brand Color</Label>
                <div className="flex gap-2">
                  <Input type="color" value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))} className="w-10 h-8 p-0.5" />
                  <Input value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))} className="h-8 text-xs flex-1" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Categories</Label>
              <div className="flex flex-wrap gap-1">
                {GIFT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleFormCategory(cat)}
                    className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                      form.categories.includes(cat)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.store_name || !form.domain || addMutation.isPending}>
              Add Marketplace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
