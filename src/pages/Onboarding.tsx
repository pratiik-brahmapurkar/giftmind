import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, User, Sparkles, ShoppingBag, ArrowRight } from "lucide-react";

const steps = [
  {
    key: "welcome",
    title: "Welcome to GiftMind 🎁",
    description:
      "We don't just suggest gifts. We tell you WHY it's right, what it communicates to the person, and give you the confidence to stop second-guessing.",
  },
  {
    key: "how",
    title: "How it works",
    icons: [
      { icon: User, label: "Tell us about them" },
      { icon: Sparkles, label: "Get 3 confident picks" },
      { icon: ShoppingBag, label: "Buy from Amazon, Flipkart & more" },
    ],
  },
  {
    key: "credits",
    title: "You have 3 free credits 🎉",
    description:
      "Each credit = one complete gift session with personalized recommendations, confidence scores, and buy links.",
    sub: "No credit card needed to start.",
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("has_completed_onboarding")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.has_completed_onboarding) {
          navigate("/dashboard", { replace: true });
        } else {
          setLoading(false);
        }
      });
  }, [user, navigate]);

  const complete = async () => {
    if (user) {
      await supabase
        .from("profiles")
        .update({ has_completed_onboarding: true } as any)
        .eq("user_id", user.id);
    }
  };

  const skip = async () => {
    await complete();
    navigate("/dashboard", { replace: true });
  };

  const next = () => {
    if (step < steps.length - 1) {
      setDir(1);
      setStep((s) => s + 1);
    }
  };

  const handleFinish = async (dest: string) => {
    await complete();
    navigate(dest, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const current = steps[step];

  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary p-4 relative">
      {/* Skip */}
      <button
        onClick={skip}
        className="absolute top-6 right-6 text-sm text-primary-foreground/60 hover:text-primary-foreground/90 transition-colors"
      >
        Skip
      </button>

      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={current.key}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-card rounded-2xl shadow-xl p-8 md:p-10 text-center"
          >
            {/* Step 1 */}
            {step === 0 && (
              <>
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="w-20 h-20 mx-auto mb-6 rounded-2xl gradient-primary flex items-center justify-center"
                >
                  <Gift className="w-10 h-10 text-primary-foreground animate-wiggle" />
                </motion.div>
                <h2 className="text-2xl font-heading font-bold text-foreground mb-3">
                  {current.title}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {current.description}
                </p>
                <Button variant="hero" className="w-full mt-8" onClick={next}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}

            {/* Step 2 */}
            {step === 1 && (
              <>
                <h2 className="text-2xl font-heading font-bold text-foreground mb-8">
                  {current.title}
                </h2>
                <div className="flex items-start justify-center gap-4 md:gap-6">
                  {current.icons?.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.15 * i }}
                      className="flex flex-col items-center gap-2 flex-1"
                    >
                      <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                        <item.icon className="w-7 h-7 text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground leading-tight">
                        {item.label}
                      </span>
                      {i < 2 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 absolute hidden md:block" />
                      )}
                    </motion.div>
                  ))}
                </div>
                <Button variant="hero" className="w-full mt-8" onClick={next}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}

            {/* Step 3 */}
            {step === 2 && (
              <>
                <h2 className="text-2xl font-heading font-bold text-foreground mb-3">
                  {current.title}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed mb-1">
                  {current.description}
                </p>
                <p className="text-muted-foreground text-xs mb-8">
                  {current.sub}
                </p>
                <div className="space-y-3">
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={() => handleFinish("/gift-flow")}
                  >
                    Find My First Gift <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="heroGhost"
                    className="w-full"
                    onClick={() => handleFinish("/dashboard")}
                  >
                    Go to Dashboard
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? "bg-primary-foreground w-6"
                  : "bg-primary-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
