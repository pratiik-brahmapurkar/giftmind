import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CalendarPlus, CheckCircle2, Copy, Loader2, PartyPopper, RefreshCw, RotateCcw, Share2, ShoppingCart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { calculateFeedbackReminderAt } from "@/hooks/giftSessionShared";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import type { Recipient, useGiftSession } from "@/hooks/useGiftSession";
import { getOutboundProductUrl } from "@/lib/productLinks";
import { trackEvent } from "@/lib/posthog";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import NoCreditGate from "./NoCreditGate";
import GiftCard from "./GiftCard";

const loadingMessages = [
  "Reading the room...",
  "Checking cultural notes...",
  "Calibrating confidence...",
  "Finding the perfect match...",
  "Almost there...",
];

const NODE_ORDER = [
  "recipient_analyzer",
  "cultural_context_retriever",
  "past_gift_retriever",
  "gift_generator",
  "budget_enforcer",
  "personalization_validator",
  "response_formatter",
] as const;

const NODE_LABELS: Record<string, { label: string; description: string }> = {
  recipient_analyzer: {
    label: "Reading the recipient",
    description: "Extracting relationship, interests, and useful context.",
  },
  cultural_context_retriever: {
    label: "Checking cultural fit",
    description: "Applying cultural rules and regional considerations.",
  },
  past_gift_retriever: {
    label: "Looking at gift history",
    description: "Avoiding repeats and near-duplicate ideas.",
  },
  gift_generator: {
    label: "Generating ideas",
    description: "Drafting tailored gift recommendations.",
  },
  budget_enforcer: {
    label: "Filtering by budget",
    description: "Removing options outside the exact range.",
  },
  personalization_validator: {
    label: "Re-ranking for fit",
    description: "Scoring and refining the most personal options.",
  },
  response_formatter: {
    label: "Finalizing results",
    description: "Preparing your ranked recommendations and insights.",
  },
};

interface StepResultsProps {
  giftSession: ReturnType<typeof useGiftSession>;
  selectedRecipient: Recipient;
  selectedOccasion: string;
  currency: string;
  recipientCountry: string | null;
  userPlan: string;
  onRegenerateParams: {
    recipient: Recipient;
    occasion: string;
    occasionDate: string | null;
    budgetMin: number;
    budgetMax: number;
    currency: string;
    recipientCountry: string | null;
    userCountry: string;
    specialContext: string;
    contextTags: string[];
    userPlan: string;
  };
  onCreditsChanged: () => void;
  onStartOver: () => void;
  viewOnly?: boolean;
}

