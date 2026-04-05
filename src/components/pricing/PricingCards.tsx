import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Star, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

/* ─── Currency config ─── */
export type CurrencyKey = "INR" | "USD" | "GBP" | "AED";

interface CurrencyOption {
  key: CurrencyKey;
  flag: string;
  symbol: string;
  label: string;
}

const CURRENCIES: CurrencyOption[] = [
  { key: "INR", flag: "🇮🇳", symbol: "₹", label: "INR" },
  { key: "USD", flag: "🇺🇸", symbol: "$", label: "USD" },
  { key: "GBP", flag: "🇬🇧", symbol: "£", label: "GBP" },
  { key: "AED", flag: "🇦🇪", symbol: "د.إ", label: "AED" },
];

/* ─── Plan data ─── */
interface PlanFeature {
  text: string;
  subtext?: string;
  included: boolean;
  highlight?: boolean;
  gold?: boolean;
  upsell?: string;
}

interface Plan {
  key: "starter" | "popular" | "pro";
  name: string;
  subtitle: string;
  prices: Record<CurrencyKey, number>;
  /** Per-session cost per currency */
  perSession: Record<CurrencyKey, string>;
  /** Crossed-out old rate (null for starter) */
  crossedPerSession: Record<CurrencyKey, string> | null;
  savePill: string | null;
  badge: string | null;
  badgeStyle: string;
  features: PlanFeature[];
  cta: string;
  sessions: number;
}

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    subtitle: "5 people · 30 days",
    prices: { INR: 299, USD: 4.99, GBP: 3.99, AED: 18.99 },
    perSession: { INR: "₹9.97/session", USD: "$0.17/session", GBP: "£0.13/session", AED: "د.إ0.63/session" },
    crossedPerSession: null,
    savePill: null,
    badge: null,
    badgeStyle: "",
    sessions: 30,
    features: [
      { text: "30 gift sessions", included: true },
      { text: "Save up to 5 people", included: true },
      { text: "2 regenerations per session", included: true },
      { text: "Amazon links in your region", included: true },
      { text: "Confidence scores", included: true },
      { text: "Signal Check", included: false, upsell: "Popular ↑" },
      { text: "Batch mode", included: false, upsell: "Popular ↑" },
    ],
    cta: "Buy Starter",
  },
  {
    key: "popular",
    name: "Popular",
    subtitle: "15 people · 60 days",
    prices: { INR: 599, USD: 9.99, GBP: 7.99, AED: 36.99 },
    perSession: { INR: "₹7.49/session", USD: "$0.12/session", GBP: "£0.10/session", AED: "د.إ0.46/session" },
    crossedPerSession: { INR: "₹9.97", USD: "$0.17", GBP: "£0.13", AED: "د.إ0.63" },
    savePill: null, // dynamic per currency
    badge: "Best Value ⭐",
    badgeStyle: "bg-gradient-to-r from-[hsl(249,76%,64%)] to-[hsl(0,100%,70%)] text-white",
    sessions: 80,
    features: [
      { text: "80 gift sessions", included: true },
      { text: "Save up to 15 people", included: true },
      { text: "3 regenerations per session", included: true },
      { text: "All stores in your region", included: true, subtext: "Amazon, Etsy, and more — auto-matched to your country" },
      { text: 'Signal Check — "See what your gift says"', included: true, highlight: true },
      { text: "Batch mode for festivals", included: true, highlight: true },
      { text: "3 occasion reminders", included: true, highlight: true },
    ],
    cta: "Get Best Value",
  },
  {
    key: "pro",
    name: "Pro",
    subtitle: "Unlimited people · 90 days",
    prices: { INR: 1499, USD: 24.99, GBP: 19.99, AED: 89.99 },
    perSession: { INR: "₹6.66/session", USD: "$0.11/session", GBP: "£0.09/session", AED: "د.إ0.40/session" },
    crossedPerSession: { INR: "₹9.97", USD: "$0.17", GBP: "£0.13", AED: "د.إ0.63" },
    savePill: null,
    badge: "Power Gifter 🚀",
    badgeStyle: "border border-white/30 bg-transparent text-white",
    sessions: 225,
    features: [
      { text: "225 gift sessions", included: true },
      { text: "Unlimited people", included: true },
      { text: "Unlimited regenerations", included: true },
      { text: "All stores in your region", included: true },
      { text: "Signal Check", included: true },
      { text: "Batch mode for festivals", included: true },
      { text: "Unlimited occasion reminders", included: true },
      { text: "Priority AI — faster and smarter recommendations", included: true, gold: true },
      { text: "Export gift history", included: true, gold: true },
    ],
    cta: "Go Pro 🚀",
  },
];

const SAVE_PERCENT: Record<string, Record<CurrencyKey, string>> = {
  popular: { INR: "Save 25%", USD: "Save 30%", GBP: "Save 25%", AED: "Save 27%" },
  pro: { INR: "Save 33%", USD: "Save 35%", GBP: "Save 33%", AED: "Save 37%" },
};

/* ─── Helpers ─── */
function detectCurrency(): CurrencyKey {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz?.startsWith("Asia/Kolkata") || tz?.startsWith("Asia/Calcutta")) return "INR";
    if (tz?.startsWith("Europe/London")) return "GBP";
    if (tz?.startsWith("Asia/Dubai")) return "AED";
  } catch {}
  return "USD";
}

