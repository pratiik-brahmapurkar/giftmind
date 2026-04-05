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

const COUNTRIES = [
  { value: "india", label: "India", flag: "🇮🇳" },
  { value: "usa", label: "USA", flag: "🇺🇸" },
  { value: "uk", label: "UK", flag: "🇬🇧" },
  { value: "uae", label: "UAE", flag: "🇦🇪" },
];

const GIFT_CATEGORIES = [
  "Personalized", "Electronics", "Fashion", "Home & Living",
  "Books", "Experience", "Food & Gourmet", "Beauty",
  "Toys & Games", "Sports", "Jewelry", "Handmade",
];

type Marketplace = {
  id: string;
  country: string;
  store_name: string;
  domain: string;
  search_url_pattern: string | null;
  affiliate_tag: string | null;
  logo_url: string | null;
  brand_color: string | null;
  categories: string[] | null;
  priority: number;
  is_active: boolean;
};

const emptyForm = {
  country: "india",
  store_name: "",
  domain: "",
  search_url_pattern: "",
  affiliate_tag: "",
  logo_url: "",
  brand_color: "#6366f1",
  categories: [] as string[],
  priority: 0,
};

export default function AdminMarketplaces() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("india");
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
          affiliate_tag: updates.affiliate_tag ?? mp.affiliate_tag,
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
      const { error } = await supabase.from("marketplace_config").insert({
        country: form.country,
        store_name: form.store_name,
        domain: form.domain,
        search_url_pattern: form.search_url_pattern || null,
        affiliate_tag: form.affiliate_tag || "",
        logo_url: form.logo_url || null,
        brand_color: form.brand_color || "#6366f1",
        categories: form.categories,
        priority: form.priority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-config"] });
      setAddModal(false);
      setForm({ ...emptyForm, country: tab });
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

  const filtered = marketplaces.filter((m) => m.country === tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Marketplace Config</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {COUNTRIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>{c.flag} {c.label}</TabsTrigger>
          ))}
        </TabsList>

        {COUNTRIES.map((country) => (
          <TabsContent key={country.value} value={country.value} className="space-y-4 mt-4">
            <Button onClick={() => { setForm({ ...emptyForm, country: country.value }); setAddModal(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Marketplace
            </Button>

            {filtered.length === 0 && !isLoading && (
              <p className="text-muted-foreground text-center py-12">No marketplaces configured for {country.label}.</p>
            )}

            <div className="grid gap-4">
              {filtered.map((mp) => {
                const e = getEdit(mp.id);
                const cats = e.categories ?? mp.categories ?? [];
                const active = e.is_active ?? mp.is_active;
                const tag = e.affiliate_tag ?? mp.affiliate_tag ?? "";
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
                          {mp.logo_url ? (
                            <img src={mp.logo_url} alt={mp.store_name} className="w-full h-full object-contain rounded-lg" />
                          ) : (
                            mp.store_name.charAt(0).toUpperCase()
                          )}
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
                                onChange={(ev) => setEdit(mp.id, { affiliate_tag: ev.target.value })}
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

                        <Button size="sm" className="shrink-0" onClick={() => saveMutation.mutate(mp)} disabled={saveMutation.isPending}>
                          <Save className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
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
              <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>)}
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
              <Input value={form.search_url_pattern} onChange={(e) => setForm((f) => ({ ...f, search_url_pattern: e.target.value }))} placeholder="https://amazon.in/s?k=" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Affiliate Tag</Label>
                <Input value={form.affiliate_tag} onChange={(e) => setForm((f) => ({ ...f, affiliate_tag: e.target.value }))} placeholder="giftmind-21" />
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Logo URL</Label>
                <Input value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
              </div>
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
