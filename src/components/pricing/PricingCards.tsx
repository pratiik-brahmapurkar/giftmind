import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    subtitle: "5 people · 30 days",
    priceINR: 249,
    priceUSD: 2.99,
    perSessionINR: "₹9.96/session",
    perSessionUSD: "$0.12/session",
    crossedPerSession: null as string | null,
    crossedPerSessionUSD: null as string | null,
    savePill: null as string | null,
    badge: null as string | null,
    badgeStyle: "",
    features: [
      { text: "25 gift sessions", included: true, highlight: false, gold: false },
      { text: "Save up to 5 people", included: true, highlight: false, gold: false },
      { text: "2 regenerations per session", included: true, highlight: false, gold: false },
      { text: "Amazon + Flipkart links", included: true, highlight: false, gold: false },
      { text: "Confidence scores", included: true, highlight: false, gold: false },
      { text: "Signal Check", included: false, highlight: false, gold: false, upsell: "Popular ↑" },
      { text: "Batch mode", included: false, highlight: false, gold: false, upsell: "Popular ↑" },
    ],
    cta: "Buy Starter",
    variant: "starter" as const,
  },
  {
    key: "popular",
    name: "Popular",
    subtitle: "15 people · 60 days",
    priceINR: 499,
    priceUSD: 5.99,
    perSessionINR: "₹6.65/session",
    perSessionUSD: "$0.08/session",
    crossedPerSession: "₹9.96",
    crossedPerSessionUSD: "$0.12",
    savePill: "Save 33%",
    badge: "Best Value ⭐",
    badgeStyle: "bg-gradient-to-r from-[hsl(249,76%,64%)] to-[hsl(0,100%,70%)] text-white",
    features: [
      { text: "75 gift sessions", included: true, highlight: false, gold: false },
      { text: "Save up to 15 people", included: true, highlight: false, gold: false },
      { text: "3 regenerations per session", included: true, highlight: false, gold: false },
      { text: "All store links (Amazon, Flipkart, Myntra & more)", included: true, highlight: false, gold: false },
      { text: 'Signal Check \u2014 "See what your gift says"', included: true, highlight: true, gold: false },
      { text: "Batch mode for festivals", included: true, highlight: true, gold: false },
      { text: "3 occasion reminders", included: true, highlight: true, gold: false },
    ],
    cta: "Get Best Value",
    variant: "popular" as const,
  },
  {
    key: "pro",
    name: "Pro",
    subtitle: "Unlimited people · 90 days",
    priceINR: 1299,
    priceUSD: 14.99,
    perSessionINR: "₹6.50/session",
    perSessionUSD: "$0.07/session",
    crossedPerSession: "₹9.96",
    crossedPerSessionUSD: "$0.12",
    savePill: "Save 35%",
    badge: "Power Gifter 🚀",
    badgeStyle: "border border-white/30 bg-transparent text-white",
    features: [
      { text: "200 gift sessions", included: true, highlight: false, gold: false },
      { text: "Unlimited people", included: true, highlight: false, gold: false },
      { text: "Unlimited regenerations", included: true, highlight: false, gold: false },
      { text: "All store links", included: true, highlight: false, gold: false },
      { text: "Signal Check", included: true, highlight: false, gold: false },
      { text: "Batch mode for festivals", included: true, highlight: false, gold: false },
      { text: "Unlimited occasion reminders", included: true, highlight: false, gold: false },
      { text: "Priority AI (faster & smarter)", included: true, highlight: false, gold: true },
      { text: "Export gift history", included: true, highlight: false, gold: true },
    ],
    cta: "Go Pro 🚀",
    variant: "pro" as const,
  },
];

/* ─── Animated number ─── */
function AnimatedPrice({ value, prefix, showUSD }: { value: number; prefix: string; showUSD: boolean }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) return;

    const duration = 400;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);

  const formatted = showUSD
    ? `${prefix}${(display / 100).toFixed(2)}`
    : `${prefix}${display.toLocaleString("en-IN")}`;

  return <span>{formatted}</span>;
}

interface PricingCardsProps {
  /** Which plan to highlight with pulsing border in modal context */
  highlightPlan?: "starter" | "popular" | "pro";
  /** Hide the comparison/free rows (for modal use) */
  compact?: boolean;
}

