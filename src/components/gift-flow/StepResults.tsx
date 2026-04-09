import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RefreshCw, ArrowLeft, MessageCircle, Check, Loader2,
  Lock, ExternalLink, Info, AlertCircle, PartyPopper, Share2, Sparkles, Copy
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENCIES, SUPPORTED_COUNTRIES, detectUserCountry } from "./constants";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/posthog";
import type { GiftRecommendation, ProductLink, ProductResult, SignalCheckSignal, SignalCheckContext } from "@/hooks/useGiftSession";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface StepResultsProps {
  currency: string;
  recipientCountry?: string;
  recipientName?: string | null;
  occasion?: string;
  sessionId?: string | null;
  // Real AI data (from useGiftSession)
  isGenerating: boolean;
  isSearchingProducts: boolean;
  recommendations: GiftRecommendation[] | null;
  productResults: ProductResult[] | null;
  occasionInsight: string | null;
  budgetAssessment: string | null;
  culturalNote: string | null;
  error: string | null;
  regenerationCount: number;
  // Signal Check
  signalCheckResults: Record<string, SignalCheckSignal>;
  signalCheckLoading: string | null;
  signalCheckContext: SignalCheckContext | null;
  onSignalCheck: (gift: GiftRecommendation) => void;
  // Actions
  onRegenerate: () => void;
  onBack: () => void;
  onChoose: (gift: GiftRecommendation, index: number) => void;
  onTrackClick: (product: ProductLink) => void;
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const LOADING_MESSAGES = [
  "Reading the room...",
  "Checking cultural notes...",
  "Calibrating confidence...",
  "Finding the perfect match...",
  "Almost there...",
];

/* ─── Confidence badge ───────────────────────────────────────────────────────── */
const confidenceBadge = (score: number) => {
  if (score >= 90) return { label: `🎯 ${score}% — High Confidence`, className: "bg-success/10 text-success border-success/20" };
  if (score >= 75) return { label: `✓ ${score}% — Strong Match`, className: "bg-success/10 text-success border-success/20" };
  if (score >= 60) return { label: `⚡ ${score}% — Good Option`, className: "bg-warning/10 text-warning border-warning/20" };
  return { label: `🤔 ${score}% — Worth Considering`, className: "bg-[hsl(25,95%,53%)]/10 text-[hsl(25,95%,53%)] border-[hsl(25,95%,53%)]/20" };
};

/* ─── Loading skeleton ───────────────────────────────────────────────────────── */
function LoadingSkeleton({ msgIndex }: { msgIndex: number }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Finding your perfect picks ✨
        </h2>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span>{LOADING_MESSAGES[msgIndex]}</span>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border/50 overflow-hidden">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Error state ────────────────────────────────────────────────────────────── */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-5">
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold text-foreground mb-1">Something went wrong</h3>
            <p className="text-sm text-muted-foreground">
              {message || "Failed to generate recommendations. Please try again."}
            </p>
          </div>
          <Button variant="hero" onClick={onRetry}>
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Product store cards ─────────────────────────────────────────────────────── */
function ShopSection({
  giftResult,
  plan,
  onTrackClick,
  onUpgrade,
  isLoading,
}: {
  giftResult: ProductResult | undefined;
  plan: string;
  onTrackClick: (product: ProductLink) => void;
  onUpgrade: (reason: string) => void;
  isLoading: boolean;
}) {
  const products = giftResult?.products ?? [];
  const lockedStores = giftResult?.locked_stores ?? [];

  if (isLoading && products.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">🛒 Shop This Gift</p>
        <div className="flex gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-[120px] w-[160px] rounded-lg flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!isLoading && products.length === 0 && lockedStores.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">🛒 Shop This Gift</p>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {/* Accessible store cards */}
        {products.map((product) => (
          <div
            key={`${product.store_id}-${product.gift_name}`}
            className="flex-shrink-0 w-[180px] rounded-lg border border-border/50 bg-card p-4 flex flex-col items-center text-center relative hover:shadow-md transition-shadow min-h-[140px]"
          >
            {/* Store badge */}
            <div
              className="absolute top-2 right-2 text-[10px] font-semibold rounded-full px-2 py-0.5 text-white"
              style={{ backgroundColor: product.brand_color || "#FF9900" }}
            >
              {product.store_name}
            </div>

            {/* Store initial avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 mt-2"
              style={{
                backgroundColor: (product.brand_color || "#FF9900") + "20",
                color: product.brand_color || "#FF9900",
              }}
            >
              {product.store_name.charAt(0)}
            </div>

            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              Search "{product.gift_name}" on {product.store_name}
            </p>

            <button
              onClick={() => {
                onTrackClick(product);
                window.open(product.search_url, "_blank", "noopener,noreferrer");
              }}
              className="mt-auto w-full text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1 text-white"
              style={{ backgroundColor: product.brand_color || "#FF9900" }}
            >
              Browse <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Locked store placeholders */}
        {lockedStores.map((locked) => (
          <div
            key={locked.store_id}
            onClick={() =>
              onUpgrade(`Upgrade to ${locked.unlock_plan} to shop on ${locked.store_name} and more stores.`)
            }
            className="flex-shrink-0 w-[180px] rounded-lg border border-border/50 bg-muted/30 p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors min-h-[140px]"
          >
            <div
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 mb-2 opacity-50 text-white"
              style={{ backgroundColor: locked.brand_color || "#888" }}
            >
              {locked.store_name}
            </div>
            <Lock className="w-5 h-5 text-muted-foreground/40 mb-1" />
            <p className="text-xs text-muted-foreground/60">
              🔒 Unlock with {locked.unlock_plan}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Success/chosen state ────────────────────────────────────────────────────── */
function ChosenState({
  giftName,
  recipientName,
  occasion,
  onDashboard,
  onFindAnother,
}: {
  giftName: string;
  recipientName?: string | null;
  occasion?: string | null;
  onDashboard: () => void;
  onFindAnother: () => void;
}) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Fetch referral code for sharing
  const { data: referralCode } = useQuery({
    queryKey: ["referral-code", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("referral_code")
        .eq("id", user!.id)
        .single();
      return data?.referral_code;
    },
    enabled: !!user,
  });

  const shareLink = `https://giftmind.in/?ref=${referralCode || user?.id?.slice(0, 8)}`;
  
  const shareOnWhatsApp = () => {
    trackEvent('referral_shared', { channel: 'whatsapp' });
    const text = encodeURIComponent(
      `I found an amazing AI gifting tool! 🎁 It tells you exactly what to gift, why it works, and where to buy. Get 5 free credits (instead of 3): ${shareLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const copyReferralLink = () => {
    trackEvent('referral_shared', { channel: 'copy' });
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-6 text-center space-y-4">
          <PartyPopper className="w-12 h-12 text-success mx-auto" />
          <div>
            <h3 className="font-heading font-bold text-xl text-foreground mb-1">
              🎉 Great choice!
            </h3>
            <p className="text-sm text-muted-foreground">
              You selected <span className="font-medium text-foreground">{giftName}</span>
              {recipientName && occasion ? ` for ${recipientName}'s ${occasion}` : ""}.
              We've saved it to your gift history.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="hero" onClick={onDashboard} className="flex-1">
              Back to Dashboard
            </Button>
            <Button variant="outline" onClick={onFindAnother} className="flex-1">
              Find Another Gift
            </Button>
          </div>

          {/* Share section */}
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-left">
            <h4 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Share GiftMind with a friend
            </h4>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Give your friends <span className="font-semibold text-emerald-700">5 free credits</span> to try GiftMind. 
              You'll earn <span className="font-semibold text-emerald-700">3 bonus credits</span> when they complete their first gift session!
            </p>
            <div className="flex gap-2">
              <button
                onClick={shareOnWhatsApp}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium hover:bg-[#20bd5a] transition-colors"
                style={{ backgroundColor: "#25D366" }}
              >
                WhatsApp
              </button>
              <button
                onClick={copyReferralLink}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied! ✓' : 'Copy Link'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
const StepResults = ({
  currency,
  recipientCountry,
  recipientName,
  occasion,
  sessionId,
  isGenerating,
  isSearchingProducts,
  recommendations,
  productResults,
  occasionInsight,
  budgetAssessment,
  culturalNote,
  error,
  regenerationCount,
  signalCheckResults,
  signalCheckLoading,
  signalCheckContext,
  onSignalCheck,
  onRegenerate,
  onBack,
  onChoose,
  onTrackClick,
}: StepResultsProps) => {
  const navigate = useNavigate();
  const { plan, limits } = useUserPlan();
  const currSymbol = CURRENCIES.find((c) => c.value === currency)?.symbol || "₹";

  const [msgIndex, setMsgIndex] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [upgradeHighlight, setUpgradeHighlight] = useState<"starter" | "popular" | "pro">("popular");
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  // Auto-open upgrade modal when credits run out
  useEffect(() => {
    if (error === "NO_CREDITS") {
      setUpgradeReason("You've used all your credits. Upgrade to keep getting AI gift recommendations.");
      setUpgradeHighlight("popular");
      setUpgradeOpen(true);
    }
  }, [error]);

  const isCrossBorder = Boolean(recipientCountry && recipientCountry !== detectUserCountry());

  useEffect(() => {
    if (recommendations && !isGenerating && !error) {
      const avgScore = recommendations.reduce((acc, g) => acc + g.confidence_score, 0) / recommendations.length;
      trackEvent('gift_results_viewed', { 
        avg_confidence: Math.round(avgScore),
        occasion: occasionInsight,
        is_cross_border: isCrossBorder 
      });
    }
  }, [recommendations, isGenerating, error, occasionInsight, isCrossBorder]);

  // Rotate loading messages
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const atRegenLimit = regenerationCount >= limits.regenerations;

  const recipientCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);

  const openStoreUpgrade = (reason: string) => {
    setUpgradeReason(reason);
    setUpgradeHighlight(plan === "free" ? "starter" : "popular");
    setUpgradeOpen(true);
  };

  const handleChoose = (gift: GiftRecommendation, index: number) => {
    setChosenIndex(index);
    onChoose(gift, index);
  };

  const handleRegenerate = () => {
    if (atRegenLimit) {
      setUpgradeReason(
        `You've used all ${limits.regenerations} regeneration${limits.regenerations === 1 ? "" : "s"} for this session. Upgrade for more.`
      );
      setUpgradeHighlight(plan === "free" ? "popular" : plan === "starter" ? "popular" : "pro");
      setUpgradeOpen(true);
      return;
    }
    onRegenerate();
  };

  // ── Chosen state ──
  if (chosenIndex !== null && recommendations?.[chosenIndex]) {
    return (
      <ChosenState
        giftName={recommendations[chosenIndex].name}
        recipientName={recipientName}
        occasion={occasion}
        onDashboard={() => navigate("/dashboard")}
        onFindAnother={() => navigate("/gift-flow")}
      />
    );
  }

  // ── Loading state ──
  if (isGenerating || (!recommendations && !error)) {
    return <LoadingSkeleton msgIndex={msgIndex} />;
  }

  // ── Error state ──
  if (error && !recommendations) {
    return <ErrorState message={error} onRetry={onRegenerate} />;
  }

  // ── Results ──
  const gifts = recommendations ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Your confident picks ✨
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          3 personalized recommendations, ranked by confidence
        </p>
      </div>

      {/* Cross-border banner */}
      {isCrossBorder && recipientCountryObj && (
        <div className="bg-[hsl(210,100%,95%)] border border-[hsl(210,100%,85%)] rounded-lg px-4 py-2.5 text-[13px] text-[hsl(210,60%,40%)]">
          🌍 Showing stores that deliver to {recipientCountryObj.name} {recipientCountryObj.flag}
        </div>
      )}

      {/* Gift cards */}
      <div className="space-y-6">
        {gifts.map((gift, index) => {
          const badge = confidenceBadge(gift.confidence_score);
          const productResult = productResults?.find((r) => r.gift_name === gift.name);

          return (
            <Card key={index} className="border-border/50 overflow-hidden">
              <CardContent className="p-5 space-y-4">
                {/* Header: name + confidence */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading font-semibold text-foreground text-lg">
                    {gift.name}
                  </h3>
                  <Badge variant="outline" className={cn("shrink-0", badge.className)}>
                    {badge.label}
                  </Badge>
                </div>

                {/* Why it works */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {gift.why_it_works}
                </p>

                {/* Price + Tip */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">
                    {currSymbol}{gift.price_anchor.toLocaleString()}
                    <span className="font-normal text-muted-foreground text-xs ml-1">est.</span>
                  </span>

                  {/* What not to do tip */}
                  {gift.what_not_to_do && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                          <Info className="w-3 h-3 mr-1" /> Tip
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-xs text-sm text-muted-foreground">
                        ⚠️ {gift.what_not_to_do}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* ─── Signal Check Section ─── */}
                <div>
                  {!limits.hasSignalCheck ? (
                    /* LOCKED STATE — Free and Starter plans */
                    <button
                      onClick={() => {
                        setUpgradeReason("Unlock Signal Check to understand what your gift communicates about your relationship.");
                        setUpgradeHighlight("popular");
                        setUpgradeOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <Lock className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-muted-foreground">
                          What does this gift say?
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          <span className="blur-sm select-none">
                            {gift.signal_interpretation?.substring(0, 60) ||
                              "This gift communicates that you pay attention to..."}
                          </span>
                        </p>
                      </div>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap shrink-0 font-medium">
                        Unlock with Popular
                      </span>
                    </button>
                  ) : signalCheckLoading === gift.name ? (
                    /* LOADING STATE */
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5"
                    >
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      <span className="text-sm text-primary/80">
                        Analyzing what this gift communicates...
                      </span>
                    </button>
                  ) : signalCheckResults[gift.name] ? (
                    /* RESULT STATE — Signal check data loaded */
                    <div className="px-4 py-4 rounded-lg border border-primary/20 bg-primary/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <h4 className="text-sm font-semibold text-primary">
                          What this gift communicates
                        </h4>
                        <span className="text-xs bg-primary/10 text-primary/80 px-2 py-0.5 rounded-full">
                          Signal Check
                        </span>
                      </div>

                      {/* Overall message */}
                      <p className="text-sm text-foreground/80 mb-3 leading-relaxed italic">
                        "{signalCheckResults[gift.name].overall_message}"
                      </p>

                      {/* Positive signals */}
                      <div className="mb-2">
                        <p className="text-xs font-medium text-success mb-1">
                          ✅ Positive signals:
                        </p>
                        <ul className="space-y-1">
                          {signalCheckResults[gift.name].positive_signals.map(
                            (signal: string, i: number) => (
                              <li
                                key={i}
                                className="text-xs text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-success"
                              >
                                {signal}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      {/* Potential risks (if any) */}
                      {signalCheckResults[gift.name].potential_risks?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-warning mb-1">
                            ⚠️ Watch out for:
                          </p>
                          <ul className="space-y-1">
                            {signalCheckResults[gift.name].potential_risks.map(
                              (risk: string, i: number) => (
                                <li
                                  key={i}
                                  className="text-xs text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-warning"
                                >
                                  {risk}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {/* Confidence note */}
                      <p className="text-xs text-primary/70 mt-2 pt-2 border-t border-primary/10">
                        {signalCheckResults[gift.name].confidence_note}
                      </p>

                      {/* Credits note */}
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        0.5 credits used for this Signal Check
                      </p>
                    </div>
                  ) : (
                    /* DEFAULT STATE — Can use Signal Check, hasn't clicked yet */
                    <button
                      onClick={() => onSignalCheck(gift)}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-primary/20 bg-card hover:bg-primary/5 transition-colors group"
                    >
                      <Sparkles className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors" />
                      <span className="text-sm text-primary font-medium">
                        What does this gift say?
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        0.5 credits
                      </span>
                    </button>
                  )}
                </div>

                {/* Product store cards */}
                <ShopSection
                  giftResult={productResult}
                  plan={plan}
                  onTrackClick={onTrackClick}
                  onUpgrade={openStoreUpgrade}
                  isLoading={isSearchingProducts}
                />

                {/* Choose button */}
                <Button
                  variant="hero"
                  size="sm"
                  className="w-full"
                  onClick={() => handleChoose(gift, index)}
                >
                  <Check className="w-4 h-4 mr-1" /> I'm choosing this one! ✓
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* AI insights */}
      {(occasionInsight || budgetAssessment || culturalNote) && (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-4">
          <p className="text-xs font-medium text-foreground uppercase tracking-wide">AI Insights</p>
          {occasionInsight && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Occasion: </span>{occasionInsight}
            </p>
          )}
          {budgetAssessment && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Budget: </span>{budgetAssessment}
            </p>
          )}
          {culturalNote && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Cultural note: </span>{culturalNote}
            </p>
          )}
        </div>
      )}

      {/* Affiliate disclaimer */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Prices may vary. GiftMind may earn a small commission on purchases — at no extra cost to you.
        </span>
      </p>
      <p className="text-xs text-muted-foreground text-center">
        Results powered by AI — suggestions are personalized, not sponsored.
      </p>

      {/* Regen + Back */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <div className="w-full sm:w-auto space-y-1">
          <Button
            variant="outline"
            onClick={handleRegenerate}
            className="w-full sm:w-auto"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating...</>
            ) : atRegenLimit ? (
              <><Lock className="w-3 h-3 mr-1" /> Regenerations used</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-1" /> Not quite right? Try again</>
            )}
          </Button>
          {limits.regenerations !== Infinity && (
            <p className="text-[10px] text-muted-foreground text-center sm:text-left">
              {regenerationCount}/{limits.regenerations} regenerations used
            </p>
          )}
        </div>
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={upgradeHighlight}
        reason={upgradeReason}
      />
    </div>
  );
};

export default StepResults;
