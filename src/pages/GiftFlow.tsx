import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { detectUserCountry } from "@/lib/geoConfig";
import { useGiftSession, type Recipient } from "@/hooks/useGiftSession";
import { normalizePlan, type PlanKey } from "@/lib/plans";
import { usePublicPlatformSettings } from "@/hooks/usePlatformSettings";
import { formatCreditsValue } from "@/lib/credits";
import { trackEvent } from "@/lib/posthog";
import StepBudget from "@/components/gift-flow/StepBudget";
import StepContext from "@/components/gift-flow/StepContext";
import StepOccasion from "@/components/gift-flow/StepOccasion";
import StepProgress from "@/components/gift-flow/StepProgress";
import StepRecipient from "@/components/gift-flow/StepRecipient";
import StepResults from "@/components/gift-flow/StepResults";

/* ─── Easing curves (Animation guidance) ─── */
const FORWARD_EASE = [0.22, 1, 0.36, 1] as const;
const BACKWARD_EASE = [0.55, 0, 1, 0.45] as const;
type GiftSessionRecord = Tables<"gift_sessions">;

function parseBooleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function parseNumberSetting(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default function GiftFlow() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const giftSession = useGiftSession();
  const hydrateSession = giftSession.hydrateSession;
  const generateGifts = giftSession.generateGifts;
  const sessionId = giftSession.sessionId;
  const isGenerating = giftSession.isGenerating;
  const publicSettingKeys = useMemo(() => ["feature_signal_check", "signal_check_units", "gift_generation_units"], []);
  const { settings: publicSettings } = usePublicPlatformSettings(publicSettingKeys);

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [recipientCountry, setRecipientCountry] = useState<string | null>(null);
  const [isCrossBorder, setIsCrossBorder] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [occasionDate, setOccasionDate] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState<number | null>(null);
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const currency = "USD";
  const [specialContext, setSpecialContext] = useState("");
  const [contextTags, setContextTags] = useState<string[]>([]);
  const [userPlan, setUserPlan] = useState<PlanKey>("spark");
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [userCountry, setUserCountry] = useState(detectUserCountry());
  const [isCheckingCredits, setIsCheckingCredits] = useState(true);

  // New state for redesign features
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);

  const hasGeneratedRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const hydratedSessionParamRef = useRef<string | null>(null);
  const startTrackedRef = useRef(false);
  const featureSignalCheck = parseBooleanSetting(publicSettings.feature_signal_check, true);
  const signalCheckUnits = parseNumberSetting(publicSettings.signal_check_units, 1);
  const giftGenerationUnits = parseNumberSetting(publicSettings.gift_generation_units, 2);
  const signalCheckCost = signalCheckUnits / 2;
  const canUseSignalCheck = featureSignalCheck;

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setCreditsBalance(0);
      setUserPlan("spark");
      setUserCountry(detectUserCountry());
      setIsCheckingCredits(false);
      return;
    }

    setIsCheckingCredits(true);

    const { data } = await supabase
      .from("users")
      .select("credits_balance, active_plan, country")
      .eq("id", user.id)
      .single();

    setCreditsBalance(data?.credits_balance ?? 0);
    setUserPlan(normalizePlan(data?.active_plan));
    setUserCountry(data?.country || detectUserCountry());
    setIsCheckingCredits(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refreshProfile();
  }, [authLoading, refreshProfile]);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  // First-time detection (Item 3)
  useEffect(() => {
    if (!user || authLoading) return;

    async function checkFirstTime() {
      const { count } = await supabase
        .from("gift_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "completed");

      setIsFirstTime((count ?? 0) === 0);
    }

    void checkFirstTime();
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || authLoading) return;
    if (startTrackedRef.current) return;

    startTrackedRef.current = true;

    const source = searchParams.get("source");
    trackEvent("gift_flow_started", {
      entry_source: source || (searchParams.get("recipient") ? "recipient_prefill" : "direct"),
      has_prefill: Boolean(
        searchParams.get("recipient")
        || searchParams.get("occasion")
        || searchParams.get("budget_min")
        || searchParams.get("budget_max")
        || searchParams.get("context"),
      ),
      plan: userPlan,
    });
  }, [authLoading, searchParams, user, userPlan]);

  // Query param preloading + session resume
  useEffect(() => {
    if (!user) return;

    const recipientId = searchParams.get("recipient");
    const occasion = searchParams.get("occasion");
    const budgetMinParam = searchParams.get("budget_min");
    const budgetMaxParam = searchParams.get("budget_max");
    const contextParam = searchParams.get("context");
    const sessionParam = searchParams.get("session");

    if (occasion) {
      setSelectedOccasion(occasion);
    }
    if (budgetMinParam) {
      const value = Number(budgetMinParam);
      if (Number.isFinite(value) && value >= 0) setBudgetMin(value);
    }
    if (budgetMaxParam) {
      const value = Number(budgetMaxParam);
      if (Number.isFinite(value) && value >= 0) setBudgetMax(value);
    }
    if (contextParam) {
      setSpecialContext(contextParam);
    }

    async function preloadRecipient(id: string) {
      const { data } = await supabase
        .from("recipients")
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!data) return null;

      const recipient: Recipient = {
        id: data.id,
        name: data.name,
        relationship: data.relationship ?? "",
        relationship_depth: data.relationship_depth ?? "",
        age_range: data.age_range ?? "",
        gender: data.gender ?? "",
        interests: data.interests ?? [],
        cultural_context: data.cultural_context ?? "",
        country: data.country,
        notes: data.notes ?? "",
      };

      setSelectedRecipient(recipient);
      setRecipientCountry(recipient.country);
      setIsCrossBorder(Boolean(recipient.country));
      setIsPreloaded(true);
      return recipient;
    }

    async function resumeSession(session: GiftSessionRecord) {
      hydratedSessionParamRef.current = session.id;

      if (session.recipient_id) {
        await preloadRecipient(session.recipient_id);
      }

      setSelectedOccasion(session.occasion || occasion || null);
      setOccasionDate(session.occasion_date);
      setBudgetMin(session.budget_min);
      setBudgetMax(session.budget_max);
      setSpecialContext(session.special_context || contextParam || "");
      setContextTags(session.context_tags || []);
      setRecipientCountry(session.recipient_country || null);
      setIsCrossBorder(Boolean(session.recipient_country));
      setCurrentStep(5);
      setDirection(1);
      hydrateSession(session);

      const shouldResumeGeneration = session.status === "active" && !session.ai_response;
      hasGeneratedRef.current = !shouldResumeGeneration;
    }

    async function preload() {
      if (sessionParam) {
        if (
          sessionParam === activeSessionIdRef.current ||
          sessionParam === hydratedSessionParamRef.current ||
          isGenerating
        ) {
          return;
        }

        const { data: session } = await supabase
          .from("gift_sessions")
          .select("*")
          .eq("id", sessionParam)
          .eq("user_id", user.id)
          .single();

        if (session) {
          await resumeSession(session);
          return;
        }
      }

      if (recipientId) {
        await preloadRecipient(recipientId);
      }
    }

    void preload();
  }, [authLoading, hydrateSession, isGenerating, searchParams, user]);

  const generationParams = useMemo(() => {
    if (!selectedRecipient || !selectedOccasion || budgetMin == null || budgetMax == null) return null;

    return {
      recipient: selectedRecipient,
      occasion: selectedOccasion,
      occasionDate,
      budgetMin,
      budgetMax,
      currency,
      recipientCountry,
      userCountry,
      specialContext,
      contextTags,
      userPlan,
    };
  }, [
    budgetMax,
    budgetMin,
    contextTags,
    currency,
    occasionDate,
    recipientCountry,
    selectedOccasion,
    selectedRecipient,
    specialContext,
    userCountry,
    userPlan,
  ]);

  useEffect(() => {
    if (currentStep !== 5 || !generationParams || hasGeneratedRef.current) return;

    hasGeneratedRef.current = true;
    void (async () => {
      await generateGifts(generationParams);
      await refreshProfile();
    })();
  }, [currentStep, generationParams, generateGifts, refreshProfile]);

  useEffect(() => {
    if (!sessionId) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("session", sessionId);
      return next;
    }, { replace: true });
  }, [sessionId, setSearchParams]);

  const goToStep = (nextStep: number) => {
    if (nextStep > currentStep) {
      if (currentStep === 1 && !selectedRecipient) {
        toast.error("Select a recipient first");
        return;
      }
      if (currentStep === 2 && !selectedOccasion) {
        toast.error("Select an occasion first");
        return;
      }
      if (currentStep === 3 && (budgetMin == null || budgetMax == null || budgetMax < budgetMin)) {
        toast.error("Set a valid budget range");
        return;
      }
    }

    // Session reset warning (Item 16)
    if (hasGeneratedRef.current && nextStep < 5) {
      setShowResetWarning(true);
      setPendingStep(nextStep);
      return;
    }

    setDirection(nextStep > currentStep ? 1 : -1);
    setCurrentStep(nextStep);
  };

  const goBack = () => {
    if (currentStep === 1) return;

    const targetStep = Math.max(1, currentStep - 1);

    // Session reset warning (Item 16)
    if (hasGeneratedRef.current && currentStep === 5) {
      setShowResetWarning(true);
      setPendingStep(targetStep);
      return;
    }

    setDirection(-1);
    setCurrentStep(targetStep);
  };

  const confirmReset = () => {
    hasGeneratedRef.current = false;
    giftSession.resetSession();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("session");
      return next;
    }, { replace: true });
    setShowResetWarning(false);

    if (pendingStep != null) {
      setDirection(pendingStep < currentStep ? -1 : 1);
      setCurrentStep(pendingStep);
      setPendingStep(null);
    }
  };

  const cancelReset = () => {
    setShowResetWarning(false);
    setPendingStep(null);
  };

  const stepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepRecipient
            selectedRecipient={selectedRecipient}
            onSelectRecipient={setSelectedRecipient}
            recipientCountry={recipientCountry}
            onRecipientCountryChange={setRecipientCountry}
            isCrossBorder={isCrossBorder}
            onCrossBorderChange={setIsCrossBorder}
            onContinue={() => goToStep(2)}
            userPlan={userPlan}
            isFirstTime={isFirstTime}
            isPreloaded={isPreloaded}
            prefillSource={searchParams.get("source")}
          />
        );
      case 2:
        return (
          <StepOccasion
            selectedOccasion={selectedOccasion}
            onSelectOccasion={setSelectedOccasion}
            occasionDate={occasionDate}
            onOccasionDateChange={setOccasionDate}
            targetCountry={recipientCountry || userCountry}
            onContinue={() => goToStep(3)}
            onBack={goBack}
          />
        );
      case 3:
        return (
          <StepBudget
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            onBudgetChange={(min, max) => {
              setBudgetMin(min);
              setBudgetMax(max);
            }}
            isCrossBorder={isCrossBorder}
            recipientCountry={recipientCountry}
            relationship={selectedRecipient?.relationship ?? null}
            userCountry={userCountry}
            onContinue={() => goToStep(4)}
            onBack={goBack}
          />
        );
      case 4:
        return (
          <StepContext
            specialContext={specialContext}
            onSpecialContextChange={setSpecialContext}
            contextTags={contextTags}
            onContextTagsChange={setContextTags}
            onContinue={() => goToStep(5)}
            onSkip={() => goToStep(5)}
            onBack={goBack}
            recipientName={selectedRecipient?.name ?? null}
            canUseSignalCheck={canUseSignalCheck}
            isSignalCheckEnabled={featureSignalCheck}
            signalCheckCost={signalCheckCost}
            creditsBalance={creditsBalance}
            giftGenerationUnits={giftGenerationUnits}
          />
        );
      case 5:
        if (!selectedRecipient || !selectedOccasion || !generationParams) return null;
        return (
          <StepResults
            giftSession={giftSession}
            selectedRecipient={selectedRecipient}
            selectedOccasion={selectedOccasion}
            currency={currency}
            recipientCountry={recipientCountry}
            userPlan={userPlan}
            canUseSignalCheck={canUseSignalCheck}
            isSignalCheckEnabled={featureSignalCheck}
            signalCheckCost={signalCheckCost}
            onRegenerateParams={generationParams}
            onCreditsChanged={(nextBalance) => {
              if (typeof nextBalance === "number") {
                setCreditsBalance(nextBalance);
              } else {
                void refreshProfile();
              }
            }}
            onStartOver={() => {
              giftSession.resetSession();
              hasGeneratedRef.current = false;
              setDirection(-1);
              setCurrentStep(1);
              setSelectedOccasion(null);
              setOccasionDate(null);
              setBudgetMin(null);
              setBudgetMax(null);
              setSpecialContext("");
              setContextTags([]);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("session");
                next.delete("occasion");
                next.delete("budget_min");
                next.delete("budget_max");
                next.delete("context");
                if (selectedRecipient?.id) {
                  next.set("recipient", selectedRecipient.id);
                }
                return next;
              }, { replace: true });
            }}
          />
        );
      default:
        return null;
    }
  };

  const activeEase = direction > 0 ? FORWARD_EASE : BACKWARD_EASE;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-8">
        {isCheckingCredits || authLoading ? (
          <Card className="border-border/60">
            <CardContent className="flex min-h-[300px] items-center justify-center gap-3 p-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading your gift flow...
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              {currentStep === 5 ? (
                <Button type="button" variant="ghost" className="px-0 text-muted-foreground hover:text-foreground" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <Coins className="h-4 w-4 text-primary" />
                {formatCreditsValue(creditsBalance)}
              </div>
            </div>

            <StepProgress currentStep={currentStep} onStepClick={goToStep} />

            {/* Context summary strip — shows what's been confirmed so far */}
            {currentStep >= 2 && (selectedRecipient || selectedOccasion || (budgetMin != null && budgetMax != null)) && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {selectedRecipient && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    {selectedRecipient.name}
                  </span>
                )}
                {selectedOccasion && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    {selectedOccasion.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                )}
                {budgetMin != null && budgetMax != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    ${budgetMin}–${budgetMax}
                  </span>
                )}
              </div>
            )}

            {currentStep < 5 && creditsBalance < giftGenerationUnits ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                You need {formatCreditsValue(giftGenerationUnits)} credit{giftGenerationUnits === 2 ? "" : "s"} to generate recommendations. You can still plan the details, but generation will require credits.
              </div>
            ) : null}

            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: direction > 0 ? 28 : -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -28 : 28 }}
                transition={{
                  duration: 0.25,
                  ease: activeEase as unknown as number[],
                }}
              >
                {stepContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Session reset warning dialog (Item 16) */}
      <AlertDialog open={showResetWarning} onOpenChange={cancelReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear current recommendations?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing your inputs will clear your current AI recommendations. You&apos;ll need to use another credit to generate new ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on results</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>
              Go back and change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
