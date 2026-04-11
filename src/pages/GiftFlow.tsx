import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { detectUserCountry, detectUserCurrency } from "@/lib/geoConfig";
import { useGiftSession, type Recipient } from "@/hooks/useGiftSession";
import NoCreditGate from "@/components/gift-flow/NoCreditGate";
import StepBudget from "@/components/gift-flow/StepBudget";
import StepContext from "@/components/gift-flow/StepContext";
import StepOccasion from "@/components/gift-flow/StepOccasion";
import StepProgress from "@/components/gift-flow/StepProgress";
import StepRecipient from "@/components/gift-flow/StepRecipient";
import StepResults from "@/components/gift-flow/StepResults";

export default function GiftFlow() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const giftSession = useGiftSession();

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [recipientCountry, setRecipientCountry] = useState<string | null>(null);
  const [isCrossBorder, setIsCrossBorder] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [occasionDate, setOccasionDate] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState<number | null>(null);
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [currency, setCurrency] = useState(detectUserCurrency());
  const [specialContext, setSpecialContext] = useState("");
  const [contextTags, setContextTags] = useState<string[]>([]);
  const [userPlan, setUserPlan] = useState("free");
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [userCountry, setUserCountry] = useState(detectUserCountry());
  const [isCheckingCredits, setIsCheckingCredits] = useState(true);

  const hasGeneratedRef = useRef(false);
  const previousSnapshotRef = useRef("");

  const refreshProfile = async () => {
    if (!user) {
      setCreditsBalance(0);
      setUserPlan("free");
      setCurrency(detectUserCurrency());
      setUserCountry(detectUserCountry());
      setIsCheckingCredits(false);
      return;
    }

    setIsCheckingCredits(true);

    const { data } = await supabase
      .from("users")
      .select("credits_balance, active_plan, country, currency_preference")
      .eq("id", user.id)
      .single();

    setCreditsBalance(data?.credits_balance ?? 0);
    setUserPlan(data?.active_plan ?? "free");
    setCurrency(data?.currency_preference || detectUserCurrency());
    setUserCountry(data?.country || detectUserCountry());
    setIsCheckingCredits(false);
  };

  useEffect(() => {
    if (authLoading) return;
    void refreshProfile();
  }, [authLoading, user]);

  useEffect(() => {
    const recipientId = searchParams.get("recipient");
    const occasion = searchParams.get("occasion");
    if (occasion) {
      setSelectedOccasion(occasion);
    }
    if (!recipientId || !user) return;

    async function preloadRecipient() {
      const { data } = await supabase
        .from("recipients")
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
        .eq("id", recipientId)
        .eq("user_id", user.id)
        .single();

      if (!data) return;

      setSelectedRecipient({
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
      });
      setRecipientCountry(data.country);
      setIsCrossBorder(Boolean(data.country));
    }

    void preloadRecipient();
  }, [searchParams, user]);

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

  const inputSnapshot = useMemo(
    () =>
      JSON.stringify({
        selectedRecipientId: selectedRecipient?.id ?? null,
        recipientCountry,
        selectedOccasion,
        occasionDate,
        budgetMin,
        budgetMax,
        currency,
        specialContext,
        contextTags,
      }),
    [budgetMax, budgetMin, contextTags, currency, occasionDate, recipientCountry, selectedOccasion, selectedRecipient?.id, specialContext],
  );

  useEffect(() => {
    if (!previousSnapshotRef.current) {
      previousSnapshotRef.current = inputSnapshot;
      return;
    }

    if (previousSnapshotRef.current !== inputSnapshot && hasGeneratedRef.current) {
      hasGeneratedRef.current = false;
      giftSession.resetSession();
    }

    previousSnapshotRef.current = inputSnapshot;
  }, [giftSession, inputSnapshot]);

  useEffect(() => {
    if (currentStep !== 5 || !generationParams || hasGeneratedRef.current) return;

    hasGeneratedRef.current = true;

    void (async () => {
      await giftSession.generateGifts(generationParams);
      await refreshProfile();
    })();
  }, [currentStep, generationParams, giftSession]);

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

    setDirection(nextStep > currentStep ? 1 : -1);
    setCurrentStep(nextStep);
  };

  const goBack = () => {
    if (currentStep === 1) return;
    setDirection(-1);
    setCurrentStep((step) => Math.max(1, step - 1));
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
            currency={currency}
            isCrossBorder={isCrossBorder}
            recipientCountry={recipientCountry}
            relationship={selectedRecipient?.relationship ?? null}
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
            onRegenerateParams={generationParams}
            onCreditsChanged={() => {
              void refreshProfile();
            }}
          />
        );
      default:
        return null;
    }
  };

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
        ) : creditsBalance <= 0 ? (
          <NoCreditGate />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              {currentStep > 1 ? (
                <Button type="button" variant="ghost" className="px-0 text-muted-foreground hover:text-foreground" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <Coins className="h-4 w-4 text-primary" />
                {creditsBalance} credits
              </div>
            </div>

            <StepProgress currentStep={currentStep} />

            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: direction > 0 ? 28 : -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -28 : 28 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {stepContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
