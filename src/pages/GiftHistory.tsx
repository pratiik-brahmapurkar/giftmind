import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  Gift,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FeedbackModal from "@/components/gift-history/FeedbackModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { RELATIONSHIP_COLORS } from "@/lib/geoConfig";
import { getOutboundProductUrl, type ProductLink, type ProductResult } from "@/lib/productLinks";
import { getSignalFeedbackComparison, parseSignalChecks, type ParsedSignalCheck } from "@/lib/signalCheck";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type RecipientSummary = Pick<Tables<"recipients">, "id" | "name" | "relationship" | "country">;
type FeedbackRow = Tables<"gift_feedback">;
type MarketplaceRow = Tables<"marketplace_config">;
type SignalCheckRow = Tables<"signal_checks">;

interface Recommendation {
  name: string;
  why_it_works: string;
  confidence_score: number;
  price_anchor: number;
  search_keywords: string[];
  product_category: string;
}

interface AiResponseShape {
  recommendations: Recommendation[];
  occasion_insight?: string | null;
  budget_assessment?: string | null;
  cultural_note?: string | null;
}

type GiftSessionRecord = Tables<"gift_sessions"> & {
  recipients?: RecipientSummary | null;
};

type SessionCardStatus = "completed" | "no_selection" | "in_progress" | "abandoned";

const STATUS_META: Record<
  SessionCardStatus,
  { label: string; className: string; description: string; opacity?: string }
> = {
  completed: {
    label: "Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "Gift selected",
  },
  no_selection: {
    label: "No selection",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    description: "You didn't choose a gift from this session.",
    opacity: "opacity-90",
  },
  in_progress: {
    label: "In Progress",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    description: "You started this session but didn't finish.",
  },
  abandoned: {
    label: "Abandoned",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    description: "This session didn't complete.",
    opacity: "opacity-70",
  },
};

const REACTION_META: Record<string, string> = {
  loved_it: "😍 Loved it",
  liked_it: "😊 Liked it",
  neutral: "😐 Neutral",
  didnt_like: "😕 Didn't like",
};

function humanizeOccasion(occasion: string | null) {
  if (!occasion) return "Occasion";
  return occasion
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseAiResponse(value: unknown): AiResponseShape | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.recommendations)) return null;
  return {
    recommendations: data.recommendations as Recommendation[],
    occasion_insight: (data.occasion_insight as string) || null,
    budget_assessment: (data.budget_assessment as string) || null,
    cultural_note: (data.cultural_note as string) || null,
  };
}

function parseProductResults(value: unknown): ProductResult[] {
  if (!Array.isArray(value)) return [];
  return value as ProductResult[];
}

function getSessionStatus(session: GiftSessionRecord): SessionCardStatus {
  const aiResponse = parseAiResponse(session.ai_response);
  const hasRecommendations = Boolean(aiResponse?.recommendations?.length);

  if (session.status === "completed" && session.selected_gift_name) return "completed";
  if (session.status === "active" && hasRecommendations && !session.selected_gift_name) return "no_selection";
  if (session.status === "active" && !hasRecommendations) return "in_progress";
  return "abandoned";
}

function getSelectedRecommendation(session: GiftSessionRecord) {
  const aiResponse = parseAiResponse(session.ai_response);
  if (!aiResponse) return null;
  if (typeof session.selected_gift_index === "number") {
    return aiResponse.recommendations[session.selected_gift_index] ?? null;
  }
  if (session.selected_gift_name) {
    return aiResponse.recommendations.find((recommendation) => recommendation.name === session.selected_gift_name) ?? null;
  }
  return null;
}

function getConfidenceTone(score: number) {
  if (score >= 90) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 75) return "border-green-200 bg-green-50 text-green-700";
  if (score >= 60) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

function buildSearchUrl(store: MarketplaceRow, keyword: string) {
  const encoded = encodeURIComponent(keyword);
  if (store.search_url.includes("{keyword}")) {
    const withKeyword = store.search_url.replace("{keyword}", encoded);
    return `${withKeyword}${store.affiliate_param ?? ""}`;
  }
  return `${store.search_url}${encoded}${store.affiliate_param ?? ""}`;
}

