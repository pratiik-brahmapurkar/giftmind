import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Gift } from "lucide-react";
import PricingCards from "@/components/pricing/PricingCards";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import GiftFlowStepper from "@/components/gift-flow/GiftFlowStepper";
import StepRecipient from "@/components/gift-flow/StepRecipient";
import StepOccasion from "@/components/gift-flow/StepOccasion";
import StepBudget from "@/components/gift-flow/StepBudget";
import StepContext from "@/components/gift-flow/StepContext";
import StepResults from "@/components/gift-flow/StepResults";
import { defaultGiftFlowState, detectCurrencyFromLocale, detectUserCountry, type GiftFlowState } from "@/components/gift-flow/constants";
import { useGiftSession } from "@/hooks/useGiftSession";
import type { SignalCheckContext } from "@/hooks/useGiftSession";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useCredits } from "@/hooks/useCredits";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { SEOHead } from "@/components/common/SEOHead";
import { trackEvent } from "@/lib/posthog";
import { sanitizeArray, sanitizeString } from "@/lib/validation";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -200 : 200, opacity: 0 }),
};

const GiftFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { plan } = useUserPlan();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [flow, setFlow] = useState<GiftFlowState>(() => {
    const occasion = searchParams.get("occasion") || "";
    const recipientId = searchParams.get("recipient") || null;
    const detectedCurrency = detectCurrencyFromLocale();
    const detectedCountry = detectUserCountry();
    return {
      ...defaultGiftFlowState,
      occasion,
      recipientId,
      currency: detectedCurrency,
      recipientCountry: detectedCountry,
    };
  });

  const giftSession = useGiftSession();

  // Realtime credit awareness — isEmpty triggers the no-credits gate
  const { isEmpty: noCredits, isLoading: creditsLoading, balance: creditsBalance, refresh: refreshCredits } = useCredits();
  const planLimits = usePlanLimits();

  // Fetch full recipient object (all fields needed for AI prompt)
  const { data: selectedRecipient } = useQuery({
    queryKey: ["recipient-full", flow.recipientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select(
          "id, name, relationship_type, relationship_depth, age_range, gender, interests, cultural_context, country, notes"
        )
        .eq("id", flow.recipientId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!flow.recipientId,
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

  // Build signal check context from the current flow + recipient
  const signalCheckContext: SignalCheckContext | null = selectedRecipient
    ? {
        recipientName: (selectedRecipient as any).name,
        recipientRelationship: (selectedRecipient as any).relationship_type,
        recipientRelationshipDepth: (selectedRecipient as any).relationship_depth,
        occasion: flow.occasion,
        relationshipStage: (selectedRecipient as any).relationship_depth,
        currency: flow.currency,
      }
    : null;

  // Browser back button → go to previous step instead of leaving the flow
  useEffect(() => {
    const handlePop = () => {
      setDir(-1);
      setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    if (step === 0) {
      trackEvent('gift_flow_started', { occasion: null });
    }
  }, [step]);

  const handleSignalCheck = async (gift: any) => {
    trackEvent('signal_check_used', { gift_name: gift.name, plan: plan });
    if (!planLimits.canUseSignalCheck()) return;
    if (!signalCheckContext) return;
    await giftSession.handleSignalCheck(gift, signalCheckContext, refreshCredits);
  };


  const update = <K extends keyof GiftFlowState>(key: K, val: GiftFlowState[K]) =>
    setFlow((p) => ({ ...p, [key]: val }));

  const cleanContextTags = sanitizeArray(flow.contextTags, 10);
  const cleanExtraNotes = sanitizeString(flow.extraNotes, 300);

  const stepNames = ['recipient', 'occasion', 'budget', 'context', 'results'];
  const goNext = () => {
    window.history.pushState({ step: step + 1 }, '');
    trackEvent('gift_flow_step', { step: step + 1, step_name: stepNames[step] });
    setDir(1);
    setStep((s) => Math.min(s + 1, 4));
  };
  const goBack = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };

  const canProceed = () => {
    if (step === 0) return !!flow.recipientId;
    if (step === 1) return !!flow.occasion;
    if (step === 2) return flow.budgetMax > flow.budgetMin;
    return true;
  };

  // Create the DB session row, then trigger AI generation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .insert({
          user_id: user!.id,
          recipient_id: flow.recipientId,
          occasion: flow.occasion,
          occasion_date: flow.occasionDate || null,
          budget_min: flow.budgetMin,
          budget_max: flow.budgetMax,
          currency: flow.currency,
          context_tags: cleanContextTags,
          extra_notes: cleanExtraNotes || null,
          recipient_country: flow.recipientCountry || null,
          status: "active",
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      const sessionId = data.id;
      giftSession.setSessionId(sessionId);

      // Now we have a session + recipient — fire the AI
      if (selectedRecipient) {
        try {
          await giftSession.generateGifts({
            recipient: {
              name: (selectedRecipient as any).name,
              relationship_type: (selectedRecipient as any).relationship_type,
              relationship_depth: (selectedRecipient as any).relationship_depth,
              age_range: (selectedRecipient as any).age_range,
              gender: (selectedRecipient as any).gender,
              interests: (selectedRecipient as any).interests,
              cultural_context: (selectedRecipient as any).cultural_context,
              country: (selectedRecipient as any).country,
              notes: (selectedRecipient as any).notes,
            },
            occasion: flow.occasion,
            occasionDate: flow.occasionDate || null,
            budgetMin: flow.budgetMin,
            budgetMax: flow.budgetMax,
            currency: flow.currency,
            recipientCountry: flow.recipientCountry || null,
            specialContext: cleanExtraNotes || null,
            contextTags: cleanContextTags,
            userPlan: plan,
            sessionId,
          });
        } catch {
          // Error is stored in giftSession.error — StepResults will show retry UI
        }
      }
    },
    onError: () => toast.error("Failed to save session"),
  });

  const handleProceedToResults = () => {
    goNext();
    // Only create session once
    if (!giftSession.sessionId) {
      saveMutation.mutate();
    }
  };

  const handleChooseGift = async (gift: any, index: number) => {
    trackEvent('gift_selected', {
      gift_name: gift.name,
      confidence_score: gift.confidence_score,
      occasion: flow.occasion
    });
    // selectGift handles the DB update (chosen_gift, selected_gift_name, selected_gift_index, status)
    // and fires the referral credit award — no duplicate update needed here
    await giftSession.selectGift(index, gift);
    toast.success("Great choice! 🎉");
  };

  const handleRegenerate = async () => {
    if (!selectedRecipient || !giftSession.sessionId) return;
    trackEvent('gift_regenerated', { regen_count: giftSession.regenerationCount + 1 });
    try {
      await giftSession.regenerate({
        recipient: {
          name: (selectedRecipient as any).name,
          relationship_type: (selectedRecipient as any).relationship_type,
          relationship_depth: (selectedRecipient as any).relationship_depth,
          age_range: (selectedRecipient as any).age_range,
          gender: (selectedRecipient as any).gender,
          interests: (selectedRecipient as any).interests,
          cultural_context: (selectedRecipient as any).cultural_context,
          country: (selectedRecipient as any).country,
          notes: (selectedRecipient as any).notes,
        },
        occasion: flow.occasion,
        occasionDate: flow.occasionDate || null,
        budgetMin: flow.budgetMin,
        budgetMax: flow.budgetMax,
        currency: flow.currency,
        recipientCountry: flow.recipientCountry || null,
        specialContext: cleanExtraNotes || null,
        contextTags: cleanContextTags,
        userPlan: plan,
        sessionId: giftSession.sessionId,
      });
    } catch {
      // Error shown in StepResults
    }
  };

  // No credits overlay — only after balance has loaded
  if (noCredits && !creditsLoading) {
    return (
      <DashboardLayout>
        <SEOHead title="Find the Perfect Gift" description="AI-powered gift recommendations" noIndex={true} />
        <div className="max-w-5xl mx-auto py-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Gift className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">
              You've used all your free credits 🎁
            </h2>
            <p className="text-muted-foreground">
              Get more credits to keep finding perfect gifts.
            </p>
          </div>
          <PricingCards compact />
          <div className="text-center">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-muted-foreground">
              ← Go back to dashboard
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SEOHead title="Find the Perfect Gift" description="AI-powered gift recommendations" noIndex={true} />
      <div className="max-w-2xl mx-auto pb-20 md:pb-0">
        <div className="flex items-start justify-between">
          <GiftFlowStepper currentStep={step} />
          {!creditsLoading && (
            <span className="shrink-0 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 flex items-center gap-1 mt-4 ml-2">
              🪙 {creditsBalance} credit{creditsBalance !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>

        <div className="mt-8 min-h-[400px]">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {step === 0 && (
                <StepRecipient
                  selectedId={flow.recipientId}
                  onSelect={(id) => update("recipientId", id)}
                  recipientCountry={flow.recipientCountry}
                  onRecipientCountryChange={(c) => update("recipientCountry", c)}
                />
              )}
              {step === 1 && (
                <StepOccasion
                  selected={flow.occasion}
                  onSelect={(v) => update("occasion", v)}
                  occasionDate={flow.occasionDate}
                  onDateChange={(v) => update("occasionDate", v)}
                  targetCountry={
                    (selectedRecipient as any)?.country && (selectedRecipient as any).country !== ""
                      ? (selectedRecipient as any).country
                      : (profile as any)?.country || detectUserCountry() || "US"
                  }
                />
              )}
              {step === 2 && (
                <StepBudget
                  min={flow.budgetMin}
                  max={flow.budgetMax}
                  currency={flow.currency}
                  onMinChange={(v) => update("budgetMin", v)}
                  onMaxChange={(v) => update("budgetMax", v)}
                  onCurrencyChange={(v) => update("currency", v)}
                  recipientRelationship={(selectedRecipient as any)?.relationship_type}
                  recipientCountry={flow.recipientCountry}
                />
              )}
              {step === 3 && (
                <StepContext
                  tags={flow.contextTags}
                  onToggleTag={(tag) =>
                    update(
                      "contextTags",
                      sanitizeArray(
                        flow.contextTags.includes(tag)
                          ? flow.contextTags.filter((t) => t !== tag)
                          : [...flow.contextTags, sanitizeString(tag, 100)],
                        10,
                      )
                    )
                  }
                  notes={flow.extraNotes}
                  onNotesChange={(v) => update("extraNotes", sanitizeString(v, 300))}
                  onSkip={handleProceedToResults}
                />
              )}
              {step === 4 && (
                <StepResults
                  currency={flow.currency}
                  recipientCountry={flow.recipientCountry}
                  recipientName={(selectedRecipient as any)?.name ?? null}
                  occasion={flow.occasion}
                  sessionId={giftSession.sessionId}
                  // Real AI data
                  isGenerating={giftSession.isGenerating || saveMutation.isPending}
                  isSearchingProducts={giftSession.isSearchingProducts}
                  recommendations={giftSession.recommendations}
                  productResults={giftSession.productResults}
                  occasionInsight={giftSession.occasionInsight}
                  budgetAssessment={giftSession.budgetAssessment}
                  culturalNote={giftSession.culturalNote}
                  error={giftSession.error}
                  regenerationCount={giftSession.regenerationCount}
                  // Signal Check
                  signalCheckResults={giftSession.signalCheckResults}
                  signalCheckLoading={giftSession.signalCheckLoading}
                  signalCheckContext={signalCheckContext}
                  onSignalCheck={handleSignalCheck}
                  // Actions
                  onRegenerate={handleRegenerate}
                  onBack={goBack}
                  onChoose={handleChooseGift}
                  onTrackClick={(product) => {
                    trackEvent('product_clicked', { 
                      store: product.store_name, 
                      gift_name: product.gift_name, 
                      is_search_link: true,
                      country: flow.recipientCountry 
                    });
                    giftSession.trackClick(product, giftSession.sessionId);
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation buttons (steps 0-3) */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={goBack}
              disabled={step === 0}
              className="text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>

            {step === 3 ? (
              <Button variant="hero" onClick={handleProceedToResults}>
                Get Recommendations <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button variant="hero" onClick={goNext} disabled={!canProceed()}>
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GiftFlow;
