import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowLeft, ArrowRight, Coins, Gift, Loader2, Sparkles, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackEvent } from "@/lib/posthog";
import { sanitizeArray, sanitizeString, validateCountryCode, validateRelationship } from "@/lib/validation";
import { COUNTRY_OPTIONS, INTEREST_SUGGESTIONS, RELATIONSHIP_TYPES } from "@/components/recipients/constants";
import { AUDIENCE_OPTIONS, GIFT_STYLE_OPTIONS, ONBOARDING_STEP_LABELS } from "@/features/onboarding/constants";
import type { BirthdayDraft, OnboardingState } from "@/features/onboarding/types";
import {
  birthdayToIso,
  buildOnboardingState,
  calculateProfileCompletion,
  defaultOnboardingState,
  detectCountryFromLocale,
  getCountryMeta,
  parseBirthdayString,
  parseOnboardingState,
  validateBirthdayDraft,
} from "@/features/onboarding/utils";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 260 : -260, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -260 : 260, opacity: 0 }),
};

type UserRow = Pick<
  Tables<"users">,
  | "full_name"
  | "country"
  | "birthday"
  | "credits_balance"
  | "has_completed_onboarding"
  | "onboarding_state"
  | "profile_completion_percentage"
>;

type CreatedRecipient = {
  id: string;
  name: string;
};

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(2000, index, 1).toLocaleString("en-US", { month: "short" }),
}));

const dayOptions = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: String(index + 1),
}));

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 108 }, (_, index) => String(currentYear - 13 - index));

const onboardingBonusEnabled = import.meta.env.VITE_ONBOARDING_BONUS_ENABLED === "true";

function GiftBoxAnim() {
  return (
    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary animate-gift-bounce">
      <Gift className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />
    </div>
  );
}

