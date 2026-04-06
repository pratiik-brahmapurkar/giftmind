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

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -200 : 200, opacity: 0 }),
};

const GiftFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check credits
  const { data: profile } = useQuery({
    queryKey: ["profile-credits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("credits")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch selected recipient's relationship type for budget insights
  const { data: selectedRecipient } = useQuery({
    queryKey: ["recipient-detail", flow.recipientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("relationship_type, country")
        .eq("id", flow.recipientId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!flow.recipientId,
  });

  const credits = profile?.credits ?? 0;
  const noCredits = profile !== undefined && credits < 1;

  const update = <K extends keyof GiftFlowState>(key: K, val: GiftFlowState[K]) =>
    setFlow((p) => ({ ...p, [key]: val }));

  const goNext = () => { setDir(1); setStep((s) => Math.min(s + 1, 4)); };
  const goBack = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };

  const canProceed = () => {
    if (step === 0) return !!flow.recipientId;
    if (step === 1) return !!flow.occasion;
    if (step === 2) return flow.budgetMax > flow.budgetMin;
    return true;
  };

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
          context_tags: flow.contextTags,
          extra_notes: flow.extraNotes || null,
          recipient_country: flow.recipientCountry || null,
          status: "completed",
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => setSessionId(data.id),
    onError: () => toast.error("Failed to save session"),
  });

  const handleProceedToResults = () => {
    goNext();
    if (!sessionId) saveMutation.mutate();
  };

  const handleChooseGift = async (gift: any) => {
    if (sessionId) {
      await supabase
        .from("gift_sessions")
        .update({ chosen_gift: gift } as any)
        .eq("id", sessionId);
    }
    toast.success("Great choice! 🎉");
    navigate("/dashboard");
  };

  // No credits overlay
  if (noCredits) {
    return (
      <DashboardLayout>
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
      <div className="max-w-2xl mx-auto pb-20 md:pb-0">
        <GiftFlowStepper currentStep={step} />

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
                  recipientRelationship={selectedRecipient?.relationship_type}
                  recipientCountry={flow.recipientCountry}
                />
              )}
              {step === 3 && (
                <StepContext
                  tags={flow.contextTags}
                  onToggleTag={(tag) =>
                    update(
                      "contextTags",
                      flow.contextTags.includes(tag)
                        ? flow.contextTags.filter((t) => t !== tag)
                        : [...flow.contextTags, tag]
                    )
                  }
                  notes={flow.extraNotes}
                  onNotesChange={(v) => update("extraNotes", v)}
                  onSkip={handleProceedToResults}
                />
              )}
              {step === 4 && (
                <StepResults
                  currency={flow.currency}
                  recipientCountry={flow.recipientCountry}
                  sessionId={sessionId}
                  onRegenerate={() => toast.info("Regeneration coming soon!")}
                  onBack={goBack}
                  onChoose={handleChooseGift}
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
