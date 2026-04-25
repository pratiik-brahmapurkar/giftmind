import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import RecipientCard from "@/components/recipients/RecipientCard";
import RecipientDetailPanel from "@/components/recipients/RecipientDetailPanel";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/posthog";
import {
  FILTER_GROUPS,
  type RecipientFormData,
  defaultFormData,
} from "@/components/recipients/constants";
import { getUpgradePlan, getUpgradeText } from "@/lib/geoConfig";
import {
  buildRecipientFormData,
  parseRecipientImportantDates,
  type RecipientMutationError,
} from "@/lib/recipients";
import { countScheduledReminderDates } from "@/lib/reminders";
import { sanitizeString } from "@/lib/validation";
import { useRecipients } from "@/hooks/useRecipients";

type SortOption = "recent" | "upcoming" | "most_gifted";

const MyPeople = () => {
  const navigate = useNavigate();
  const { recipientId } = useParams();
  const {
    query,
    recipients,
    recipientsWithIntelligence,
    userCountry,
    plan,
    limits,
    atLimit,
    activeRecipientIds,
    createMutation,
    updateMutation,
    deleteMutation,
  } = useRecipients();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<"more_recipients" | "reminders">("more_recipients");
  const [search, setSearch] = useState("");
  const [filterIdx, setFilterIdx] = useState(0);
  const [sort, setSort] = useState<SortOption>("recent");
  const [prefilledName, setPrefilledName] = useState("");

  const deferredSearch = useDeferredValue(search);
  const recommendedPlan = getUpgradePlan(plan, upgradeFeature);

  useEffect(() => {
    const trimmed = deferredSearch.trim();
    if (!trimmed) return;

    const timeout = window.setTimeout(() => {
      trackEvent("recipient_search_performed", {
        query_length: trimmed.length,
        result_count: recipientsWithIntelligence.filter((recipient) => {
          const queryValue = trimmed.toLowerCase();
          return recipient.name.toLowerCase().includes(queryValue)
            || recipient.interests.some((interest) => interest.toLowerCase().includes(queryValue))
            || (recipient.notes || "").toLowerCase().includes(queryValue);
        }).length,
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [deferredSearch, recipientsWithIntelligence]);

  useEffect(() => {
    if (!recipientId) return;
    if (query.isLoading) return;

    const exists = recipients.some((recipient) => recipient.id === recipientId);
    if (!exists) {
      navigate("/my-people", { replace: true });
    }
  }, [navigate, query.isLoading, recipientId, recipients]);

  const filtered = useMemo(() => {
    let list = [...recipientsWithIntelligence];
    const cleanSearch = sanitizeString(deferredSearch, 100).toLowerCase();

    if (cleanSearch) {
      list = list.filter((recipient) => {
        return recipient.name.toLowerCase().includes(cleanSearch)
          || recipient.interests.some((interest) => interest.toLowerCase().includes(cleanSearch))
          || (recipient.notes || "").toLowerCase().includes(cleanSearch);
      });
    }

    const group = FILTER_GROUPS[filterIdx];
    if (group.types.length > 0) {
      list = list.filter((recipient) => group.types.includes(recipient.relationship));
    }

    list.sort((a, b) => {
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
  }, [deferredSearch, filterIdx, recipientsWithIntelligence, sort]);

  const editingRecipient = editingId ? recipientsWithIntelligence.find((recipient) => recipient.id === editingId) || null : null;
  const editInitialData: RecipientFormData | undefined = editingRecipient
    ? buildRecipientFormData(editingRecipient)
    : prefilledName
      ? { ...defaultFormData, name: prefilledName }
      : undefined;

  const reminderCount = recipients.reduce(
    (total, recipient) => total + countScheduledReminderDates(parseRecipientImportantDates(recipient.important_dates)),
    0,
  );
  const editingReminderCount = editingRecipient
    ? countScheduledReminderDates(parseRecipientImportantDates(editingRecipient.important_dates))
    : 0;
  const reminderQuota = limits.reminders === 0
    ? {
      plan: "locked" as const,
      used: reminderCount,
      limit: null,
      remaining: null,
    }
    : limits.reminders === -1
      ? {
        plan: "pro" as const,
        used: reminderCount,
        limit: null,
        remaining: null,
      }
      : {
        plan: "pro" as const,
        used: reminderCount,
        limit: Math.min(5, editingReminderCount + Math.max(0, limits.reminders - Math.max(0, reminderCount - editingReminderCount))),
        remaining: Math.max(0, limits.reminders - reminderCount),
      };
  const capacityPct = limits.recipients === -1 ? 0 : recipients.length / limits.recipients;
  const capacityColor = capacityPct >= 1 ? "text-destructive" : capacityPct >= 0.8 ? "text-warning" : "text-muted-foreground";

  const closeModal = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setEditingId(null);
      setPrefilledName("");
    }
  };

  const openEdit = (id: string) => {
    setPrefilledName("");
    setEditingId(id);
    setModalOpen(true);
  };

  const openCreate = (name = "") => {
    if (atLimit) {
      setUpgradeFeature("more_recipients");
      setUpgradeOpen(true);
      return;
    }

    setEditingId(null);
    setPrefilledName(name);
    setModalOpen(true);
  };

  const openDetailPanel = (id: string, isLocked: boolean) => {
    trackEvent("recipient_card_clicked", { recipient_id: id, is_locked: isLocked });
    navigate(`/my-people/${id}`);
  };

  const closeDetailPanel = () => {
    navigate("/my-people");
  };

  const handleFindGift = (id: string, from: "card" | "panel" | "menu", isLocked: boolean) => {
    if (isLocked) {
      setUpgradeFeature("more_recipients");
      setUpgradeOpen(true);
      return;
    }

    trackEvent("recipient_find_gift_clicked", { recipient_id: id, from });
    navigate(`/gift-flow?recipient=${id}`);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl pb-20 md:pb-0">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">My People</h1>
          {recipients.length > 0 && (
            atLimit ? (
              <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)} className="text-muted-foreground">
                <Lock className="mr-1 h-3.5 w-3.5" /> Upgrade to add more
              </Button>
            ) : (
              <Button variant="hero" size="sm" onClick={() => openCreate()}>
                <Plus className="mr-1 h-4 w-4" /> Add Person
              </Button>
            )
          )}
        </div>

        {recipients.length > 0 && (
          <p className={cn("mb-4 text-xs", capacityColor)}>
            {recipients.length}/{limits.recipients === -1 ? "∞" : limits.recipients} people ({limits.label})
          </p>
        )}

        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item} className="border-border/50">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3 rounded-md" />
                      <Skeleton className="h-3 w-1/3 rounded-md" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-full rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : recipients.length === 0 ? (
          <div className="py-8">
            <EmptyState
              title="No recipients yet"
              description="Add the people you gift. GiftMind learns their preferences over time."
              actionLabel="Add your first person"
              onAction={() => openCreate()}
            />
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-3">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, interest, or notes..."
                    value={search}
                    onChange={(event) => setSearch(sanitizeString(event.target.value, 100))}
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently added</SelectItem>
                    <SelectItem value="upcoming">Upcoming dates</SelectItem>
                    <SelectItem value="most_gifted">Most gifted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTER_GROUPS.map((group, index) => (
                  <button
                    key={group.label}
                    onClick={() => setFilterIdx(index)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      index === filterIdx
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              deferredSearch.trim() ? (
                <div className="py-6">
                  <EmptyState
                    title={`No one named "${deferredSearch.trim()}"`}
                    description="Try a different search, or add this person now so you can use them in gift sessions."
                    actionLabel={`Add ${deferredSearch.trim()} as a new person`}
                    onAction={() => openCreate(deferredSearch.trim())}
                  />
                  <div className="mt-3 text-center">
                    <Button variant="ghost" onClick={() => setSearch("")}>Clear search</Button>
                  </div>
                </div>
              ) : (
                <div className="py-6">
                  <EmptyState
                    title="No matches for these filters"
                    description="Try another relationship group or reset the sort and filters to see everyone again."
                    actionLabel="Show all people"
                    onAction={() => {
                      setFilterIdx(0);
                      setSort("recent");
                    }}
                  />
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filtered.map((recipient) => {
                  const isLocked = !activeRecipientIds.has(recipient.id);
                  return (
                    <RecipientCard
                      key={recipient.id}
                      recipient={recipient}
                      userCountry={userCountry}
                      onEdit={() => openEdit(recipient.id)}
                      onDelete={() => setDeletingId(recipient.id)}
                      onFindGift={() => handleFindGift(recipient.id, "card", isLocked)}
                      onCardClick={() => openDetailPanel(recipient.id, isLocked)}
                      isLocked={isLocked}
                      emphasizeUpcoming={sort === "upcoming"}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <RecipientFormModal
        open={modalOpen}
        onOpenChange={closeModal}
        mode={editingId ? "edit" : "create"}
        onSubmit={(data) => {
          if (editingId) {
            updateMutation.mutate(
              { id: editingId, form: data },
              {
                onSuccess: () => {
                  setEditingId(null);
                  setModalOpen(false);
                  toast.success("Person updated!");
                },
                onError: (error) => {
                  const mutationError = error as RecipientMutationError;
                  toast.error(mutationError.userMessage || "Failed to update person. Please try again.");
                },
              },
            );
            return;
          }

          createMutation.mutate(data, {
            onSuccess: (_, form) => {
              setPrefilledName("");
              setModalOpen(false);
              toast.success(`${form.name} added!`);
            },
            onError: (error) => {
              const mutationError = error as RecipientMutationError;
              if ((mutationError.userMessage || "").toLowerCase().includes("limit")) {
                setUpgradeFeature("more_recipients");
                setUpgradeOpen(true);
              }
              toast.error(mutationError.userMessage || "Failed to add person. Please try again.");
            },
          });
        }}
        onDelete={editingRecipient ? () => setDeletingId(editingRecipient.id) : undefined}
        initialData={editInitialData}
        loading={createMutation.isPending || updateMutation.isPending}
        reminderQuota={reminderQuota}
        onUpgradeReminders={() => {
          setUpgradeFeature("reminders");
          setUpgradeOpen(true);
        }}
        reminderNote={
          plan === "spark"
            ? "Date saved. Spark includes 2 reminders. Join the Pro waitlist for unlimited reminders."
            : plan === "pro" && limits.reminders !== -1
              ? `${reminderCount}/${limits.reminders} reminders saved. Join the Pro waitlist for unlimited reminders.`
              : undefined
        }
        stats={editingRecipient ? {
          giftCount: editingRecipient.gift_count,
          sessionCount: editingRecipient.session_count,
          lastGiftDate: editingRecipient.last_gift_date,
          addedAt: editingRecipient.created_at,
        } : undefined}
      />

      <RecipientDetailPanel
        open={Boolean(recipientId)}
        onOpenChange={(open) => {
          if (!open) closeDetailPanel();
        }}
        recipientId={recipientId || null}
        recipients={recipientsWithIntelligence}
        onEdit={(id) => {
          closeDetailPanel();
          openEdit(id);
        }}
        onFindGift={(id) => handleFindGift(id, "panel", !activeRecipientIds.has(id))}
      />

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={recommendedPlan}
        reason={getUpgradeText(plan, upgradeFeature)}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this person?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete their profile and all associated data. Gift history sessions will remain, but the recipient link will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deletingId) return;
                deleteMutation.mutate(deletingId, {
                  onSuccess: () => {
                    if (recipientId === deletingId) {
                      closeDetailPanel();
                    }
                    setDeletingId(null);
                    toast.success("Person removed");
                  },
                  onError: () => toast.error("Failed to delete"),
                });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MyPeople;
