import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import RecipientCard from "@/components/recipients/RecipientCard";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Users, Search, Heart, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FILTER_GROUPS, type RecipientFormData } from "@/components/recipients/constants";
import { useUserPlan } from "@/hooks/useUserPlan";
import { sanitizeString } from "@/lib/validation";

type SortOption = "recent" | "upcoming" | "most_gifted";

const MyPeople = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { plan, limits } = useUserPlan();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterIdx, setFilterIdx] = useState(0);
  const [sort, setSort] = useState<SortOption>("recent");

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("country").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
  const userCountry = (profile as any)?.country || "US";

  const filtered = useMemo(() => {
    let list = recipients as any[];
    const cleanSearch = sanitizeString(search, 100).toLowerCase();
    if (cleanSearch) {
      const q = cleanSearch;
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    const group = FILTER_GROUPS[filterIdx];
    if (group.types.length > 0) {
      list = list.filter((r: any) => group.types.includes(r.relationship_type));
    }
    if (sort === "recent") {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [recipients, search, filterIdx, sort]);

  const atLimit = recipients.length >= limits.recipients;
  const capacityPct = limits.recipients === Infinity ? 0 : recipients.length / limits.recipients;
  const capacityColor = capacityPct >= 1 ? "text-destructive" : capacityPct >= 0.8 ? "text-warning" : "text-muted-foreground";

  // Determine which plan to recommend on upgrade
  const recommendedPlan = plan === "free" ? "starter" : plan === "starter" ? "popular" : "pro";

  const createMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { error } = await supabase.from("recipients").insert({
        user_id: user!.id, name: form.name,
        relationship_type: form.relationship_type as any,
        relationship_depth: form.relationship_depth as any,
        age_range: form.age_range ? (form.age_range as any) : null,
        gender: form.gender ? (form.gender as any) : null,
        interests: form.interests,
        cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
        country: form.country || null,
        notes: form.notes || null,
        important_dates: form.important_dates as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setModalOpen(false);
      toast.success("Person added!");
    },
    onError: () => toast.error("Failed to add person"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: RecipientFormData }) => {
      const { error } = await supabase.from("recipients").update({
        name: form.name,
        relationship_type: form.relationship_type as any,
        relationship_depth: form.relationship_depth as any,
        age_range: form.age_range ? (form.age_range as any) : null,
        gender: form.gender ? (form.gender as any) : null,
        interests: form.interests,
        cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
        country: form.country || null,
        notes: form.notes || null,
        important_dates: form.important_dates as any,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setEditingId(null); setModalOpen(false);
      toast.success("Person updated!");
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      setDeletingId(null); toast.success("Person removed");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openEdit = (id: string) => { setEditingId(id); setModalOpen(true); };
  const openCreate = () => {
    if (atLimit) { setUpgradeOpen(true); return; }
    setEditingId(null); setModalOpen(true);
  };

  const editingRecipient = editingId ? recipients.find((r: any) => r.id === editingId) : null;
  const editInitialData: RecipientFormData | undefined = editingRecipient
    ? {
        name: (editingRecipient as any).name,
        relationship_type: (editingRecipient as any).relationship_type,
        relationship_depth: (editingRecipient as any).relationship_depth,
        age_range: (editingRecipient as any).age_range || "",
        gender: (editingRecipient as any).gender || "",
        interests: (editingRecipient as any).interests || [],
        cultural_context: (editingRecipient as any).cultural_context || "",
        country: (editingRecipient as any).country || "",
        notes: (editingRecipient as any).notes || "",
        important_dates: ((editingRecipient as any).important_dates as any) || [],
      }
    : undefined;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto pb-20 md:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">My People</h1>
          {recipients.length > 0 && (
            atLimit ? (
              <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)} className="text-muted-foreground">
                <Lock className="w-3.5 h-3.5 mr-1" /> Upgrade to add more
              </Button>
            ) : (
              <Button variant="hero" size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Add Person
              </Button>
            )
          )}
        </div>

        {/* Capacity counter */}
        {recipients.length > 0 && (
          <p className={cn("text-xs mb-4", capacityColor)}>
            {recipients.length}/{limits.recipients === Infinity ? "∞" : limits.recipients} people ({limits.label})
          </p>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex gap-3 items-center">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3 rounded-md" />
                      <Skeleton className="h-3 w-1/3 rounded-md" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : recipients.length === 0 ? (
          <Card className="border-border/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-24 h-24 mb-6 relative">
                <svg viewBox="0 0 96 96" fill="none" className="w-full h-full">
                  <circle cx="32" cy="36" r="12" fill="hsl(249 76% 64% / 0.15)" />
                  <circle cx="32" cy="36" r="8" fill="hsl(249 76% 64% / 0.3)" />
                  <circle cx="64" cy="36" r="12" fill="hsl(0 100% 70% / 0.15)" />
                  <circle cx="64" cy="36" r="8" fill="hsl(0 100% 70% / 0.3)" />
                  <rect x="38" y="52" width="20" height="20" rx="4" fill="hsl(249 76% 64% / 0.2)" />
                  <path d="M44 52 L48 44 L52 52" fill="hsl(0 100% 70% / 0.3)" />
                  <line x1="32" y1="48" x2="40" y2="56" stroke="hsl(249 76% 64% / 0.3)" strokeWidth="2" />
                  <line x1="64" y1="48" x2="56" y2="56" stroke="hsl(0 100% 70% / 0.3)" strokeWidth="2" />
                </svg>
                <Heart className="absolute bottom-0 right-0 w-5 h-5 text-accent animate-pulse" />
              </div>
              <p className="text-foreground font-heading font-semibold text-lg mb-1">
                Add someone you care about to get started
              </p>
              <p className="text-muted-foreground text-sm max-w-xs mb-6">
                You can always add more later — start with one person.
              </p>
              <Button variant="hero" size="lg" className="h-12 px-8" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Your First Person
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Search & Filter */}
            <div className="space-y-3 mb-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by name..." value={search}
                    onChange={(e) => setSearch(sanitizeString(e.target.value, 100))} className="pl-9 h-9" />
                </div>
                <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                  <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently added</SelectItem>
                    <SelectItem value="upcoming">Upcoming birthdays</SelectItem>
                    <SelectItem value="most_gifted">Most gifted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                {FILTER_GROUPS.map((g, i) => (
                  <button key={g.label} onClick={() => setFilterIdx(i)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                      i === filterIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No people match your search.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((r: any) => (
                  <RecipientCard key={r.id} recipient={r} userCountry={userCountry}
                    onEdit={() => openEdit(r.id)}
                    onDelete={() => setDeletingId(r.id)}
                    onFindGift={() => navigate(`/gift-flow?recipient=${r.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Reminder note on date fields */}
      {/* This is handled inside RecipientFormModal via planLabel prop */}

      <RecipientFormModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setEditingId(null); }}
        onSubmit={(data) => {
          if (editingId) updateMutation.mutate({ id: editingId, form: data });
          else createMutation.mutate(data);
        }}
        initialData={editInitialData}
        loading={createMutation.isPending || updateMutation.isPending}
        reminderNote={
          plan === "free" || plan === "starter"
            ? "📅 Date saved! Reminders available on Popular and above."
            : plan === "popular"
            ? `📅 ${Math.min(recipients.filter((r: any) => ((r as any).important_dates as any[])?.length > 0).length, 3)}/3 reminders active. Upgrade to Pro for unlimited.`
            : undefined
        }
      />

      {/* Upgrade modal */}
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={recommendedPlan as any}
        reason={`You've reached your ${limits.label} limit of ${limits.recipients} ${limits.recipients === 1 ? "person" : "people"}. Upgrade to save more people and unlock new features.`}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this person?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete their profile and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MyPeople;
