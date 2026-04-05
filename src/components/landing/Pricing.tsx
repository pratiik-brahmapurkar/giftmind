import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Rocket } from "lucide-react";

const INR_TO_USD = 0.012;

const plans = [
  {
    name: "Starter",
    priceINR: 249,
    credits: 25,
    validity: "30 days",
    features: ["25 gift recommendations", "Confidence scores", "Buy links", "Email support"],
    cta: "Get Started",
    style: "bg-card card-shadow",
    badge: null,
    icon: null,
  },
  {
    name: "Popular",
    priceINR: 499,
    credits: 75,
    validity: "60 days",
    features: ["75 gift recommendations", "Confidence scores", "Buy links", "Priority support", "Cultural insights"],
    cta: "Get Best Value",
    style: "bg-card border-2 border-primary shadow-xl scale-105 relative z-10",
    badge: "Best Value ⭐",
    icon: Sparkles,
  },
  {
    name: "Pro",
    priceINR: 1299,
    credits: 200,
    validity: "90 days",
    features: ["200 gift recommendations", "Confidence scores", "Buy links", "Priority support", "Cultural insights", "Gift history", "Occasion reminders"],
    cta: "Go Pro",
    style: "bg-foreground text-background",
    badge: "Power Gifter 🚀",
    icon: Rocket,
  },
];

const Pricing = () => {
  const [showUSD, setShowUSD] = useState(false);

  const formatPrice = (inr: number) => {
    if (showUSD) return `$${Math.round(inr * INR_TO_USD)}`;
    return `₹${inr.toLocaleString("en-IN")}`;
  };

  return (
    <section className="py-24 gradient-mesh">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Simple, Honest <span className="text-primary">Pricing</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-6">
            Pay per use. No subscriptions. No surprises.
          </p>

          {/* Toggle */}
          <button
            onClick={() => setShowUSD(!showUSD)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={!showUSD ? "text-primary font-semibold" : ""}>₹ INR</span>
            <div className={`w-10 h-5 rounded-full relative transition-colors ${showUSD ? "bg-primary" : "bg-border"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card transition-transform ${showUSD ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className={showUSD ? "text-primary font-semibold" : ""}>$ USD</span>
          </button>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              className={`rounded-2xl p-8 ${plan.style} transition-all duration-300 hover:-translate-y-1`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              {plan.badge && (
                <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                  {plan.badge}
                </div>
              )}

              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>

              <div className="mb-1">
                <span className="text-4xl font-bold font-mono">{formatPrice(plan.priceINR)}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.name === "Pro" ? "text-background/60" : "text-muted-foreground"}`}>
                {plan.credits} credits • {plan.validity}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className={`w-4 h-4 flex-shrink-0 ${plan.name === "Pro" ? "text-success" : "text-primary"}`} />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.name === "Pro" ? "heroGhost" : plan.name === "Popular" ? "hero" : "outline"}
                className={`w-full rounded-lg py-5 ${plan.name === "Pro" ? "border-background/30 text-background hover:bg-background/10" : ""}`}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="text-center mt-8 text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          🎁 Start with 3 free credits — no card needed
        </motion.p>
      </div>
    </section>
  );
};

export default Pricing;
