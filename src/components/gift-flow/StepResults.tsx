import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2, PartyPopper, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import type { Recipient, useGiftSession } from "@/hooks/useGiftSession";
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
}

function LoadingState({ messageIndex }: { messageIndex: number }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {loadingMessages[messageIndex]}
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="border-border/60">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="space-y-4 p-6 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button type="button" variant="hero" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

function SuccessState({
  selectedGiftName,
  confidenceScore,
}: {
  selectedGiftName: string;
  confidenceScore: number | null;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: referralCode } = useQuery({
    queryKey: ["gift-flow-referral-code", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("referral_code").eq("id", user!.id).single();
      return data?.referral_code ?? user?.id?.slice(0, 8) ?? "";
    },
    enabled: !!user,
  });

  const shareUrl = useMemo(() => `https://giftmind.in/?ref=${referralCode ?? ""}`, [referralCode]);

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
                  `I found a gift faster with GiftMind. Try it here: ${shareUrl}`,
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
}: StepResultsProps) {
  const planLimits = usePlanLimits();
  const [messageIndex, setMessageIndex] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!giftSession.isGenerating) return;
    const interval = window.setInterval(() => {
      setMessageIndex((value) => (value + 1) % loadingMessages.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [giftSession.isGenerating]);

  if (giftSession.isGenerating || (!giftSession.recommendations && !giftSession.error)) {
    return <LoadingState messageIndex={messageIndex} />;
  }

  if (giftSession.errorType === "NO_CREDITS") {
    return <NoCreditGate />;
  }

  if (giftSession.error && giftSession.errorType !== "NO_CREDITS" && !giftSession.recommendations) {
    return (
      <ErrorState
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

    return (
      <SuccessState
        selectedGiftName={selectedGift?.name ?? "your gift"}
        confidenceScore={selectedGift?.confidence_score ?? null}
      />
    );
  }

  const recommendations = giftSession.recommendations ?? [];

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Your AI gift recommendations</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Ranked options for {selectedRecipient.name}, tuned for {selectedOccasion}.
          </p>
        </div>

        <div className="space-y-5">
          {recommendations.map((gift, index) => (
            <GiftCard
              key={`${gift.name}-${index}`}
              gift={gift}
              index={index}
              products={giftSession.productResults?.find((result) => result.gift_name === gift.name) ?? null}
              isSearchingProducts={giftSession.isSearchingProducts}
              sessionId={giftSession.sessionId ?? ""}
              recipientCountry={recipientCountry}
              userPlan={userPlan}
              recipient={selectedRecipient}
              occasion={selectedOccasion}
              currency={currency}
              canUseSignalCheck={planLimits.canUseSignalCheck()}
              onCreditsChanged={onCreditsChanged}
              onSelect={(giftIndex, giftName) => {
                void giftSession.selectGift(giftIndex, giftName);
              }}
              onTrackClick={(product) => {
                void giftSession.trackProductClick(product);
              }}
            />
          ))}
        </div>

        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI insights</h2>
            {giftSession.occasionInsight && <p className="text-sm text-foreground">{giftSession.occasionInsight}</p>}
            {giftSession.budgetAssessment && <p className="text-sm text-foreground">{giftSession.budgetAssessment}</p>}
            {giftSession.culturalNote && <p className="text-sm text-foreground">{giftSession.culturalNote}</p>}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full"
            onClick={() => {
              if (!planLimits.canRegenerate(giftSession.regenerationCount)) {
                setUpgradeOpen(true);
                return;
              }
              void giftSession.regenerate(onRegenerateParams);
            }}
            disabled={giftSession.isGenerating}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate ideas
            <span className="ml-2 text-xs text-muted-foreground">
              {giftSession.regenerationCount}/{planLimits.maxRegenerations === -1 ? "∞" : planLimits.maxRegenerations}
            </span>
          </Button>
        </div>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={planLimits.getUpgradePlan("more_regenerations")}
        reason="You have reached this plan's regeneration limit."
      />
    </>
  );
}