export default function PricingCards({ highlightPlan, compact = false }: PricingCardsProps) {
  const [showUSD, setShowUSD] = useState(false);

  /* mobile order: popular first */
  const mobileOrder = [1, 0, 2]; // popular, starter, pro

  return (
    <div className="space-y-8">
      {/* Currency toggle */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowUSD(!showUSD)}
          className="inline-flex items-center gap-1 rounded-full bg-muted p-1 text-sm font-medium"
        >
          <span
            className={cn(
              "rounded-full px-4 py-1.5 transition-all duration-200",
              !showUSD ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            ₹ INR
          </span>
          <span
            className={cn(
              "rounded-full px-4 py-1.5 transition-all duration-200",
              showUSD ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            $ USD
          </span>
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-end">
        {PLANS.map((plan, i) => {
          const isHighlighted = highlightPlan === plan.key;
          const isPopular = plan.variant === "popular";
          const isPro = plan.variant === "pro";

          const priceRaw = showUSD ? Math.round(plan.priceUSD * 100) : plan.priceINR;
          const pricePrefix = showUSD ? "$" : "₹";
          const perSession = showUSD ? plan.perSessionUSD : plan.perSessionINR;
          const crossed = showUSD ? plan.crossedPerSessionUSD : plan.crossedPerSession;

          return (
            <motion.div
              key={plan.key}
              className={cn(
                "rounded-2xl p-6 flex flex-col relative",
                "min-h-[560px]",
                // mobile reorder
                i === 0 && "order-2 md:order-1",
                i === 1 && "order-1 md:order-2",
                i === 2 && "order-3",
                // variants
                isPro && "bg-[#1A1A2E] text-white border border-white/10",
                isPopular && "bg-card md:-translate-y-4",
                !isPro && !isPopular && "bg-card border border-border",
                // highlight for modal
                isHighlighted && "ring-2 ring-primary animate-pulse-glow"
              )}
              style={
                isPopular
                  ? {
                      background: "white",
                      border: "3px solid transparent",
                      backgroundClip: "padding-box",
                      boxShadow: "0 8px 32px rgba(108,92,231,0.15)",
                    }
                  : undefined
              }
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: isPopular ? -16 : 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              {/* Gradient border for popular */}
              {isPopular && (
                <div
                  className="absolute inset-0 rounded-2xl -z-10"
                  style={{
                    padding: "3px",
                    background: "linear-gradient(135deg, hsl(249 76% 64%), hsl(0 100% 70%))",
                    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
              )}

              {/* Badge */}
              {plan.badge && (
                <div className={cn(
                  "text-xs font-semibold rounded-full px-4 py-1 self-center mb-1",
                  isPopular && "absolute -top-3.5 left-1/2 -translate-x-1/2 z-10",
                  plan.badgeStyle
                )}>
                  {plan.badge}
                </div>
              )}

              {/* Highlighted label for modal */}
              {isHighlighted && (
                <div className="text-xs font-semibold text-primary text-center mb-1">
                  Recommended for you
                </div>
              )}

              {/* Mobile recommended label */}
              {isPopular && (
                <p className="text-xs text-muted-foreground text-center mb-2 md:block">
                  Most chosen by gifters
                </p>
              )}

              {/* Title */}
              <h3 className={cn(
                "text-2xl font-bold text-center font-heading",
                isPro ? "text-white" : "text-foreground"
              )}>
                {plan.name}
              </h3>

              <p className={cn(
                "text-sm text-center mb-3",
                isPro ? "text-white/60" : "text-muted-foreground"
              )}>
                {plan.subtitle}
              </p>

              {/* Price */}
              <div className="text-center mb-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={showUSD ? "usd" : "inr"}
                    className={cn(
                      "font-bold font-mono tracking-tight",
                      isPopular ? "text-[44px]" : "text-[40px]",
                      isPro ? "text-white" : "text-foreground"
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AnimatedPrice value={priceRaw} prefix={pricePrefix} showUSD={showUSD} />
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Per-session */}
              <div className="flex items-center justify-center gap-2 text-sm mb-1 flex-wrap">
                {crossed && (
                  <span className={cn("line-through text-xs", isPro ? "text-white/40" : "text-muted-foreground")}>
                    {crossed}
                  </span>
                )}
                <span className={cn(
                  "font-semibold text-sm",
                  isPro ? "text-[#FF6B6B]" : isPopular ? "text-primary" : (isPro ? "text-white/70" : "text-muted-foreground")
                )}>
                  {perSession}
                </span>
                {plan.savePill && (
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[hsl(168,100%,36%)]/15 text-[hsl(168,100%,30%)]">
                    {plan.savePill}
                  </span>
                )}
              </div>

              {/* Divider */}
              <div className={cn(
                "h-px my-4",
                isPro ? "bg-white/15" : "bg-border"
              )} />

              {/* Features */}
              <ul className="space-y-3 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2 text-sm">
                    {f.included ? (
                      f.gold ? (
                        <Star className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-400 fill-yellow-400" />
                      ) : (
                        <Check className={cn(
                          "w-4 h-4 flex-shrink-0 mt-0.5",
                          f.highlight ? "text-[hsl(168,100%,36%)]" : isPro ? "text-[#FF6B6B]" : "text-primary"
                        )} />
                      )
                    ) : (
                      <X className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground/50" />
                    )}
                    <span className={cn(
                      f.highlight && "font-semibold",
                      f.gold && "font-semibold",
                      !f.included && "text-muted-foreground/60"
                    )}>
                      {f.text}
                      {!f.included && f.upsell && (
                        <span className="ml-1.5 text-xs text-muted-foreground/40">{f.upsell}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.variant === "starter" && (
                <button className="w-full h-11 rounded-lg border-2 border-foreground text-foreground font-semibold text-sm transition-colors hover:bg-foreground hover:text-background">
                  {plan.cta}
                </button>
              )}
              {plan.variant === "popular" && (
                <button className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold text-sm transition-colors hover:bg-primary/90 shadow-md hover:shadow-lg">
                  {plan.cta}
                </button>
              )}
              {plan.variant === "pro" && (
                <button className="w-full h-11 rounded-lg border-2 border-white text-white font-semibold text-sm transition-colors hover:bg-white hover:text-[#1A1A2E]">
                  {plan.cta}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {!compact && (
        <>
          {/* Comparison row */}
          <motion.p
            className="text-center text-sm text-muted-foreground max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            All plans include: AI-powered recommendations · Cultural intelligence · Geo-targeted buy links · Feedback tracking
          </motion.p>

          {/* Free reminder */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <p className="text-base text-primary font-medium">
              🎁 Start with 3 free credits — 1 person, 14 days, no card needed.
            </p>
            <Link to="/signup" className="text-sm text-primary hover:underline mt-1 inline-block">
              Start Free →
            </Link>
          </motion.div>
        </>
      )}
    </div>
  );
}

export { PLANS };
