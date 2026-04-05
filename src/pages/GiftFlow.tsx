import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import GiftFlowStepper from "@/components/gift-flow/GiftFlowStepper";
import StepRecipient from "@/components/gift-flow/StepRecipient";
import StepOccasion from "@/components/gift-flow/StepOccasion";
import StepBudget from "@/components/gift-flow/StepBudget";
import StepContext from "@/components/gift-flow/StepContext";
import StepResults from "@/components/gift-flow/StepResults";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import type { RecipientFormData } from "@/components/recipients/constants";
import { defaultGiftFlowState, type GiftFlowState } from "@/components/gift-flow/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
    return { ...defaultGiftFlowState, occasion, recipientId };
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [noCreditsOpen, setNoCreditsOpen] = useState(false);
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

  useEffect(() => {
    if (profile && (profile.credits ?? 0) < 1) {
      setNoCreditsOpen(true);
    }
  }, [profile]);

  const update = <K extends keyof GiftFlowState>(key: K, val: GiftFlowState[K]) =>
    setFlow((p) => ({ ...p, [key]: val }));

  const goNext = () => {
    setDir(1);
    setStep((s) => Math.min(s + 1, 4));
  };
  const goBack = () => {
    setDir(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  // Validation per step
  const canProceed = () => {
    if (step === 0) return !!flow.recipientId;
    if (step === 1) return !!flow.occasion;
    if (step === 2) return flow.budgetMax > flow.budgetMin;
    return true;
  };

  // Save session to DB on reaching results
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
          status: "completed",
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSessionId(data.id);
    },
    onError: () => toast.error("Failed to save session"),
  });

  const handleProceedToResults = () => {
    goNext();
    if (!sessionId) saveMutation.mutate();
  };

  // Add recipient inline
  const addRecipientMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { data, error } = await supabase
        .from("recipients")
        .insert({
          user_id: user!.id,
          name: form.name,
          relationship_type: form.relationship_type as any,
          relationship_depth: form.relationship_depth as any,
          age_range: form.age_range ? (form.age_range as any) : null,
          gender: form.gender ? (form.gender as any) : null,
          interests: form.interests,
          cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
          notes: form.notes || null,
          important_dates: form.important_dates as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      update("recipientId", data.id);
      setAddModalOpen(false);
      toast.success("Person added!");
    },
    onError: () => toast.error("Failed to add person"),
  });

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

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto pb-20 md:pb-0">
        {/* Stepper */}
        <GiftFlowStepper currentStep={step} />

        {/* Steps */}
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
                  onAddNew={() => setAddModalOpen(true)}
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
                />
              )}
              {step === 4 && (
                <StepResults
                  currency={flow.currency}
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
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleProceedToResults} className="text-muted-foreground">
                  Skip
                </Button>
                <Button variant="hero" onClick={handleProceedToResults}>
                  Get Recommendations <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button variant="hero" onClick={goNext} disabled={!canProceed()}>
                Next <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add recipient modal */}
      <RecipientFormModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSubmit={(data) => addRecipientMutation.mutate(data)}
        loading={addRecipientMutation.isPending}
      />

      {/* No credits dialog */}
      <Dialog open={noCreditsOpen} onOpenChange={setNoCreditsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">You're out of credits</DialogTitle>
            <DialogDescription>
              Each gift session uses 1 credit. Upgrade your plan or purchase more credits to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="hero" className="flex-1" onClick={() => navigate("/pricing")}>
              View Plans
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default GiftFlow;
