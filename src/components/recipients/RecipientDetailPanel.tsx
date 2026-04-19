import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { RecipientWithIntelligence } from "@/hooks/useRecipients";
import { COUNTRY_OPTIONS, CULTURAL_CONTEXTS, RELATIONSHIP_TYPES } from "./constants";
import { parseRecipientCulturalContext, parseRecipientImportantDates } from "@/lib/recipients";
import { CalendarDays, Gift, Pencil, Sparkles, UserRound } from "lucide-react";

type GiftHistoryItem = Pick<
  Tables<"gift_sessions">,
  "id" | "created_at" | "occasion" | "selected_gift_name" | "status"
>;

interface RecipientDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string | null;
  recipients: RecipientWithIntelligence[];
  onEdit: (id: string) => void;
  onFindGift: (id: string) => void;
}

function formatDateLabel(value: string) {
  const [month, day] = value.split("-").map(Number);
  if (!month || !day) return value;
  return format(new Date(2026, month - 1, day), "MMMM d");
}

const RecipientDetailPanel = ({
  open,
  onOpenChange,
  recipientId,
  recipients,
  onEdit,
  onFindGift,
}: RecipientDetailPanelProps) => {
  const recipient = useMemo(
    () => recipients.find((entry) => entry.id === recipientId) || null,
    [recipientId, recipients],
  );

  const { data: giftHistory = [] } = useQuery({
    queryKey: ["recipient-gift-history", recipientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("id, created_at, occasion, selected_gift_name, status")
        .eq("recipient_id", recipientId!)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as GiftHistoryItem[];
    },
    enabled: !!recipientId,
    staleTime: 60_000,
  });

  if (!recipient) return null;

  const culturalContext = parseRecipientCulturalContext(recipient.cultural_context);
  const culturalLabel = CULTURAL_CONTEXTS.find((entry) => entry.value === culturalContext.category)?.label
    || culturalContext.category
    || "Not specified";
  const relationshipLabel = RELATIONSHIP_TYPES.find((entry) => entry.value === recipient.relationship)?.label
    || recipient.relationship
    || "Unknown";
  const locationLabel = COUNTRY_OPTIONS.find((entry) => entry.value === recipient.country)?.label || recipient.country || null;
  const importantDates = parseRecipientImportantDates(recipient.important_dates);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="pr-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-heading text-xl">{recipient.name}</SheetTitle>
              <SheetDescription className="mt-1">
                {relationshipLabel}
                {recipient.relationship_depth ? ` · ${recipient.relationship_depth.replace("_", " ")}` : ""}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => onEdit(recipient.id)} aria-label={`Edit ${recipient.name}`}>
              <Pencil size={16} strokeWidth={1.5} />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto pb-24 pt-6">
          <Card className="rounded-xl border-border/70 bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{relationshipLabel}</Badge>
              {recipient.age_range && <Badge variant="outline">{recipient.age_range.replace("_", "–")}</Badge>}
              {recipient.gender && <Badge variant="outline">{recipient.gender.replace(/_/g, " ")}</Badge>}
              {locationLabel && <Badge variant="outline">{locationLabel}</Badge>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Gift sessions</p>
                <p className="mt-1 font-medium text-foreground">{recipient.session_count}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Gifts chosen</p>
                <p className="mt-1 font-medium text-foreground">{recipient.gift_count}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Added {recipient.created_at ? format(new Date(recipient.created_at), "MMM d, yyyy") : "recently"}
              {recipient.last_gift_date ? ` · Last gift ${format(new Date(recipient.last_gift_date), "MMM yyyy")}` : ""}
            </p>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserRound size={14} strokeWidth={1.5} />
              About
            </div>
            <Card className="rounded-xl border-border/70 bg-card p-4 shadow-xs">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Interests</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recipient.interests.length > 0 ? recipient.interests.map((interest) => (
                      <Badge key={interest} variant="secondary">{interest}</Badge>
                    )) : <p className="text-sm text-muted-foreground">No interests saved yet.</p>}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cultural context</p>
                  <p className="mt-2 text-sm text-foreground">{culturalLabel}</p>
                  {culturalContext.dietary.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {culturalContext.dietary.map((item) => (
                        <Badge key={item} variant="outline">{item.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                {recipient.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{recipient.notes}</p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays size={14} strokeWidth={1.5} />
              Important Dates
            </div>
            <Card className="rounded-xl border-border/70 bg-card p-4 shadow-xs">
              {importantDates.length > 0 ? (
                <div className="space-y-3">
                  {importantDates.map((entry) => (
                    <div key={`${entry.label}-${entry.date}`} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.label}</p>
                        <p className="text-sm text-muted-foreground">{formatDateLabel(entry.date)}</p>
                      </div>
                      <Badge variant="outline">{entry.recurring ? "Yearly" : "One-time"}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No important dates saved yet.</p>
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles size={14} strokeWidth={1.5} />
              Gift History
            </div>
            <Card className="rounded-xl border-border/70 bg-card p-4 shadow-xs">
              {giftHistory.length > 0 ? (
                <div className="space-y-3">
                  {giftHistory.map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {entry.selected_gift_name || "No gift chosen"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.created_at ? format(new Date(entry.created_at), "MMM d, yyyy") : "Unknown date"}
                            {entry.occasion ? ` · ${entry.occasion.replace(/_/g, " ")}` : ""}
                          </p>
                        </div>
                        <Badge variant={entry.selected_gift_name ? "secondary" : "outline"}>
                          {entry.selected_gift_name ? "Chosen" : entry.status || "Draft"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">No gifts chosen for {recipient.name} yet.</p>
                  <Button variant="outline" onClick={() => onFindGift(recipient.id)}>
                    <Gift size={16} strokeWidth={1.5} />
                    Find their first gift
                  </Button>
                </div>
              )}
            </Card>
          </section>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <Button className="w-full" variant="hero" onClick={() => onFindGift(recipient.id)}>
            <Gift size={16} strokeWidth={1.5} />
            Find a Gift for {recipient.name}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RecipientDetailPanel;
