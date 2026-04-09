import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { Gift, Users, Sparkles, ShoppingBag, ArrowRight, Coins } from "lucide-react";
import { trackEvent } from "@/lib/posthog";

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

/* ── Step 1: Bouncing gift box ── */
const GiftBoxAnim = () => (
  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl gradient-primary flex items-center justify-center animate-gift-bounce">
    <Gift className="w-10 h-10 text-primary-foreground" />
  </div>
);

/* ── Step 2: How it works icons ── */
const HowItWorksIcons = () => {
  const items = [
    { icon: Users, label: "Tell us about them" },
    { icon: Sparkles, label: "Get confident picks" },
    { icon: ShoppingBag, label: "Direct links to top stores in your country. Compare and buy instantly." },
  ];
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 * i }}
            className="flex flex-col items-center gap-2 w-28"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <item.icon className="w-7 h-7 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground leading-tight text-center max-w-[120px]">{item.label}</span>
          </motion.div>
          {i < 2 && (
            <ArrowRight className="hidden md:block w-4 h-4 text-muted-foreground/40 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
};

/* ── Step 3: Coin drop counter ── */
const CoinDrop = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timers = [0, 1, 2].map((i) =>
      setTimeout(() => setCount(i + 1), 300 * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 mb-4">
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 * i, type: "spring", stiffness: 300, damping: 20 }}
          >
            <Coins className="w-10 h-10 text-warning" />
          </motion.div>
        ))}
      </div>
      <motion.span
        className="text-3xl font-bold font-heading text-primary"
        key={count}
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring" }}
      >
        +{count}
      </motion.span>
      <p className="text-xs text-muted-foreground">Each credit = one complete gift session</p>
    </div>
  );
};

/* ── Main ── */
const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [loading, setLoading] = useState(true);
  const totalSteps = 3;

  useEffect(() => {
    if (!user) return;
    supabase
      .from("users")
      .select("has_completed_onboarding")
      .eq("id", user.id)
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
        .from("users")
        .update({ has_completed_onboarding: true } as any)
        .eq("id", user.id);
      trackEvent('onboarding_completed');
    }
  };

  const skip = async () => {
    await complete();
    navigate("/dashboard", { replace: true });
  };

  const next = () => {
    if (step < totalSteps - 1) {
      setDir(1);
      setStep((s) => s + 1);
    }
  };

  const handleFinish = async (dest: string) => {
    await complete();
    navigate(dest, { replace: true });
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -60 && step < totalSteps - 1) {
      setDir(1);
      setStep((s) => s + 1);
    } else if (info.offset.x > 60 && step > 0) {
      setDir(-1);
      setStep((s) => s - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #F8F7FF 0%, #FFFFFF 100%)" }}>
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{ background: "linear-gradient(180deg, #F8F7FF 0%, #FFFFFF 100%)" }}>
      {/* Skip */}
      <button onClick={skip}
        className="absolute top-6 right-6 text-xs text-muted-foreground hover:text-foreground transition-colors">
        Skip
      </button>

      <div className="w-full max-w-[480px]">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="bg-card rounded-2xl shadow-xl p-8 md:p-10 text-center cursor-grab active:cursor-grabbing"
          >
            {/* Step 1 — Welcome */}
            {step === 0 && (
              <>
                <GiftBoxAnim />
                <h2 className="text-2xl font-heading font-bold text-foreground mb-3">
                  Welcome to GiftMind 🎁
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We don't just suggest gifts. We tell you WHY it's right, what it communicates to the person, and give you the confidence to stop second-guessing.
                </p>
                <Button variant="hero" className="w-full mt-8" onClick={next}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}

            {/* Step 2 — How it works */}
            {step === 1 && (
              <>
                <h2 className="text-2xl font-heading font-bold text-foreground mb-8">
                  How it works
                </h2>
                <HowItWorksIcons />
                <Button variant="hero" className="w-full mt-8" onClick={next}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}

            {/* Step 3 — Credits */}
            {step === 2 && (
              <>
                <h2 className="text-2xl font-heading font-bold text-foreground mb-4">
                  You have 3 free credits 🎉
                </h2>
                <CoinDrop />
                <div className="flex flex-col gap-2 items-center mb-8">
                  <p className="text-muted-foreground text-xs">
                    No credit card needed to start.
                  </p>
                  <div className="bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    🌍 Works in 50+ countries with local store links
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    variant="hero"
                    className="w-full h-14 text-base"
                    style={{ boxShadow: "0 0 20px rgba(108,92,231,0.3)" }}
                    onClick={() => handleFinish("/gift-flow")}
                  >
                    Find My First Gift <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button variant="heroGhost" className="w-full" onClick={() => handleFinish("/dashboard")}>
                    Go to Dashboard
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