function HowItWorksList() {
  const items = [
    { icon: Users, label: "Tell us about the people you care about" },
    { icon: ShoppingBag, label: "Pick an occasion you're planning for" },
    { icon: Sparkles, label: "Get 3 gift ideas with confidence scores" },
  ];

  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-left">
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <item.icon className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-foreground">
              <span className="mr-1 font-semibold text-primary">{index + 1}.</span>
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeRequested = searchParams.get("resume") === "true";

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeStep, setResumeStep] = useState(1);
  const [creditsBalance, setCreditsBalance] = useState(3);
  const [recipientCount, setRecipientCount] = useState(0);
  const [createdRecipient, setCreatedRecipient] = useState<CreatedRecipient | null>(null);
  const [autoSkipMessage, setAutoSkipMessage] = useState("");

  const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultOnboardingState);
  const [selectedAudience, setSelectedAudience] = useState<string[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [recipientRelationship, setRecipientRelationship] = useState("");
  const [recipientInterests, setRecipientInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("US");
  const [birthday, setBirthday] = useState<BirthdayDraft>({ month: "", day: "", year: "" });
  const [giftStyle, setGiftStyle] = useState<string[]>([]);
  const [stepError, setStepError] = useState("");

  const mountedRef = useRef(false);
  const startedEventRef = useRef(false);
  const completedRef = useRef(false);
  const stepStartedAtRef = useRef(Date.now());
  const totalStartedAtRef = useRef(Date.now());
  const autoSkippedExistingRecipientRef = useRef(false);

  const welcomeName = useMemo(() => {
    const raw = fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || "";
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed ? trimmed.split(" ")[0] : "";
  }, [fullName, user?.user_metadata]);

  const referralCode = sessionStorage.getItem("gm_referral_code");
  const countryMeta = getCountryMeta(country);
  const birthdayError = step === 4 ? validateBirthdayDraft(birthday) : null;

  const completionPreview = useMemo(
    () =>
      calculateProfileCompletion({
        fullName,
        country,
        recipientCount: createdRecipient ? Math.max(1, recipientCount) : recipientCount,
        birthday: birthdayToIso(birthday),
        audience: selectedAudience,
        giftStyle,
      }),
    [birthday, country, createdRecipient, fullName, giftStyle, recipientCount, selectedAudience],
  );

  const persistUserState = useCallback(async (
    userPatch: TablesUpdate<"users"> = {},
    statePatch: Partial<OnboardingState> = {},
  ) => {
    if (!user) return;

    const nextState = buildOnboardingState(onboardingState, statePatch);
    const payload = {
      ...userPatch,
      onboarding_state: nextState,
      updated_at: new Date().toISOString(),
    } satisfies TablesUpdate<"users">;

    const { error } = await supabase.from("users").update(payload).eq("id", user.id);
    if (error) throw error;

    setOnboardingState(nextState);
  }, [onboardingState, user]);

  const markStepComplete = useCallback(async ({
    currentStep,
    nextStep,
    wasSkipped,
    userPatch = {},
    statePatch = {},
  }: {
    currentStep: number;
    nextStep: number;
    wasSkipped: boolean;
    userPatch?: TablesUpdate<"users">;
    statePatch?: Partial<OnboardingState>;
  }) => {
    const now = new Date().toISOString();
    const nextCompletedSteps = Array.from(new Set([...onboardingState.completed_steps, currentStep])).sort((a, b) => a - b);
    const nextSkippedSteps = wasSkipped
      ? Array.from(new Set([...onboardingState.skipped_steps, currentStep])).sort((a, b) => a - b)
      : onboardingState.skipped_steps;

    await persistUserState(userPatch, {
      ...statePatch,
      current_step: nextStep,
      status: nextStep === 5 && onboardingState.status === "opted_out" ? "opted_out" : "in_progress",
      completed_steps: nextCompletedSteps,
      skipped_steps: nextSkippedSteps,
      started_at: onboardingState.started_at ?? now,
    });

    trackEvent("onboarding_step_completed", {
      step: currentStep,
      duration_ms: Date.now() - stepStartedAtRef.current,
      was_skipped: wasSkipped,
    });
  }, [onboardingState, persistUserState]);

  const goToStep = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }, [step]);

  const handleBack = async () => {
    if (step <= 1 || saving) return;
    try {
      await persistUserState({}, { current_step: step - 1 });
      goToStep(step - 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't go back right now.");
    }
  };

  const addInterest = (rawValue: string) => {
    const cleanValue = sanitizeString(rawValue, 30);
    if (!cleanValue) return;
    if (recipientInterests.length >= 5) return;
    if (recipientInterests.some((interest) => interest.toLowerCase() === cleanValue.toLowerCase())) return;
    setRecipientInterests((prev) => [...prev, cleanValue]);
    setInterestInput("");
  };

  const toggleAudience = (value: string) => {
    setSelectedAudience((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const toggleGiftStyle = (value: string) => {
    setGiftStyle((prev) => {
      if (prev.includes(value)) return prev.filter((item) => item !== value);
      if (prev.length >= 3) return prev;
      return [...prev, value];
    });
  };

  const handleStepOneNext = async () => {
    setSaving(true);
    setStepError("");
    try {
      await markStepComplete({
        currentStep: 1,
        nextStep: 2,
        wasSkipped: false,
        statePatch: { status: "in_progress" },
      });
      goToStep(2);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Couldn't save your progress.");
    } finally {
      setSaving(false);
    }
  };

  const handleStepTwoNext = async (wasSkipped = false) => {
    setSaving(true);
    setStepError("");
    try {
      await markStepComplete({
        currentStep: 2,
        nextStep: 3,
        wasSkipped,
        statePatch: { audience: wasSkipped ? [] : selectedAudience },
      });
      goToStep(3);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Couldn't save your gifting context.");
    } finally {
      setSaving(false);
    }
  };

  const handleStepThreeNext = async (wasSkipped = false) => {
    setSaving(true);
    setStepError("");

    try {
      if (!wasSkipped) {
        const cleanName = sanitizeString(recipientName, 50);
        if (cleanName.length < 2) {
          setStepError("Name must be at least 2 characters.");
          setSaving(false);
          return;
        }

        const relationship = recipientRelationship && validateRelationship(recipientRelationship)
          ? recipientRelationship
          : null;
        const interests = sanitizeArray(recipientInterests, 5);

        const { data, error } = await supabase
          .from("recipients")
          .insert({
            user_id: user!.id,
            name: cleanName,
            relationship,
            interests: interests.length > 0 ? interests : null,
          })
          .select("id, name")
          .single();

        if (error || !data) {
          throw error ?? new Error("Couldn't save your person.");
        }

        setCreatedRecipient({ id: data.id, name: data.name });
        setRecipientCount((prev) => prev + 1);
      }

      await markStepComplete({
        currentStep: 3,
        nextStep: 4,
        wasSkipped,
        statePatch: { skipped_recipient: wasSkipped },
      });
      goToStep(4);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Couldn't save this person.");
    } finally {
      setSaving(false);
    }
  };

  const handleStepFourNext = async (wasSkipped = false) => {
    setSaving(true);
    setStepError("");

    try {
      const cleanName = sanitizeString(fullName, 100);
      if (!wasSkipped && cleanName.length < 2) {
        setStepError("Please enter your name.");
        setSaving(false);
        return;
      }

      if (!wasSkipped && !validateCountryCode(country)) {
        setStepError("Please select your country.");
        setSaving(false);
        return;
      }

      if (!wasSkipped && birthdayError) {
        setStepError(birthdayError);
        setSaving(false);
        return;
      }

      const birthdayIso = birthdayToIso(birthday);
      await markStepComplete({
        currentStep: 4,
        nextStep: 5,
        wasSkipped,
        userPatch: {
          full_name: cleanName || fullName || null,
          country: validateCountryCode(country) ? country : null,
          birthday: birthdayIso,
        },
        statePatch: {
          gift_style: wasSkipped ? onboardingState.gift_style : giftStyle,
        },
      });
      goToStep(5);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Couldn't save your profile details.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (saving) return;
    trackEvent("onboarding_skipped", { from_step: step });

    if (step === 1) {
      setSaving(true);
      try {
        const now = new Date().toISOString();
        const skippedSteps = [1, 2, 3, 4];
        await persistUserState({}, {
          status: "opted_out",
          current_step: 5,
          skipped_steps: skippedSteps,
          completed_steps: [],
          started_at: onboardingState.started_at ?? now,
        });
        trackEvent("onboarding_step_completed", {
          step: 1,
          duration_ms: Date.now() - stepStartedAtRef.current,
          was_skipped: true,
        });
        goToStep(5);
      } catch (error) {
        setStepError(error instanceof Error ? error.message : "Couldn't skip right now.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (step === 2) {
      void handleStepTwoNext(true);
      return;
    }

    if (step === 3) {
      void handleStepThreeNext(true);
      return;
    }

    if (step === 4) {
      void handleStepFourNext(true);
    }
  };

  const completeOnboarding = useCallback(async () => {
    if (!user || completedRef.current) return;
    completedRef.current = true;

    const now = new Date().toISOString();
    const completionState = buildOnboardingState(onboardingState, {
      status: "completed",
      current_step: 5,
      completed_at: now,
      completed_steps: Array.from(new Set([...onboardingState.completed_steps, 5])).sort((a, b) => a - b),
    });

    let newBalance = creditsBalance;

    if (onboardingBonusEnabled) {
      const response = await supabase.functions.invoke("complete-onboarding", { body: {} });
      if (!response.error && response.data?.success) {
        newBalance = response.data.new_balance ?? creditsBalance;
        setCreditsBalance(newBalance);
      } else {
        await supabase
          .from("users")
          .update({
            has_completed_onboarding: true,
            onboarding_state: completionState,
            updated_at: now,
          } satisfies TablesUpdate<"users">)
          .eq("id", user.id);
      }
    } else {
      await supabase
        .from("users")
        .update({
          has_completed_onboarding: true,
          onboarding_state: completionState,
          updated_at: now,
        } satisfies TablesUpdate<"users">)
        .eq("id", user.id);
    }

    setOnboardingState(completionState);
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#D4A04A", "#E4C663", "#4C2A85", "#7A57BE", "#FAF5E8"],
      disableForReducedMotion: true,
    });

    trackEvent("onboarding_completed", {
      total_duration_ms: Date.now() - totalStartedAtRef.current,
      skipped_steps: completionState.skipped_steps,
      audience: selectedAudience,
      has_recipient: recipientCount > 0 || Boolean(createdRecipient),
      completion_pct: calculateProfileCompletion({
        fullName,
        country,
        recipientCount: createdRecipient ? Math.max(1, recipientCount) : recipientCount,
        birthday: birthdayToIso(birthday),
        audience: selectedAudience,
        giftStyle,
      }),
    });
  }, [birthday, country, createdRecipient, creditsBalance, fullName, giftStyle, onboardingState, recipientCount, selectedAudience, user]);

  useEffect(() => {
    if (!user || mountedRef.current) return;
    mountedRef.current = true;

    async function load() {
      const [{ data: userRow }, { count }] = await Promise.all([
        supabase
          .from("users")
          .select("full_name,country,birthday,credits_balance,has_completed_onboarding,onboarding_state,profile_completion_percentage")
          .eq("id", user.id)
          .single(),
        supabase
          .from("recipients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      const profile = userRow as UserRow | null;
      if (profile?.has_completed_onboarding) {
        navigate("/dashboard", { replace: true });
        return;
      }

      const parsedState = parseOnboardingState(profile?.onboarding_state);
      const initialFullName = sanitizeString(
        profile?.full_name || String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
        100,
      );
      const initialCountry = profile?.country || detectCountryFromLocale();

      setOnboardingState(parsedState);
      setSelectedAudience(parsedState.audience);
      setGiftStyle(parsedState.gift_style);
      setFullName(initialFullName);
      setCountry(validateCountryCode(initialCountry) ? initialCountry : "US");
      setBirthday(parseBirthdayString(profile?.birthday));
      setCreditsBalance(profile?.credits_balance ?? 3);
      setRecipientCount(count ?? 0);

      const startedAt = parsedState.started_at ? new Date(parsedState.started_at).getTime() : Date.now();
      totalStartedAtRef.current = startedAt;

      const provider = String(user.app_metadata?.provider || "email");
      if (!startedEventRef.current && parsedState.current_step <= 1) {
        startedEventRef.current = true;
        trackEvent("onboarding_started", {
          method: provider === "google" ? "google" : "email",
          has_referral: Boolean(referralCode),
        });
      }

      if (parsedState.status === "in_progress" && parsedState.current_step > 1) {
        if (resumeRequested) {
          setResumeStep(parsedState.current_step);
          setStep(parsedState.current_step);
          stepStartedAtRef.current = Date.now();
          trackEvent("onboarding_resumed", { resumed_from_step: parsedState.current_step });
        } else {
          setResumeStep(parsedState.current_step);
          setShowResumeDialog(true);
        }
      }

      setLoading(false);
    }

    void load();
  }, [navigate, referralCode, resumeRequested, user]);

  useEffect(() => {
    if (loading) return;
    stepStartedAtRef.current = Date.now();
    trackEvent("onboarding_step_viewed", { step });
  }, [loading, step]);

  useEffect(() => {
    if (step !== 3 || loading) return;
    if (recipientCount < 1 || createdRecipient || autoSkippedExistingRecipientRef.current) return;

    autoSkippedExistingRecipientRef.current = true;
    setAutoSkipMessage(`You already have ${recipientCount} ${recipientCount === 1 ? "person" : "people"} saved. We'll go straight to the next step.`);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setSaving(true);
        try {
          await markStepComplete({
            currentStep: 3,
            nextStep: 4,
            wasSkipped: true,
            statePatch: { skipped_recipient: true },
          });
          goToStep(4);
        } catch (error) {
          setStepError(error instanceof Error ? error.message : "Couldn't continue right now.");
        } finally {
          setSaving(false);
          setAutoSkipMessage("");
        }
      })();
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [createdRecipient, goToStep, loading, markStepComplete, recipientCount, step]);

  useEffect(() => {
    if (step !== 5 || loading) return;
    void completeOnboarding();
  }, [completeOnboarding, loading, step]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 80 && step > 1 && step < 5) {
      void handleBack();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#FAF7F2_0%,#F2EDE4_100%)]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(180deg,#FAF7F2_0%,#F2EDE4_100%)] p-4">
      {step < 5 && (
        <button
          type="button"
          onClick={handleSkip}
          className="absolute right-6 top-6 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
      )}

      <div className="w-full max-w-[560px]">
        <div className="mb-5 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => {
            const current = index + 1;
            return (
              <div
                key={current}
                className={`h-2 rounded-full transition-all duration-300 ${current === step ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"}`}
              />
            );
          })}
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            drag={step < 5 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
          >
            <Card className="overflow-hidden border-border/70 shadow-xl">
              <CardContent className="p-8 md:p-10">
                {stepError ? (
                  <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {stepError}
                  </div>
                ) : null}

                {step === 1 && (
                  <div className="space-y-6 text-center">
                    <GiftBoxAnim />
                    <div className="space-y-2">
                      <h1 className="text-3xl font-heading font-bold text-foreground">
                        {welcomeName ? `Welcome, ${welcomeName}!` : "Welcome!"} 👋
                      </h1>
                      <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                        Stop second-guessing. GiftMind tells you why a gift is right and where to buy it locally.
                      </p>
                    </div>

                    <HowItWorksList />

                    <div className="flex items-center justify-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                      <Coins className="h-4 w-4" strokeWidth={1.5} />
                      You already have {creditsBalance} free {creditsBalance === 1 ? "credit" : "credits"}.
                    </div>

                    {referralCode ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        🎉 Referred by a friend: you get 5 credits.
                      </div>
                    ) : null}

                    <Button variant="hero" className="w-full" onClick={() => void handleStepOneNext()} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Let's Set Up My Account
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="space-y-2 text-center">
                      <h2 className="text-2xl font-heading font-bold text-foreground">Who do you usually buy gifts for?</h2>
                      <p className="text-sm text-muted-foreground">Select all that apply.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {AUDIENCE_OPTIONS.map((option) => {
                        const active = selectedAudience.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleAudience(option.value)}
                            className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                              active
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-border bg-card text-foreground hover:bg-muted/40"
                            }`}
                          >
                            <span className="block text-xl">{option.emoji}</span>
                            <span className="mt-2 block text-sm font-medium">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => void handleBack()} disabled={saving}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button variant="hero" onClick={() => void handleStepTwoNext()} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Next
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="space-y-2 text-center">
                      <h2 className="text-2xl font-heading font-bold text-foreground">Who's first on your gift list?</h2>
                      <p className="text-sm text-muted-foreground">Add one person now. It takes about 30 seconds.</p>
                    </div>

                    {autoSkipMessage ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {autoSkipMessage}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="recipient-name">Name</Label>
                          <Input
                            id="recipient-name"
                            value={recipientName}
                            onChange={(event) => setRecipientName(event.target.value)}
                            placeholder="Aarav"
                            maxLength={50}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Relationship</Label>
                          <Select value={recipientRelationship || "__none"} onValueChange={(value) => setRecipientRelationship(value === "__none" ? "" : value)}>
                            <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Skip for now</SelectItem>
                              {RELATIONSHIP_TYPES.map((relationship) => (
                                <SelectItem key={relationship.value} value={relationship.value}>
                                  {relationship.emoji} {relationship.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="interest-input">What are they into?</Label>
                          <div className="flex gap-2">
                            <Input
                              id="interest-input"
                              value={interestInput}
                              onChange={(event) => setInterestInput(event.target.value)}
                              placeholder="Reading, cooking, tech..."
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === ",") {
                                  event.preventDefault();
                                  addInterest(interestInput);
                                }
                                if (event.key === "Backspace" && !interestInput && recipientInterests.length > 0) {
                                  setRecipientInterests((prev) => prev.slice(0, -1));
                                }
                              }}
                            />
                            <Button type="button" variant="outline" onClick={() => addInterest(interestInput)}>
                              Add
                            </Button>
                          </div>

                          {recipientInterests.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {recipientInterests.map((interest) => (
                                <Badge key={interest} variant="secondary" className="cursor-pointer" onClick={() => setRecipientInterests((prev) => prev.filter((item) => item !== interest))}>
                                  {interest} ×
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            {INTEREST_SUGGESTIONS.slice(0, 8).map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900"
                                onClick={() => addInterest(suggestion)}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          You can add full details like notes, country, and important dates on the People page later.
                        </p>
                      </>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => void handleBack()} disabled={saving}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button variant="hero" onClick={() => void handleStepThreeNext()} disabled={saving || Boolean(autoSkipMessage)}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Next
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <div className="space-y-2 text-center">
                      <h2 className="text-2xl font-heading font-bold text-foreground">Almost done, a bit about you</h2>
                      <p className="text-sm text-muted-foreground">These details improve your recommendations and local store links.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="full-name">Your name</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Pratik Brahmapurkar"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Where do you live?</Label>
                      <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COUNTRY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.flag} {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Your birthday</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Select value={birthday.month || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, month: value === "__empty" ? "" : value }))}>
                          <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty">Month</SelectItem>
                            {monthOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={birthday.day || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, day: value === "__empty" ? "" : value }))}>
                          <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty">Day</SelectItem>
                            {dayOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={birthday.year || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, year: value === "__empty" ? "" : value }))}>
                          <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty">Year</SelectItem>
                            {yearOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">Optional. Used for birthday reminders later.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>What kind of gifts do you usually give?</Label>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {GIFT_STYLE_OPTIONS.map((option) => {
                          const active = giftStyle.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => toggleGiftStyle(option.value)}
                              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                                active
                                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                                  : "border-border bg-card text-foreground hover:bg-muted/40"
                              }`}
                            >
                              <span className="block text-xl">{option.emoji}</span>
                              <span className="mt-2 block text-sm font-medium">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => void handleBack()} disabled={saving}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button variant="hero" onClick={() => void handleStepFourNext()} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Next
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6 text-center">
                    <div className="text-5xl">🎉</div>

                    <div className="space-y-2">
                      <h2 className="text-3xl font-heading font-bold text-foreground">
                        You're all set{welcomeName ? `, ${welcomeName}` : ""}!
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Your account is ready. The next step is the first real gift flow.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-left">
                      {createdRecipient ? (
                        <div className="flex items-center gap-3 text-sm text-foreground">
                          <span>✅</span>
                          <span>{createdRecipient.name} added to your people</span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3 text-sm text-foreground">
                        <span>✅</span>
                        <span>{creditsBalance} credits ready, no card needed</span>
                      </div>
                      {countryMeta ? (
                        <div className="flex items-center gap-3 text-sm text-foreground">
                          <span>✅</span>
                          <span>Store links matched to {countryMeta.flag} {countryMeta.label}</span>
                        </div>
                      ) : null}
                      {onboardingBonusEnabled ? (
                        <div className="flex items-center gap-3 text-sm text-foreground">
                          <span>🎁</span>
                          <span>Onboarding bonus available when enabled</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Profile completion: {completionPreview}%
                    </div>

                    <div className="space-y-3">
                      <Button
                        variant="hero"
                        className="w-full"
                        onClick={() => navigate(createdRecipient ? `/gift-flow?recipient=${createdRecipient.id}` : "/gift-flow", { replace: true })}
                      >
                        {createdRecipient ? `Find a Gift for ${createdRecipient.name}` : "Find a Gift"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button variant="heroGhost" className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
                        Go to Dashboard
                      </Button>
                    </div>
                  </div>
                )}

                {step < 5 ? (
                  <div className="mt-6 text-center text-xs text-muted-foreground">
                    Step {step} of 5: {ONBOARDING_STEP_LABELS[step as keyof typeof ONBOARDING_STEP_LABELS]}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick up where you left off?</DialogTitle>
            <DialogDescription>
              You were on Step {resumeStep} ({ONBOARDING_STEP_LABELS[resumeStep as keyof typeof ONBOARDING_STEP_LABELS]}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResumeDialog(false);
                setOnboardingState(defaultOnboardingState);
                setSelectedAudience([]);
                setGiftStyle([]);
                setStep(1);
                void persistUserState({}, defaultOnboardingState);
              }}
            >
              Start Over
            </Button>
            <Button
              variant="hero"
              onClick={() => {
                setShowResumeDialog(false);
                setStep(resumeStep);
                stepStartedAtRef.current = Date.now();
                trackEvent("onboarding_resumed", { resumed_from_step: resumeStep });
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
