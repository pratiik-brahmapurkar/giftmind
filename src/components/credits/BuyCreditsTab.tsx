import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, Coins, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Starter",
    priceINR: 249,
    priceUSD: 2.99,
    credits: 25,
    validity: "30 days",
    perCreditINR: 9.96,
    perCreditUSD: 0.12,
    originalPerCreditINR: null as number | null,
    originalPerCreditUSD: null as number | null,
    savePill: null as string | null,
    features: [
      "25 gift recommendations",
      "Confidence scores",
      "Buy links",
      "30-day access",
    ],
    dark: false,
    highlighted: false,
    badge: null as string | null,
  },
  {
    name: "Popular",
    priceINR: 499,
    priceUSD: 5.99,
    credits: 75,
    validity: "60 days",
    perCreditINR: 6.65,
    perCreditUSD: 0.08,
    originalPerCreditINR: 9.96,
    originalPerCreditUSD: 0.12,
    savePill: "Save 33%",
    features: [
      "75 gift recommendations",
      "Signal interpretation",
      "Cultural insights",
      "Priority support",
      "60-day access",
    ],
    dark: false,
    highlighted: true,
    badge: "Best Value ⭐",
  },
  {
    name: "Pro",
    priceINR: 1299,
    priceUSD: 15.99,
    credits: 200,
    validity: "90 days",
    perCreditINR: 6.5,
    perCreditUSD: 0.08,
    originalPerCreditINR: 9.96,
    originalPerCreditUSD: 0.12,
    savePill: "Save 35%",
    features: [
      "200 gift recommendations",
      "Full analysis reports",
      "Occasion calendar",
      "API access",
      "90-day access",
    ],
    dark: true,
    highlighted: false,
    badge: "Power Gifter 🚀",
  },
];

const FAQ_ITEMS = [
  {
    q: "What happens when credits expire?",
    a: "Unused credits expire after the validity period of your purchased package. You'll receive email reminders before they expire so you can use them. Expired credits cannot be recovered.",
  },
  {
    q: "Can I get a refund?",
    a: "Within 7 days of purchase, we offer a full refund for unused credit packages. After 7 days or once credits have been used, refunds are not available.",
  },
  {
    q: "How many credits does each feature use?",
    a: null, // Rendered as a table
  },
];

const CREDIT_USAGE = [
  { feature: "Gift session", cost: "1 credit" },
  { feature: "Signal Check", cost: "0.5 credit (Popular+ plans)" },
  { feature: "Batch mode", cost: "0.75 credit/recipient (Popular+ plans)" },
  { feature: "Regenerate within session", cost: "Free" },
  { feature: "Save recipient", cost: "Free" },
];

interface Props {
  credits: number;
}

const BuyCreditsTab = ({ credits }: Props) => {
  const [showUSD, setShowUSD] = useState(false);

  const balanceTint =
    credits === 0
      ? "border-destructive/30 bg-destructive/5"
      : credits <= 3
      ? "border-warning/30 bg-warning/5"
      : "border-border bg-card";

  return (
    <div className="space-y-8">
      {/* Balance card */}
      <Card className={cn("p-6", balanceTint)}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {credits <= 3 ? (
              <AlertTriangle className="w-6 h-6 text-warning" />
            ) : (
              <Coins className="w-6 h-6 text-primary" />
            )}
          </div>
          <div>
            <p className="text-3xl font-bold font-heading text-foreground">
              {credits} credits
            </p>
            {credits === 0 && (
              <p className="text-sm text-destructive font-medium">
                You're out of credits
              </p>
            )}
            {credits > 0 && credits <= 3 && (
              <p className="text-sm text-warning font-medium">Running low</p>
            )}
            {credits > 3 && (
              <p className="text-sm text-muted-foreground">
                15 expiring Apr 20 · 32 expiring May 15
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Currency toggle */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowUSD(!showUSD)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={!showUSD ? "text-primary font-semibold" : ""}>
            ₹ INR
          </span>
          <div
            className={cn(
              "w-10 h-5 rounded-full relative transition-colors",
              showUSD ? "bg-primary" : "bg-border"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full bg-card transition-transform",
                showUSD ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </div>
          <span className={showUSD ? "text-primary font-semibold" : ""}>
            $ USD
          </span>
        </button>
      </div>

      {/* Pricing cards */}
      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            className={cn(
              "rounded-2xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1",
              plan.dark
                ? "bg-foreground text-background"
                : plan.highlighted
                ? "bg-card border-2 border-primary shadow-xl relative z-10"
                : "bg-card card-shadow"
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
          >
            {plan.badge && (
              <div
                className={cn(
                  "inline-block self-center px-4 py-1 rounded-full text-xs font-semibold mb-4",
                  plan.dark
                    ? "bg-destructive/20 text-destructive"
                    : "bg-primary/10 text-primary"
                )}
              >
                {plan.badge}
              </div>
            )}

            <h3 className="text-xl font-bold mb-1 text-center">{plan.name}</h3>
            <p
              className={cn(
                "text-sm mb-2 text-center",
                plan.dark ? "text-background/60" : "text-muted-foreground"
              )}
            >
              {plan.credits} credits · {plan.validity}
            </p>

            <div className="mb-2 text-center">
              <span className="text-4xl font-bold font-mono tracking-tight">
                {showUSD ? `$${plan.priceUSD}` : `₹${plan.priceINR.toLocaleString("en-IN")}`}
              </span>
            </div>

            {/* Per-credit cost */}
            <div className="text-center mb-4 space-y-1">
              <div className="flex items-center justify-center gap-2 text-sm">
                {(showUSD ? plan.originalPerCreditUSD : plan.originalPerCreditINR) && (
                  <span
                    className={cn(
                      "line-through text-xs",
                      plan.dark ? "text-background/40" : "text-muted-foreground"
                    )}
                  >
                    {showUSD
                      ? `$${plan.originalPerCreditUSD}/credit`
                      : `₹${plan.originalPerCreditINR}/credit`}
                  </span>
                )}
                <span className={plan.dark ? "text-background/70" : "text-muted-foreground"}>
                  {showUSD
                    ? `$${plan.perCreditUSD}/credit`
                    : `₹${plan.perCreditINR}/credit`}
                </span>
              </div>
              {plan.savePill && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                  {plan.savePill}
                </Badge>
              )}
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      plan.dark ? "text-accent" : "text-primary"
                    )}
                  />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              variant={
                plan.dark ? "heroGhost" : plan.highlighted ? "hero" : "outline"
              }
              className={cn(
                "w-full rounded-lg py-5",
                plan.dark
                  ? "border-background/30 text-background hover:bg-background/10"
                  : ""
              )}
            >
              Buy Now
            </Button>
          </motion.div>
        ))}
      </div>

      {/* Info note */}
      <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
        Credits are used only when AI generates recommendations. Browsing,
        saving recipients, and reading blog posts is always free.
      </p>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h3 className="text-lg font-heading font-semibold text-foreground mb-4">
          Frequently Asked Questions
        </h3>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent>
                {item.a ? (
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium text-foreground">
                            Feature
                          </th>
                          <th className="text-left py-2 font-medium text-foreground">
                            Cost
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {CREDIT_USAGE.map((row) => (
                          <tr
                            key={row.feature}
                            className="border-b border-border/50"
                          >
                            <td className="py-2 text-foreground">
                              {row.feature}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {row.cost}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default BuyCreditsTab;
