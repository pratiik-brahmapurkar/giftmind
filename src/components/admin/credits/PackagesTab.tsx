import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { captureError } from "@/lib/sentry";

interface PackageForm {
  id?: string;
  name: string;
  credits: number;
  price_inr: number;
  price_usd: number;
  validity_days: number;
  badge_text: string;
  features: string;
  is_active: boolean;
  sort_order: number;
}

const emptyForm: PackageForm = {
  name: "", credits: 0, price_inr: 0, price_usd: 0,
  validity_days: 365, badge_text: "", features: "", is_active: true, sort_order: 0,
};

const PackagesTab = () => {
  const queryClient = useQueryClient();
  const [editPkg, setEditPkg] = useState<PackageForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const openEdit = (pkg?: any) => {
    if (pkg) {
      setEditPkg({
        id: pkg.id,
        name: pkg.name,
        credits: pkg.credits,
        price_inr: Number(pkg.price_inr),
        price_usd: Number(pkg.price_usd),
        validity_days: pkg.validity_days,
        badge_text: pkg.badge_text || "",
        features: (pkg.features || []).join("\n"),
        is_active: pkg.is_active,
        sort_order: pkg.sort_order,
      });
    } else {
      setEditPkg({ ...emptyForm, sort_order: packages.length + 1 });
    }
  };

  const handleSave = async () => {
    if (!editPkg || !editPkg.name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: editPkg.name,
        credits: editPkg.credits,
        price_inr: editPkg.price_inr,
        price_usd: editPkg.price_usd,
        validity_days: editPkg.validity_days,
        badge_text: editPkg.badge_text || null,
        features: editPkg.features.split("\n").map((f) => f.trim()).filter(Boolean),
        is_active: editPkg.is_active,
        sort_order: editPkg.sort_order,
      };

      if (editPkg.id) {
        const { error } = await supabase.from("credit_packages").update(payload).eq("id", editPkg.id);
        if (error) throw error;
        toast.success("Package updated");
      } else {
        const { error } = await supabase.from("credit_packages").insert(payload);
        if (error) throw error;
        toast.success("Package created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      setEditPkg(null);
    } catch (err: any) {
      captureError(
        err instanceof Error ? err : new Error("Failed to save credit package"),
        { action: "admin-save-credit-package", package_id: editPkg?.id ?? null },
      );
      toast.error(err.message || "Failed to save package");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("credit_packages").update({ is_active: active }).eq("id", id);
    if (error) { toast.error("Failed to toggle"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
    toast.success(active ? "Package activated" : "Package deactivated");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Credit Packages</h3>
        <Button size="sm" onClick={() => openEdit()}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Package
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading packages...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card key={pkg.id} className={!pkg.is_active ? "opacity-50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{pkg.name}</CardTitle>
                    {pkg.badge_text && (
                      <Badge className="mt-1 bg-primary/10 text-primary border-primary/20">{pkg.badge_text}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={pkg.is_active}
                      onCheckedChange={(v) => toggleActive(pkg.id, v)}
                    />
                    <Button variant="ghost" size="icon" className="w-8 h-8" aria-label="Edit package" onClick={() => openEdit(pkg)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">₹{Number(pkg.price_inr)}</span>
                  <span className="text-sm text-muted-foreground">/ ${Number(pkg.price_usd)}</span>
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">{pkg.credits}</span> credits</p>
                  <p className="text-muted-foreground">{pkg.validity_days} days validity</p>
                </div>
                {pkg.features && (pkg.features as string[]).length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {(pkg.features as string[]).map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Dialog open={!!editPkg} onOpenChange={(o) => !o && setEditPkg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPkg?.id ? "Edit Package" : "New Package"}</DialogTitle>
            <DialogDescription>Configure the credit package details</DialogDescription>
          </DialogHeader>
          {editPkg && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div>
                <Label>Name</Label>
                <Input value={editPkg.name} onChange={(e) => setEditPkg({ ...editPkg, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Credits</Label>
                  <Input type="number" value={editPkg.credits} onChange={(e) => setEditPkg({ ...editPkg, credits: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Validity (days)</Label>
                  <Input type="number" value={editPkg.validity_days} onChange={(e) => setEditPkg({ ...editPkg, validity_days: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price INR (₹)</Label>
                  <Input type="number" step="0.01" value={editPkg.price_inr} onChange={(e) => setEditPkg({ ...editPkg, price_inr: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Price USD ($)</Label>
                  <Input type="number" step="0.01" value={editPkg.price_usd} onChange={(e) => setEditPkg({ ...editPkg, price_usd: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Badge Text</Label>
                <Input value={editPkg.badge_text} onChange={(e) => setEditPkg({ ...editPkg, badge_text: e.target.value })} placeholder="e.g. Most Popular" />
              </div>
              <div>
                <Label>Features (one per line)</Label>
                <Textarea value={editPkg.features} onChange={(e) => setEditPkg({ ...editPkg, features: e.target.value })} rows={4} placeholder="Feature 1&#10;Feature 2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editPkg.sort_order} onChange={(e) => setEditPkg({ ...editPkg, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch checked={editPkg.is_active} onCheckedChange={(v) => setEditPkg({ ...editPkg, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PackagesTab;