function formatPrice(amount: number, currency: CurrencyKey): string {
  const c = CURRENCIES.find((c) => c.key === currency)!;
  if (currency === "INR") return `${c.symbol}${amount.toLocaleString("en-IN")}`;
  if (currency === "AED") return `${c.symbol}${amount.toFixed(2)}`;
  return `${c.symbol}${amount.toFixed(2)}`;
}

/* ─── Animated number ─── */
function AnimatedPrice({ amount, currency }: { amount: number; currency: CurrencyKey }) {
  const [display, setDisplay] = useState(amount);
  const prevRef = useRef(amount);

  useEffect(() => {
    const from = prevRef.current;
    const to = amount;
    prevRef.current = to;
    if (from === to) return;
    const duration = 400;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [amount]);

  const rounded = currency === "INR" ? Math.round(display) : display;
  return <span>{formatPrice(rounded, currency)}</span>;
}

/* ─── Currency dropdown ─── */
function CurrencySelector({ value, onChange }: { value: CurrencyKey; onChange: (c: CurrencyKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = CURRENCIES.find((c) => c.key === value)!;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
      >
        <span>{selected.flag}</span>
        <span>{selected.symbol} {selected.label}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
          {CURRENCIES.map((c) => (
            <button
              key={c.key}
              onClick={() => { onChange(c.key); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors",
                c.key === value && "bg-accent font-semibold"
              )}
            >
              <span>{c.flag}</span>
              <span>{c.symbol} {c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Props ─── */
export interface PricingCardsProps {
  highlightPlan?: "starter" | "popular" | "pro";
  compact?: boolean;
  defaultCurrency?: CurrencyKey;
  onSelectPlan?: (planKey: string, currency: CurrencyKey) => void;
}

/* ─── Main component ─── */
export default function PricingCards({ highlightPlan, compact = false, defaultCurrency, onSelectPlan }: PricingCardsProps) {
  const [currency, setCurrency] = useState<CurrencyKey>(defaultCurrency ?? detectCurrency());

  return (
    <div className="space-y-8">
      {/* Currency selector */}
      <div className="flex justify-center">
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-end">
        {PLANS.map((plan, i) => {
          const isHighlighted = highlightPlan === plan.key;
          const isPopular = plan.key === "popular";
          const isPro = plan.key === "pro";
          const price = plan.prices[currency];
          const perSession = plan.perSession[currency];
          const crossed = plan.crossedPerSession?.[currency] ?? null;
          const save = SAVE_PERCENT[plan.key]?.[currency] ?? null;

          return (
            <motion.div
              key={plan.key}
              className={cn(
                "rounded-2xl p-6 flex flex-col relative",
                "min-h-[580px]",
                i === 0 && "order-2 md:order-1",
                i === 1 && "order-1 md:order-2",
                i === 2 && "order-3",
                isPro && "bg-[#1A1A2E] text-white border border-white/10",
                isPopular && "bg-card md:-translate-y-4",
                !isPro && !isPopular && "bg-card border border-border",
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

              {isHighlighted && (
                <div className="text-xs font-semibold text-primary text-center mb-1">
                  Recommended for you
                </div>
              )}

              {isPopular && (
                <p className="text-xs text-muted-foreground text-center mb-2">
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
                    key={currency}
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
                    <AnimatedPrice amount={price} currency={currency} />
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
                  isPro ? "text-[#FF6B6B]" : isPopular ? "text-primary" : "text-muted-foreground"
                )}>
                  {perSession}
                </span>
                {save && (
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[hsl(168,100%,36%)]/15 text-[hsl(168,100%,30%)]">
                    {save}
                  </span>
                )}
              </div>

              {/* Divider */}
              <div className={cn("h-px my-4", isPro ? "bg-white/15" : "bg-border")} />

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
                    <div>
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
                      {f.subtext && (
                        <p className="text-xs text-muted-foreground mt-0.5">{f.subtext}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => onSelectPlan?.(plan.key, currency)}
                className={cn(
                  "w-full rounded-lg font-semibold text-sm transition-colors",
                  plan.key === "starter" && "h-11 border-2 border-foreground text-foreground hover:bg-foreground hover:text-background",
                  plan.key === "popular" && "h-12 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg",
                  plan.key === "pro" && "h-11 border-2 border-white text-white hover:bg-white hover:text-[#1A1A2E]"
                )}
              >
                {plan.cta}
              </button>
            </motion.div>
          );
        })}
      </div>

      {!compact && (
        <>
          <motion.p
            className="text-center text-sm text-muted-foreground max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            All plans include: AI-powered recommendations · Cultural intelligence · Geo-targeted store links · Gift feedback tracking
          </motion.p>

          <motion.div
            className="text-center space-y-1"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <p className="text-[15px] text-primary font-medium">
              🎁 Start with 3 free credits — no card needed.
            </p>
            <Link to="/signup" className="text-sm text-primary hover:underline inline-block">
              Start Free →
            </Link>
            <p className="text-xs text-muted-foreground italic mt-2">
              Prices auto-adjusted for your region. Store links match your country — Amazon, Etsy, and 10+ stores worldwide.
            </p>
          </motion.div>
        </>
      )}
    </div>
  );
}

export { PLANS, CURRENCIES };
