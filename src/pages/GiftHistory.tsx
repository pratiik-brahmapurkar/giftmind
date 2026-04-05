import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gift, MoreVertical, Sparkles, Calendar, Filter, X, Download, Lock } from "lucide-react";
import { format } from "date-fns";
import { OCCASIONS } from "@/components/gift-flow/constants";
import { RELATIONSHIP_COLORS } from "@/components/recipients/constants";
import GiftDetailPanel from "@/components/gift-history/GiftDetailPanel";
import FeedbackModal from "@/components/gift-history/FeedbackModal";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { useUserPlan } from "@/hooks/useUserPlan";
import type { Tables } from "@/integrations/supabase/types";

type GiftSession = Tables<"gift_sessions"> & {
  recipients?: Tables<"recipients"> | null;
};

const GiftHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedSession, setSelectedSession] = useState<GiftSession | null>(null);
  const [feedbackSession, setFeedbackSession] = useState<GiftSession | null>(null);
  const [filterOccasion, setFilterOccasion] = useState<string>("all");
  const [filterRecipient, setFilterRecipient] = useState<string>("all");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["gift-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("*, recipients(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as GiftSession[]) || [];
    },
    enabled: !!user,
  });

  const { data: recipients = [] } = useQuery({
    queryKey: ["recipients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipients").select("*");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({
      sessionId,
      rating,
      notes,
    }: {
      sessionId: string;
      rating: string;
      notes: string;
    }) => {
      const { error } = await supabase
        .from("gift_sessions")
        .update({ feedback_rating: rating, feedback_notes: notes })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gift-sessions"] });
      setFeedbackSession(null);
    },
  });

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filterOccasion !== "all" && s.occasion !== filterOccasion) return false;
      if (filterRecipient !== "all" && s.recipient_id !== filterRecipient) return false;
      return true;
    });
  }, [sessions, filterOccasion, filterRecipient]);

  // Group by month-year
  const grouped = useMemo(() => {
    const map = new Map<string, GiftSession[]>();
    filtered.forEach((s) => {
      const key = format(new Date(s.created_at), "MMMM yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const getOccasionLabel = (val: string | null) => {
    const o = OCCASIONS.find((o) => o.value === val);
    return o ? `${o.emoji} ${o.label}` : val || "—";
  };

  const getChosenGiftName = (session: GiftSession) => {
    if (!session.chosen_gift) return null;
    const gift = session.chosen_gift as Record<string, unknown>;
    return (gift.name as string) || null;
  };

  const getConfidenceBadge = (session: GiftSession) => {
    if (!session.chosen_gift) return null;
    const gift = session.chosen_gift as Record<string, unknown>;
    const score = (gift.confidence as number) || 0;
    if (score >= 80) return { label: "High Confidence 🎯", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    if (score >= 60) return { label: "Good Match", className: "bg-amber-100 text-amber-700 border-amber-200" };
    return { label: "Worth Considering", className: "bg-orange-100 text-orange-700 border-orange-200" };
  };

  const needsFeedback = (session: GiftSession) => {
    if (session.feedback_rating) return false;
    if (!session.occasion_date) return true;
    return new Date(session.occasion_date) < new Date();
  };

  const getRecipientInitial = (session: GiftSession) => {
    const name = session.recipients?.name || "?";
    return name[0].toUpperCase();
  };

  const getRecipientColor = (session: GiftSession) => {
    const rt = session.recipients?.relationship_type;
    return rt ? (RELATIONSHIP_COLORS[rt] || "bg-muted") : "bg-muted";
  };

  const hasFilters = filterOccasion !== "all" || filterRecipient !== "all";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-heading font-bold text-foreground">Your Gift History</h1>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterOccasion} onValueChange={setFilterOccasion}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Occasion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Occasions</SelectItem>
              {OCCASIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.emoji} {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRecipient} onValueChange={setFilterRecipient}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Recipient" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recipients</SelectItem>
              {recipients.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterOccasion("all"); setFilterRecipient("all"); }}
              className="text-xs text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-foreground mb-2">
              No gift sessions yet
            </h2>
            <p className="text-muted-foreground mb-6">Find your first perfect gift!</p>
            <Button variant="hero" onClick={() => navigate("/gift-flow")}>
              <Sparkles className="w-4 h-4 mr-2" /> Find a Gift
            </Button>
          </div>
        )}

        {/* Timeline */}
        {grouped.map(([monthYear, items]) => (
          <div key={monthYear} className="mb-8">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2 mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{monthYear}</span>
              </div>
            </div>

            <div className="relative pl-8 border-l-2 border-border space-y-4">
              {items.map((session) => {
                const chosenName = getChosenGiftName(session);
                const confidence = getConfidenceBadge(session);

                return (
                  <div key={session.id} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -left-[25px] top-4 w-3 h-3 rounded-full border-2 border-primary bg-background" />

                    <Card className="p-4 card-shadow hover:card-shadow-hover transition-shadow">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0 ${getRecipientColor(session)}`}
                        >
                          {getRecipientInitial(session)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                              {session.recipients?.name || "Unknown"}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {getOccasionLabel(session.occasion)}
                            </Badge>
                          </div>

                          <p className="text-sm text-muted-foreground mt-1">
                            {chosenName
                              ? `Gift chosen: ${chosenName}`
                              : "No selection made"}
                          </p>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {confidence && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confidence.className}`}>
                                {confidence.label}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(session.created_at), "MMM d, yyyy")}
                            </span>
                          </div>

                          {needsFeedback(session) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-xs text-primary h-7 px-2"
                              onClick={() => setFeedbackSession(session)}
                            >
                              Give feedback
                            </Button>
                          )}
                        </div>

                        {/* Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedSession(session)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/gift-flow?recipient=${session.recipient_id}`)
                              }
                            >
                              Find another gift for {session.recipients?.name || "them"}
                            </DropdownMenuItem>
                            {needsFeedback(session) && (
                              <DropdownMenuItem onClick={() => setFeedbackSession(session)}>
                                Give feedback
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!isLoading && sessions.length > 0 && filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No sessions match your filters.
          </p>
        )}
      </div>

      {/* Detail slide-over */}
      <GiftDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />

      {/* Feedback modal */}
      <FeedbackModal
        session={feedbackSession}
        onClose={() => setFeedbackSession(null)}
        onSubmit={(rating, notes) => {
          if (!feedbackSession) return;
          feedbackMutation.mutate({ sessionId: feedbackSession.id, rating, notes });
        }}
        isSubmitting={feedbackMutation.isPending}
      />
    </DashboardLayout>
  );
};

export default GiftHistory;