/* ─── Staggered skeleton loading state (Item 14, Animation guidance) ─── */
function LoadingState({
  messageIndex,
  currentNode,
  nodesCompleted,
}: {
  messageIndex: number;
  currentNode: string | null;
  nodesCompleted: string[];
}) {
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const activeNode = currentNode ? NODE_LABELS[currentNode] : null;
  const progressValue = Math.max(
    8,
    Math.min(96, Math.round((nodesCompleted.length / NODE_ORDER.length) * 100)),
  );

  useEffect(() => {
    setShowSlowWarning(false);
    const timeout = window.setTimeout(() => setShowSlowWarning(true), 15000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="py-12 flex flex-col items-center max-w-lg mx-auto space-y-12">
      <div className="text-center space-y-4">
        <motion.div 
          animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }} 
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto w-20 h-20 rounded-full bg-[#E4C663]/10 flex items-center justify-center border-[1.5px] border-[#D4A04A]/30 mb-6 shadow-xl shadow-[#D4A04A]/10"
        >
          <Sparkles className="w-10 h-10 text-[#D4A04A]" strokeWidth={1.5} />
        </motion.div>
        <h2 className="text-2xl font-bold font-heading text-foreground">
          {activeNode?.label ?? "Synthesizing options"}
        </h2>
        <p className="text-muted-foreground">
          {activeNode?.description ?? "Getting everything ready for you..."}
        </p>
        <p className="text-sm text-muted-foreground">{loadingMessages[messageIndex]}</p>
        <Progress value={progressValue} className="h-1.5 w-64 mx-auto bg-muted mt-6 [&>div]:bg-[#D4A04A]" />
        {showSlowWarning ? (
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            Taking longer than usual. If this fails, your credit will be refunded automatically.
          </div>
        ) : null}
      </div>

      <div className="w-full space-y-3">
        {NODE_ORDER.map((node, i) => {
          const isDone = nodesCompleted.includes(node);
          const isActive = currentNode === node;

          return (
            <motion.div
              key={node}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-4 rounded-xl border-[1.5px] p-4 transition-all duration-500 overflow-hidden ${
                isActive 
                  ? "border-[#D4A04A] bg-[#D4A04A]/5 shadow-md scale-[1.02]" 
                  : isDone
                  ? "border-border/40 bg-background/80"
                  : "border-border/20 bg-background/40 opacity-50"
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                isActive ? "bg-[#D4A04A] text-white shadow-lg shadow-[#D4A04A]/20" : isDone ? "bg-[#3E8E7E]/10 text-[#3E8E7E]" : "bg-muted text-muted-foreground"
              }`}>
                {isDone ? <CheckCircle2 className="w-5 h-5" strokeWidth={2} /> : isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-current" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? "text-[#6F5326]" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                  {NODE_LABELS[node].label}
                </p>
                <AnimatePresence>
                  {isActive && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: "auto" }} 
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-[#6F5326]/80 mt-1 truncate"
                    >
                      {NODE_LABELS[node].description}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorState({
  icon,
  title,
  message,
  actionLabel,
  onRetry,
}: {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-6 text-center">
        <div className="space-y-2">
          <div className="text-5xl">{icon}</div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button type="button" variant="hero" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {actionLabel || "Try Again"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Success state with completion loop (Item E) ─── */
function SuccessState({
  selectedGiftName,
  confidenceScore,
  recipientName,
  recipientId,
  sessionId,
  occasion,
  occasionDate,
  buyUrl,
  storeName,
  onBuy,
}: {
  selectedGiftName: string;
  confidenceScore: number | null;
  recipientName: string;
  recipientId: string | null;
  sessionId: string;
  occasion: string;
  occasionDate: string | null;
  buyUrl?: string | null;
  storeName?: string | null;
  onBuy?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [reminderSaved, setReminderSaved] = useState(false);

  const { data: referralCode } = useQuery({
    queryKey: ["gift-flow-referral-code", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("referral_code").eq("id", user!.id).single();
      return data?.referral_code ?? user?.id?.slice(0, 8) ?? "";
    },
    enabled: !!user,
  });

  const shareUrl = useMemo(() => `https://giftmind.in/?ref=${referralCode ?? ""}`, [referralCode]);

  const handleSaveReminder = async () => {
    if (!user || !sessionId) return;

    const { error } = await supabase
      .from("feedback_reminders")
      .upsert({
        user_id: user.id,
        session_id: sessionId,
        recipient_id: recipientId,
        occasion,
        occasion_date: occasionDate,
        remind_at: calculateFeedbackReminderAt(occasionDate),
        status: "pending",
      }, { onConflict: "session_id" });

    if (error) {
      toast.error("Could not save the reminder. Please try again.");
      return;
    }

    setReminderSaved(true);
    toast.success(`We'll remind you about ${occasion} for ${recipientName} next year!`);
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50">
      <CardContent className="space-y-5 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <PartyPopper className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Great choice!</h2>
          <p className="text-sm text-muted-foreground">
            You picked <span className="font-medium text-foreground">{selectedGiftName}</span>
            {confidenceScore != null ? ` with ${confidenceScore}% confidence.` : "."}
          </p>
        </div>

        {buyUrl ? (
          <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 text-left">
            <p className="mb-3 text-sm font-medium text-foreground">Ready to buy?</p>
            <Button type="button" variant="hero" className="w-full" onClick={onBuy}>
              <ShoppingCart className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Buy on {storeName ?? "Amazon"}
            </Button>
          </div>
        ) : null}

        {/* Completion loop — Save for next year (Item E) */}
        {!reminderSaved && (
          <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CalendarPlus className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Save this for next year?</p>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll remind you about {occasion} for {recipientName} next year.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" variant="hero" className="flex-1" onClick={handleSaveReminder}>
                Save reminder
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setReminderSaved(true)}>
                No thanks
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 text-left">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Share2 className="h-4 w-4" />
            Share GiftMind
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              className="flex-1 bg-[#25D366] text-white hover:bg-[#1ea952]"
              onClick={() => {
                const text = encodeURIComponent(
                  `I found an amazing AI gifting tool! 🎁 Get 5 free credits: ${shareUrl}`,
                );
                window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
              }}
            >
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy Link"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="hero" className="flex-1" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/gift-flow")}>
            Find Another Gift
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StepResults({
  giftSession,
  selectedRecipient,
  selectedOccasion,
  currency,
  recipientCountry,
  userPlan,
  onRegenerateParams,
  onCreditsChanged,
  onStartOver,
  viewOnly = false,
}: StepResultsProps) {
  const planLimits = usePlanLimits();
  const [messageIndex, setMessageIndex] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const resultsViewedRef = useRef(false);
  const enteredAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!giftSession.isGenerating) {
      // If we were regenerating and generation stopped, show toast
      if (isRegenerating) {
        setIsRegenerating(false);
        if (!giftSession.error) {
          toast.success("New recommendations ready!");
        }
      }
      return;
    }
    const interval = window.setInterval(() => {
      setMessageIndex((value) => (value + 1) % loadingMessages.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [giftSession.isGenerating, giftSession.error, isRegenerating]);

  useEffect(() => {
    if (giftSession.isGenerating) {
      resultsViewedRef.current = false;
    }
  }, [giftSession.isGenerating]);

  useEffect(() => {
    if (giftSession.isGenerating || giftSession.error || !giftSession.recommendations || resultsViewedRef.current) {
      return;
    }

    resultsViewedRef.current = true;
    enteredAtRef.current = Date.now();
    trackEvent("results_viewed", {
      session_id: giftSession.sessionId,
      provider: giftSession.aiProviderUsed,
      latency_ms: giftSession.aiLatencyMs,
      rec_count: giftSession.recommendations.length,
    });
  }, [
    giftSession.aiLatencyMs,
    giftSession.aiProviderUsed,
    giftSession.error,
    giftSession.isGenerating,
    giftSession.recommendations,
    giftSession.sessionId,
  ]);

  if (giftSession.isGenerating || (!giftSession.recommendations && !giftSession.error)) {
    return (
      <LoadingState
        messageIndex={messageIndex}
        currentNode={giftSession.currentNode}
        nodesCompleted={giftSession.nodesCompleted}
      />
    );
  }

  if (giftSession.errorType === "NO_CREDITS") {
    return <NoCreditGate />;
  }

  if (giftSession.error && !giftSession.recommendations) {
    if (giftSession.errorType === "AI_PARSE_ERROR" || giftSession.errorType === "AI_ERROR") {
      return (
        <ErrorState
          icon="🤔"
          title="AI had trouble with this one"
          message={giftSession.error}
          actionLabel="Try Again"
          onRetry={() => {
            void giftSession.generateGifts(onRegenerateParams);
          }}
        />
      );
    }

    if (giftSession.errorType === "RATE_LIMITED") {
      return (
        <ErrorState
          icon="⏰"
          title="Too many requests"
          message="You've hit the rate limit. Please wait a minute and try again."
          actionLabel="Try Again"
          onRetry={() => {
            void giftSession.generateGifts(onRegenerateParams);
          }}
        />
      );
    }

    return (
      <ErrorState
        icon="⚠️"
        title="Something went wrong"
        message={giftSession.error}
        onRetry={() => {
          void giftSession.generateGifts(onRegenerateParams);
        }}
      />
    );
  }

  if (giftSession.isComplete) {
    const selectedGift =
      giftSession.selectedGiftIndex != null ? giftSession.recommendations?.[giftSession.selectedGiftIndex] : null;
    const selectedGiftProduct =
      giftSession.productResults?.find((result) => result.gift_name === selectedGift?.name)?.products?.[0] ?? null;
    const amazonDomain =
      recipientCountry === "IN"
        ? "amazon.in"
        : recipientCountry === "GB"
          ? "amazon.co.uk"
          : recipientCountry === "AE"
            ? "amazon.ae"
            : "amazon.com";
    const buyUrl =
      (selectedGiftProduct ? getOutboundProductUrl(selectedGiftProduct) : null)
      || (selectedGift?.search_keywords?.[0]
        ? `https://${amazonDomain}/s?k=${encodeURIComponent(selectedGift.search_keywords[0])}`
        : null)
      || null;

    return (
      <SuccessState
        selectedGiftName={selectedGift?.name ?? "your gift"}
        confidenceScore={selectedGift?.confidence_score ?? null}
        recipientName={selectedRecipient.name}
        recipientId={selectedRecipient.id}
        sessionId={giftSession.sessionId ?? ""}
        occasion={selectedOccasion}
        occasionDate={onRegenerateParams.occasionDate}
        buyUrl={buyUrl}
        storeName={selectedGiftProduct?.store_name ?? amazonDomain}
        onBuy={() => {
          if (!selectedGift) return;
          trackEvent("results_buy_link_clicked_post_selection", {
            store_name: selectedGiftProduct?.store_name ?? amazonDomain,
            session_id: giftSession.sessionId,
          });
          void giftSession.trackProductClick({
            ...(selectedGiftProduct ?? {
              gift_name: selectedGift.name,
              store_id: "amazon",
              store_name: amazonDomain,
              domain: amazonDomain,
              brand_color: "#111827",
              product_category: selectedGift.product_category,
              is_search_link: true,
              search_url: buyUrl,
            }),
            recommendationIndex: giftSession.selectedGiftIndex ?? 0,
            recommendationConfidence: selectedGift.confidence_score,
            recipientId: selectedRecipient.id,
            recipientCountry: recipientCountry || onRegenerateParams.userCountry,
            clickedFrom: "success_screen",
          });
        }}
      />
    );
  }

  // Sort recommendations by confidence descending (Item 13)
  const recommendations = [...(giftSession.recommendations ?? [])]
    .map((gift, originalIndex) => ({ gift, originalIndex }))
    .sort((a, b) => b.gift.confidence_score - a.gift.confidence_score);
  const allLowConfidence = recommendations.length > 0 && recommendations.every(({ gift }) => gift.confidence_score < 75);
  const timeOnScreenMs = enteredAtRef.current ? Date.now() - enteredAtRef.current : 0;

  const handleRegenerate = () => {
    if (!planLimits.canRegenerate(giftSession.regenerationCount)) {
      trackEvent("regenerate_limit_hit", {
        regen_count: giftSession.regenerationCount,
        plan: userPlan,
      });
      setUpgradeOpen(true);
      return;
    }
    trackEvent("regenerate_clicked", {
      regen_count: giftSession.regenerationCount,
      plan: userPlan,
      time_on_screen_ms: timeOnScreenMs,
    });
    setIsRegenerating(true);
    toast.info("Generating new ideas…");
    void giftSession.regenerate(onRegenerateParams);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Your AI gift recommendations</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Ranked options for {selectedRecipient.name}, tuned for {selectedOccasion}.
          </p>
          {viewOnly ? (
            <div className="inline-flex items-center rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              View Only
            </div>
          ) : null}
        </div>

        {giftSession.warningMessage ? (
          <Card className="border-amber-300 bg-amber-50/80">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900">Limited results in this exact budget</p>
                <p className="text-sm text-amber-800">{giftSession.warningMessage}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {allLowConfidence ? (
          <Card className="border-amber-300 bg-amber-50/70">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" strokeWidth={1.5} />
              <p className="text-sm text-amber-900">
                These are decent starting points, but the AI wasn&apos;t highly confident.
                Try adding more context or regenerating for fresher ideas.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-5">
          {recommendations.map(({ gift, originalIndex }, index) => (
            <GiftCard
              key={`${gift.name}-${originalIndex}`}
              gift={gift}
              index={index}
              products={giftSession.productResults?.find((result) => result.gift_name === gift.name) ?? null}
              isSearchingProducts={giftSession.isSearchingProducts}
              sessionId={giftSession.sessionId ?? ""}
              recipientCountry={recipientCountry}
              userPlan={userPlan}
              recipient={selectedRecipient}
              occasion={selectedOccasion}
              occasionDate={onRegenerateParams.occasionDate}
              currency={currency}
              budgetMin={onRegenerateParams.budgetMin}
              budgetMax={onRegenerateParams.budgetMax}
              canUseSignalCheck={planLimits.canUseSignalCheck()}
              isBestMatch={index === 0}
              onCreditsChanged={onCreditsChanged}
              viewOnly={viewOnly}
              onSelect={(_giftIndex, giftName, options) => {
                trackEvent("gift_selected", {
                  rec_index: originalIndex,
                  confidence: gift.confidence_score,
                  has_note: Boolean(options?.note?.trim()),
                  reminder_set: Boolean(options?.createReminder),
                  time_on_screen_ms: timeOnScreenMs,
                });
                void giftSession.selectGift(originalIndex, giftName, options).then(() => {
                  toast.success("Gift selection saved!");
                });
              }}
              onTrackClick={(product) => {
                trackEvent("buy_link_clicked", {
                  rec_index: originalIndex,
                  store_name: product.store_name,
                  country: recipientCountry || onRegenerateParams.userCountry,
                  confidence: gift.confidence_score,
                  is_search_link: Boolean(product.is_search_link),
                });
                void giftSession.trackProductClick({
                  ...product,
                  recommendationIndex: originalIndex,
                  recommendationConfidence: gift.confidence_score,
                  recipientId: selectedRecipient.id,
                  recipientCountry: recipientCountry || onRegenerateParams.userCountry,
                  clickedFrom: "results_screen",
                });
              }}
              onLockedStoreClick={(storeName, unlockPlan) => {
                trackEvent("buy_link_locked_clicked", {
                  rec_index: originalIndex,
                  store_name: storeName,
                  unlock_plan: unlockPlan,
                });
              }}
            />
          ))}
        </div>

        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI insights</h2>
            {giftSession.avgPersonalizationScore != null ? (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Personalization score: {Math.round(giftSession.avgPersonalizationScore)}/100
              </div>
            ) : null}
            {giftSession.occasionInsight && <p className="text-sm text-foreground">{giftSession.occasionInsight}</p>}
            {giftSession.budgetAssessment && <p className="text-sm text-foreground">{giftSession.budgetAssessment}</p>}
            {giftSession.culturalNote && <p className="text-sm text-foreground">{giftSession.culturalNote}</p>}
            {import.meta.env.DEV && giftSession.aiProviderUsed ? (
              <div className="space-y-1 text-center text-xs text-gray-400">
                <div>
                  AI: {giftSession.aiProviderUsed} ({giftSession.aiLatencyMs ?? "?"}ms, attempt {giftSession.aiAttempt ?? "?"})
                </div>
                {giftSession.engineVersion ? <div>Engine: {giftSession.engineVersion}</div> : null}
                {giftSession.nodeTimings ? (
                  <div>
                    Nodes: {Object.entries(giftSession.nodeTimings).map(([node, ms]) => `${node} ${ms}ms`).join(" | ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!viewOnly ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={handleRegenerate}
              disabled={giftSession.isGenerating || isRegenerating}
            >
              {isRegenerating || giftSession.isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating new ideas…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate ({giftSession.regenerationCount}/{planLimits.maxRegenerations === -1 ? "∞" : planLimits.maxRegenerations} free)
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => {
                trackEvent("start_over_clicked", {
                  time_on_screen_ms: timeOnScreenMs,
                });
                onStartOver();
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Start Over
            </Button>
          </div>
        ) : null}
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={planLimits.getUpgradePlan("more_regenerations")}
        reason={planLimits.getUpgradeText("more_regenerations")}
      />
    </>
  );
}