function resolveStoreLinks(
  recommendation: Recommendation,
  session: GiftSessionRecord,
  stores: MarketplaceRow[],
) {
  const persisted = parseProductResults(session.product_results).find(
    (result) => result.gift_name === recommendation.name,
  );

  if (persisted?.products?.length) {
    return persisted.products;
  }

  const targetCountry = session.recipient_country || session.recipients?.country || "US";
  const countryStores = stores.filter((store) => store.country_code === targetCountry && store.is_active);
  const globalStores = stores.filter((store) => store.country_code === "GLOBAL" && store.is_active);
  const activeStores = countryStores.length > 0 ? countryStores : globalStores;

  return activeStores
    .filter((store) => !store.categories || store.categories.length === 0 || store.categories.includes(recommendation.product_category))
    .sort((left, right) => (left.priority ?? 99) - (right.priority ?? 99))
    .slice(0, 3)
    .map((store) => ({
      store_id: store.store_id,
      store_name: store.store_name,
      domain: store.domain,
      brand_color: store.brand_color || "#6C5CE7",
      search_url: buildSearchUrl(store, recommendation.search_keywords?.[0] || recommendation.name),
      is_search_link: true,
      gift_name: recommendation.name,
      product_category: recommendation.product_category,
    }));
}

function StatCard({ emoji, value, label }: { emoji: string; value: string | number; label: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="text-xl">{emoji}</div>
        <div>
          <div className="text-lg font-semibold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GiftHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    status: "all",
    occasion: "all",
    recipient: "all",
    search: "",
  });
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [feedbackSession, setFeedbackSession] = useState<GiftSessionRecord | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["gift-history-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("*, recipients(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as GiftSessionRecord[]) || [];
    },
    enabled: !!user,
  });

  const { data: feedbackRows = [] } = useQuery({
    queryKey: ["gift-history-feedback", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_feedback")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data as FeedbackRow[]) || [];
    },
    enabled: !!user,
  });

  const { data: signalCheckRows = [] } = useQuery({
    queryKey: ["gift-history-signal-checks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signal_checks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as SignalCheckRow[]) || [];
    },
    enabled: !!user,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["gift-history-marketplace-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_config")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data as MarketplaceRow[]) || [];
    },
  });

  const { data: totalClicks = 0 } = useQuery({
    queryKey: ["gift-history-clicks", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("product_clicks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const feedbackBySession = useMemo(
    () => new Map(feedbackRows.map((row) => [row.session_id, row])),
    [feedbackRows],
  );

  const signalChecksBySessionGift = useMemo(() => {
    const grouped = new Map<string, ParsedSignalCheck[]>();

    for (const row of parseSignalChecks(signalCheckRows)) {
      const key = `${row.session_id}:${row.gift_name}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }

    return grouped;
  }, [signalCheckRows]);

  const uniqueOccasions = useMemo(
    () => [...new Set(sessions.map((session) => session.occasion).filter(Boolean))],
    [sessions],
  );

  const uniqueRecipients = useMemo(() => {
    return [...new Map(sessions
      .filter((session) => session.recipients?.id)
      .map((session) => [session.recipients!.id, session.recipients!]))
      .values()];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const status = getSessionStatus(session);
      const searchTerm = filters.search.trim().toLowerCase();
      const recommendationNames = parseAiResponse(session.ai_response)?.recommendations.map((recommendation) => recommendation.name.toLowerCase()) ?? [];

      if (filters.status !== "all" && status !== filters.status) return false;
      if (filters.occasion !== "all" && session.occasion !== filters.occasion) return false;
      if (filters.recipient !== "all" && session.recipient_id !== filters.recipient) return false;

      if (searchTerm) {
        const haystack = [
          session.recipients?.name ?? "",
          humanizeOccasion(session.occasion),
          session.selected_gift_name ?? "",
          ...recommendationNames,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(searchTerm)) return false;
      }

      return true;
    });
  }, [filters, sessions]);

  const stats = useMemo(() => {
    const completed = sessions.filter((session) => getSessionStatus(session) === "completed");
    const scores = completed
      .map((session) => session.confidence_score || getSelectedRecommendation(session)?.confidence_score || 0)
      .filter((score) => score > 0);
    const avgConfidence = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;

    return {
      total: sessions.length,
      completed: completed.length,
      avgConfidence,
      totalClicks,
    };
  }, [sessions, totalClicks]);

  const groupedSessions = useMemo(() => {
    const visible = filteredSessions.slice(0, visibleCount);
    return visible.reduce<Record<string, GiftSessionRecord[]>>((groups, session) => {
      const key = format(new Date(session.created_at || new Date()), "MMMM yyyy");
      groups[key] = groups[key] || [];
      groups[key].push(session);
      return groups;
    }, {});
  }, [filteredSessions, visibleCount]);

  const feedbackMutation = useMutation({
    mutationFn: async ({
      sessionId,
      rating,
      notes,
      existingFeedbackId,
    }: {
      sessionId: string;
      rating: string;
      notes: string;
      existingFeedbackId?: string | null;
    }) => {
      if (existingFeedbackId) {
        const { error } = await supabase
          .from("gift_feedback")
          .update({
            recipient_reaction: rating,
            notes,
          })
          .eq("id", existingFeedbackId)
          .eq("user_id", user!.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("gift_feedback").insert({
          session_id: sessionId,
          user_id: user!.id,
          recipient_reaction: rating,
          notes,
        });

        if (error) throw error;
      }

      const { error: embeddingError } = await supabase
        .from("gift_embeddings")
        .update({
          reaction: rating,
        })
        .eq("session_id", sessionId)
        .eq("user_id", user!.id);

      if (embeddingError) throw embeddingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gift-history-feedback", user?.id] });
      toast.success("Thanks for your feedback! 🎉");
      setFeedbackSession(null);
    },
  });

  const toggleExpanded = (sessionId: string) => {
    setExpandedIds((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  };

  const renderMiniPreview = (session: GiftSessionRecord) => {
    const aiResponse = parseAiResponse(session.ai_response);
    if (!aiResponse?.recommendations?.length) return null;

    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {aiResponse.recommendations.map((recommendation, index) => {
          const isSelected = session.selected_gift_name === recommendation.name || session.selected_gift_index === index;
          return (
            <div
              key={`${session.id}-${recommendation.name}`}
              className={cn(
                "min-w-[90px] rounded-xl border p-3 text-xs shadow-sm",
                isSelected ? "border-emerald-400 bg-emerald-50" : "border-border bg-background",
              )}
            >
              <div className="font-semibold text-foreground">{recommendation.confidence_score}%</div>
              <div className="mt-1 line-clamp-2 text-muted-foreground">{recommendation.name}</div>
              {isSelected && <div className="mt-2 text-[11px] font-medium text-emerald-700">Selected ✓</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const handleShopAgain = (session: GiftSessionRecord) => {
    const selected = getSelectedRecommendation(session);
    if (!selected) {
      navigate(`/gift-flow?recipient=${session.recipient_id}&occasion=${session.occasion}`);
      return;
    }

    const links = resolveStoreLinks(selected, session, stores);
    if (links.length > 0) {
      const url = getOutboundProductUrl(links[0]);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      return;
    }

    navigate(`/gift-flow?recipient=${session.recipient_id}&occasion=${session.occasion}`);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[720px] space-y-6 px-4 pb-24 pt-2 md:px-0">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Gift History</h1>
          <p className="text-sm text-muted-foreground">Your past gift sessions and recommendations.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard emoji="🎯" value={stats.total} label="Sessions" />
          <StatCard emoji="✅" value={stats.completed} label="Gifts Chosen" />
          <StatCard emoji="⭐" value={`${stats.avgConfidence}%`} label="Avg Confidence" />
          <StatCard emoji="🛒" value={stats.totalClicks} label="Clicks" />
        </div>

        <Card className="border-border/60">
          <CardContent className="grid gap-3 p-4 md:grid-cols-4">
            <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
              <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">✅ Completed</SelectItem>
                <SelectItem value="in_progress">🟡 In Progress</SelectItem>
                <SelectItem value="no_selection">⚪ No Selection</SelectItem>
                <SelectItem value="abandoned">🗑️ Abandoned</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.occasion} onValueChange={(value) => setFilters((current) => ({ ...current, occasion: value }))}>
              <SelectTrigger><SelectValue placeholder="All Occasions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Occasions</SelectItem>
                {uniqueOccasions.map((occasion) => (
                  <SelectItem key={occasion} value={occasion}>
                    {humanizeOccasion(occasion)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.recipient} onValueChange={(value) => setFilters((current) => ({ ...current, recipient: value }))}>
              <SelectTrigger><SelectValue placeholder="All Recipients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recipients</SelectItem>
                {uniqueRecipients.map((recipient) => (
                  <SelectItem key={recipient.id} value={recipient.id}>
                    {recipient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                className="pl-9"
                placeholder="Search..."
              />
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-[220px] w-full rounded-3xl" />
            ))}
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="text-5xl">🎁</div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">No gift sessions yet</h2>
                <p className="text-muted-foreground">Find your first perfect gift</p>
              </div>
              <Button variant="hero" onClick={() => navigate("/gift-flow")}>
                Find a Gift
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && sessions.length > 0 && filteredSessions.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="py-16 text-center text-muted-foreground">
              No sessions match your filters.
            </CardContent>
          </Card>
        )}

        {!isLoading && Object.entries(groupedSessions).map(([month, items]) => (
          <section key={month} className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {month}
            </div>

            <div className="space-y-4">
              {items.map((session) => {
                const status = getSessionStatus(session);
                const meta = STATUS_META[status];
                const aiResponse = parseAiResponse(session.ai_response);
                const selectedRecommendation = getSelectedRecommendation(session);
                const feedback = feedbackBySession.get(session.id);
                const isExpanded = expandedIds.includes(session.id);
                const dateLabel = format(new Date(session.created_at || new Date()), "MMM d, yyyy");
                const recipient = session.recipients;
                const avatarColor = recipient?.relationship ? RELATIONSHIP_COLORS[recipient.relationship] : "#94A3B8";

                return (
                  <Card key={session.id} className={cn("border-border/60 shadow-sm", meta.opacity)}>
                    <CardContent className="space-y-5 p-5 md:p-6">
                      <div className="flex items-start gap-4">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: avatarColor }}
                        >
                          {recipient?.name?.slice(0, 2).toUpperCase() || "?"}
                        </div>

                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{recipient?.name || "Unknown"}</span>
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {humanizeOccasion(session.occasion)}
                            </span>
                            <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", meta.className)}>
                              {status === "completed" && "✅ "}
                              {status === "in_progress" && "🟡 "}
                              {status === "no_selection" && "⚪ "}
                              {status === "abandoned" && "🗑️ "}
                              {meta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{dateLabel}</span>
                          </div>

                          {status === "completed" && selectedRecommendation && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">🎁 Chosen: {session.selected_gift_name}</p>
                              <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", getConfidenceTone(selectedRecommendation.confidence_score))}>
                                🎯 Confidence: {selectedRecommendation.confidence_score}%
                              </span>
                            </div>
                          )}

                          {status === "no_selection" && (
                            <div className="space-y-2 text-sm text-muted-foreground">
                              <p>{meta.description}</p>
                              <p>
                                Budget: $
                                {(session.budget_min || 0).toLocaleString()} – ${(session.budget_max || 0).toLocaleString()}
                              </p>
                            </div>
                          )}

                          {status === "in_progress" && (
                            <div className="space-y-2 text-sm text-muted-foreground">
                              <p>{meta.description}</p>
                            </div>
                          )}

                          {status === "abandoned" && (
                            <div className="space-y-2 text-sm text-muted-foreground">
                              <p>{meta.description}</p>
                              <p>
                                Budget: $
                                {(session.budget_min || 0).toLocaleString()} – ${(session.budget_max || 0).toLocaleString()}
                              </p>
                            </div>
                          )}

                          {status !== "abandoned" && renderMiniPreview(session)}

                          <div className="flex flex-wrap gap-2">
                            {(status === "completed" || status === "no_selection") && aiResponse?.recommendations?.length ? (
                              <Button variant="outline" size="sm" onClick={() => toggleExpanded(session.id)}>
                                {isExpanded ? "Collapse" : status === "completed" ? "View Details" : "View Recommendations"}
                                <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                              </Button>
                            ) : null}

                            {status === "completed" && (
                              <Button variant="outline" size="sm" onClick={() => handleShopAgain(session)}>
                                Shop Again
                                <ShoppingBag className="ml-2 h-4 w-4" />
                              </Button>
                            )}

                            {(status === "no_selection" || status === "abandoned") && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/gift-flow?recipient=${session.recipient_id}&occasion=${session.occasion}`)}
                              >
                                Try Again
                              </Button>
                            )}

                            {status === "in_progress" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/gift-flow?recipient=${session.recipient_id}&occasion=${session.occasion}`)}
                              >
                                Resume Session
                              </Button>
                            )}

                            {feedback ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                ✅ Feedback: {REACTION_META[feedback.recipient_reaction || ""] || feedback.recipient_reaction}
                              </span>
                            ) : status === "completed" ? (
                              <Button variant="ghost" size="sm" onClick={() => setFeedbackSession(session)}>
                                Give Feedback
                                <Star className="ml-2 h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && aiResponse?.recommendations?.length ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-4 border-t border-border/60 pt-5">
                              <div className="text-sm font-semibold text-foreground">Your Recommendations</div>

                              {aiResponse.recommendations.map((recommendation, index) => {
                                const links = resolveStoreLinks(recommendation, session, stores);
                                const isSelected =
                                  session.selected_gift_name === recommendation.name ||
                                  session.selected_gift_index === index;
                                const signalHistory = signalChecksBySessionGift.get(`${session.id}:${recommendation.name}`) ?? [];
                                const latestSignalCheck = signalHistory[signalHistory.length - 1] ?? null;
                                const feedbackComparison =
                                  isSelected && feedback ? getSignalFeedbackComparison(latestSignalCheck, feedback) : null;

                                return (
                                  <div
                                    key={`${session.id}-${recommendation.name}-detail`}
                                    className={cn(
                                      "rounded-2xl border p-4",
                                      isSelected ? "border-emerald-300 bg-emerald-50" : "border-border bg-background",
                                    )}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-foreground">{recommendation.name}</span>
                                          {isSelected && (
                                            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white">
                                              Selected ✓
                                            </span>
                                          )}
                                        </div>
                                        <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", getConfidenceTone(recommendation.confidence_score))}>
                                          🎯 {recommendation.confidence_score}% confidence
                                        </span>
                                      </div>
                                      <span className="text-sm text-muted-foreground">
                                        $
                                        {recommendation.price_anchor.toLocaleString()}
                                      </span>
                                    </div>

                                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                      {recommendation.why_it_works}
                                    </p>

                                    {latestSignalCheck && (
                                      <div className="mt-4 space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-semibold text-foreground">Signal Check</span>
                                          <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                            Revision {latestSignalCheck.revision_number}
                                          </span>
                                          {signalHistory.length > 1 ? (
                                            <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                              {signalHistory.length} saved reads
                                            </span>
                                          ) : null}
                                          {feedbackComparison ? (
                                            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", feedbackComparison.className)}>
                                              {feedbackComparison.label}
                                            </span>
                                          ) : null}
                                        </div>

                                        <p className="text-sm font-medium text-foreground">
                                          {latestSignalCheck.result.overall_message}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          {latestSignalCheck.result.confidence_note}
                                        </p>

                                        {latestSignalCheck.result.adjustment_suggestions.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                              Tuning ideas
                                            </p>
                                            {latestSignalCheck.result.adjustment_suggestions.map((suggestion) => (
                                              <p key={suggestion} className="text-sm text-foreground">
                                                {suggestion}
                                              </p>
                                            ))}
                                          </div>
                                        )}

                                        {feedbackComparison ? (
                                          <p className="text-sm text-muted-foreground">{feedbackComparison.description}</p>
                                        ) : null}

                                        {signalHistory.some((entry) => entry.follow_up_prompt) ? (
                                          <div className="flex flex-wrap gap-2">
                                            {signalHistory
                                              .filter((entry) => entry.follow_up_prompt)
                                              .map((entry) => (
                                                <span
                                                  key={entry.id}
                                                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground"
                                                >
                                                  {entry.follow_up_prompt}
                                                </span>
                                              ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    )}

                                    {links.length > 0 && (
                                      <div className="mt-4 flex flex-wrap gap-2">
                                        {links.map((link) => (
                                          <button
                                            key={`${link.store_id}-${recommendation.name}`}
                                            type="button"
                                            onClick={() => {
                                              const url = getOutboundProductUrl(link);
                                              if (url) window.open(url, "_blank", "noopener,noreferrer");
                                            }}
                                            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white"
                                            style={{ backgroundColor: link.brand_color || "#6C5CE7" }}
                                          >
                                            {link.product_title ? `Shop ${link.product_title} on ${link.store_name}` : `Shop on ${link.store_name}`}
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {(aiResponse.occasion_insight || aiResponse.budget_assessment || aiResponse.cultural_note) && (
                                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
                                  <div className="mb-3 inline-flex items-center gap-2 font-semibold">
                                    <Target className="h-4 w-4 text-primary" />
                                    AI Insights
                                  </div>
                                  <div className="space-y-2">
                                    {aiResponse.occasion_insight && <p>{aiResponse.occasion_insight}</p>}
                                    {aiResponse.budget_assessment && <p>{aiResponse.budget_assessment}</p>}
                                    {aiResponse.cultural_note && <p>{aiResponse.cultural_note}</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}

        {!isLoading && filteredSessions.length > visibleCount && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setVisibleCount((count) => count + 12)}>
              Load More
            </Button>
          </div>
        )}
      </div>

      <FeedbackModal
        session={feedbackSession}
        existingFeedback={feedbackSession ? feedbackBySession.get(feedbackSession.id) ?? null : null}
        onClose={() => setFeedbackSession(null)}
        onSubmit={(rating, notes) => {
          if (!feedbackSession) return;
          feedbackMutation.mutate({
            sessionId: feedbackSession.id,
            rating,
            notes,
            existingFeedbackId: feedbackBySession.get(feedbackSession.id)?.id ?? null,
          });
        }}
        isSubmitting={feedbackMutation.isPending}
      />
    </DashboardLayout>
  );
}
