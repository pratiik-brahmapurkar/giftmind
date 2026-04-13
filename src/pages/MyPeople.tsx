import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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
import { FILTER_GROUPS, type ImportantDate, type RecipientFormData } from "@/components/recipients/constants";
import { useUserPlan } from "@/hooks/useUserPlan";
import {
  buildRecipientInsertPayload,
  buildRecipientUpdatePayload,
  createRecipientAuthError,
  createRecipientMutationError,
  getRecipientRelationship,
  type RecipientMutationError,
} from "@/lib/recipients";
import { sanitizeString } from "@/lib/validation";

type SortOption = "recent" | "upcoming" | "most_gifted";
type RecipientRow = Database["public"]["Tables"]["recipients"]["Row"];
type GiftSessionRow = Pick<
  Database["public"]["Tables"]["gift_sessions"]["Row"],
  "recipient_id" | "created_at" | "status" | "selected_gift_name"
>;

type RecipientWithIntelligence = RecipientRow & {
  gift_count: number;
  next_important_date: ImportantDate | null;
  next_important_date_days: number | null;
};

function parseImportantDates(value: RecipientRow["important_dates"]): ImportantDate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<ImportantDate>;
      if (typeof candidate.label !== "string" || typeof candidate.date !== "string") return null;
      return {
        label: candidate.label,
        date: candidate.date,
        recurring: Boolean(candidate.recurring),
      };
    })
    .filter((entry): entry is ImportantDate => Boolean(entry));
}

function getDaysUntilDate(mmdd: string) {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today.getFullYear(), month - 1, day);
  if (Number.isNaN(target.getTime())) return null;
  if (target < today) {
    target = new Date(today.getFullYear() + 1, month - 1, day);
  }

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isBirthdayOrAnniversary(label: string) {
  const normalized = label.trim().toLowerCase();
  return normalized.includes("birthday") || normalized.includes("anniversary");
}

function getNextImportantDate(value: RecipientRow["important_dates"]) {
  const dated = parseImportantDates(value)
    .map((entry) => ({
      entry,
      days: getDaysUntilDate(entry.date),
      priority: isBirthdayOrAnniversary(entry.label) ? 0 : 1,
    }))
    .filter((entry): entry is { entry: ImportantDate; days: number; priority: number } => entry.days !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.days - b.days;
    });

  if (dated.length === 0) return null;
  return {
    entry: dated[0].entry,
    days: dated[0].days,
  };
}

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

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: giftSessions = [], isLoading: giftSessionsLoading } = useQuery({
    queryKey: ["recipient-intelligence", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("recipient_id,created_at,status,selected_gift_name")
        .not("recipient_id", "is", null);
      if (error) throw error;
      return (data || []) as GiftSessionRow[];
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

  const recipientGiftStats = useMemo(() => {
    return giftSessions.reduce<Record<string, { gift_count: number; last_gift_date: string | null }>>((acc, session) => {
      if (!session.recipient_id) return acc;
      const wasGifted = session.status === "completed" || Boolean(session.selected_gift_name);
      if (!wasGifted) return acc;

      const key = session.recipient_id;
      const createdAt = session.created_at || null;

      if (!acc[key]) {
        acc[key] = { gift_count: 0, last_gift_date: null };
      }

      acc[key].gift_count += 1;
      if (!acc[key].last_gift_date || (createdAt && new Date(createdAt) > new Date(acc[key].last_gift_date!))) {
        acc[key].last_gift_date = createdAt;
      }

      return acc;
    }, {});
  }, [giftSessions]);

  const filtered = useMemo(() => {
    let list: RecipientWithIntelligence[] = (recipients as RecipientRow[]).map((recipient) => {
      const giftStats = recipientGiftStats[recipient.id];
      const nextDate = getNextImportantDate(recipient.important_dates);

      return {
        ...recipient,
        relationship: getRecipientRelationship(recipient) || null,
        interests: recipient.interests ?? [],
        gift_count: giftStats?.gift_count || 0,
        last_gift_date: giftStats?.last_gift_date || recipient.last_gift_date,
        next_important_date: nextDate?.entry || null,
        next_important_date_days: nextDate?.days ?? null,
      };
    });
    const cleanSearch = sanitizeString(search, 100).toLowerCase();
    if (cleanSearch) {
      const q = cleanSearch;
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    const group = FILTER_GROUPS[filterIdx];
    if (group.types.length > 0) {
      list = list.filter((r) => group.types.includes(getRecipientRelationship(r)));
    }
    list = [...list].sort((a, b) => {
      if (sort === "upcoming") {
        if (a.next_important_date_days === null && b.next_important_date_days === null) {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (a.next_important_date_days === null) return 1;
        if (b.next_important_date_days === null) return -1;
        if (a.next_important_date_days !== b.next_important_date_days) {
          return a.next_important_date_days - b.next_important_date_days;
        }
        if (b.gift_count !== a.gift_count) return b.gift_count - a.gift_count;
      }

      if (sort === "most_gifted") {
        if (b.gift_count !== a.gift_count) return b.gift_count - a.gift_count;
        if (a.last_gift_date && b.last_gift_date && a.last_gift_date !== b.last_gift_date) {
          return new Date(b.last_gift_date).getTime() - new Date(a.last_gift_date).getTime();
        }
        if (a.last_gift_date && !b.last_gift_date) return -1;
        if (!a.last_gift_date && b.last_gift_date) return 1;
      }

      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return list;
  }, [recipients, recipientGiftStats, search, filterIdx, sort]);

  const atLimit = recipients.length >= limits.recipients;
  const capacityPct = limits.recipients === Infinity ? 0 : recipients.length / limits.recipients;
  const capacityColor = capacityPct >= 1 ? "text-destructive" : capacityPct >= 0.8 ? "text-warning" : "text-muted-foreground";

  // Determine which plan to recommend on upgrade
  const recommendedPlan = plan === "free" ? "starter" : plan === "starter" ? "popular" : "pro";

  const createMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to add a person");

      const payload = buildRecipientInsertPayload(authUser.id, form);
      const { data, error } = await supabase
        .from("recipients")
        .insert(payload)
        .select()
        .single();

      if (error) throw createRecipientMutationError("insert", error, payload);
      return data;
    },
    onSuccess: (_, form) => {
      queryClient.invalidateQueries({ queryKey: ["recipients", user?.id] });
      setModalOpen(false);
      toast.success(`${form.name} added!`);
    },
    onError: (error: RecipientMutationError) => toast.error(error.userMessage || "Failed to add person. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: RecipientFormData }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to update a person");

      const payload = buildRecipientUpdatePayload(form);
      const { error } = await supabase
        .from("recipients")
        .update(payload)
        .eq("id", id)
        .eq("user_id", authUser.id);

      if (error) throw createRecipientMutationError("update", error, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients", user?.id] });
      setEditingId(null); setModalOpen(false);
      toast.success("Person updated!");
    },
    onError: (error: RecipientMutationError) => toast.error(error.userMessage || "Failed to update person. Please try again."),
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
        relationship_type: getRecipientRelationship(editingRecipient as any),
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
        {recipientsLoading || giftSessionsLoading ? (
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
                    <SelectItem value="upcoming">Upcoming dates</SelectItem>
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
