import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown, Globe2, Lightbulb, RefreshCw, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BUDGET_CHIPS, SUPPORTED_COUNTRIES, getCurrencySymbol } from "@/lib/geoConfig";
import { getShippingEstimate } from "./constants";
import { cn } from "@/lib/utils";

interface StepBudgetProps {
  budgetMin: number | null;
  budgetMax: number | null;
  onBudgetChange: (min: number, max: number) => void;
  currency: string;
  isCrossBorder: boolean;
  recipientCountry: string | null;
  relationship: string | null;
  userCountry?: string;
  onCurrencyChange?: (currency: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

interface BudgetInsightResult {
  text: string;
  variant: "amber" | "sky" | "default";
}

function getBudgetInsight(min: number, max: number, currency: string, relationship: string | null): BudgetInsightResult {
  if (relationship === "partner" && max <= (currency === "INR" ? 1500 : 30)) {
    return {
      text: "This range works best if the gift feels personal or experiential, not generic.",
      variant: "amber",
    };
  }
  if ((relationship === "boss" || relationship === "colleague") && min >= (currency === "INR" ? 5000 : 100)) {
    return {
      text: "This is generous for a professional relationship. Make sure it still feels appropriate.",
      variant: "sky",
    };
  }
  if (relationship === "new_relationship" && max <= (currency === "INR" ? 3000 : 50)) {
    return {
      text: "Good signal for something thoughtful without making the moment feel too intense.",
      variant: "default",
    };
  }
  return {
    text: "We'll use this range to keep recommendations realistic and culturally appropriate.",
    variant: "default",
  };
}

const insightStyles = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  default: "border-primary/20 bg-primary/5 text-foreground",
};

const insightIcons = {
  amber: Lightbulb,
  sky: Lightbulb,
  default: Sparkles,
};

export default function StepBudget({
  budgetMin,
  budgetMax,
  onBudgetChange,
  currency,
  isCrossBorder,
  recipientCountry,
  relationship,
  userCountry,
  onCurrencyChange,
  onContinue,
  onBack,
}: StepBudgetProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [currencyDismissed, setCurrencyDismissed] = useState(false);
  const chips = BUDGET_CHIPS[currency] ?? BUDGET_CHIPS.USD;
  const symbol = getCurrencySymbol(currency);
  const activeCountry = SUPPORTED_COUNTRIES.find((country) => country.code === recipientCountry);

  const budgetInsight = useMemo(() => {
    if (budgetMin == null || budgetMax == null) return null;
    return getBudgetInsight(budgetMin, budgetMax, currency, relationship);
  }, [budgetMax, budgetMin, currency, relationship]);

  // Shipping estimate (Item 9)
  const shippingEstimate = useMemo(() => {
    if (!isCrossBorder || !recipientCountry || !userCountry) return null;
    if (recipientCountry === userCountry) return null;
    return getShippingEstimate(userCountry, recipientCountry);
  }, [isCrossBorder, recipientCountry, userCountry]);

  // Currency mismatch guard (Item D)
  const recipientCurrency = useMemo(() => {
    if (!recipientCountry || !userCountry || recipientCountry === userCountry) return null;
    const recipientCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);
    if (!recipientCountryObj) return null;
    const recipientCurr = recipientCountryObj.currency;
    if (recipientCurr === currency) return null; // Already matching
    return recipientCurr;
  }, [recipientCountry, userCountry, currency]);

  const showCurrencyMismatch = recipientCurrency && !currencyDismissed && onCurrencyChange;

  const userCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === userCountry);
  const recipientCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">What&apos;s your budget?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Pick a budget band or set a custom range. We&apos;ll stay inside it.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => {
          const isSelected = budgetMin === chip.min && budgetMax === chip.max;
          return (
            <button
              key={chip.label}
              type="button"
              className={cn(
                "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:border-primary/30",
              )}
              onClick={() => onBudgetChange(chip.min, chip.max)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
        <CollapsibleTrigger className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Set a custom range
          <ChevronDown className={cn("h-4 w-4 transition-transform", customOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <Card className="border-border/60">
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Minimum</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
                  <Input
                    type="number"
                    min={0}
                    value={budgetMin ?? ""}
                    onChange={(event) => onBudgetChange(Number(event.target.value || 0), budgetMax ?? Number(event.target.value || 0))}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Maximum</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
                  <Input
                    type="number"
                    min={budgetMin ?? 0}
                    value={budgetMax ?? ""}
                    onChange={(event) => onBudgetChange(budgetMin ?? 0, Number(event.target.value || 0))}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Prominent budget insight with colored variant (Item 10) */}
      <AnimatePresence mode="wait">
        {budgetInsight && (
          <motion.div
            key={budgetInsight.text}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
              insightStyles[budgetInsight.variant],
            )}
          >
            {(() => {
              const Icon = insightIcons[budgetInsight.variant];
              return <Icon className="mt-0.5 h-4 w-4 shrink-0" />;
            })()}
            {budgetInsight.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shipping cost nudge (Item 9) */}
      {isCrossBorder && activeCountry && shippingEstimate && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Shipping to {activeCountry.name} typically adds{" "}
            <strong>
              {getCurrencySymbol(shippingEstimate.currency)}
              {shippingEstimate.min}–{getCurrencySymbol(shippingEstimate.currency)}
              {shippingEstimate.max}
            </strong>
            . Consider adjusting your max budget.
          </span>
        </div>
      )}

      {/* Cross-border mode notice (existing, only when no shipping estimate) */}
      {isCrossBorder && activeCountry && !shippingEstimate && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="inline-flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Cross-border mode is on. We&apos;ll match stores for {activeCountry.name} while keeping your budget in {currency}.
          </span>
        </div>
      )}

      {/* Currency mismatch guard (Item D) */}
      <AnimatePresence>
        {showCurrencyMismatch && recipientCountryObj && userCountryObj && recipientCurrency && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
          >
            <div className="flex items-start gap-2 text-sm text-foreground">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                You&apos;re in <strong>{userCountryObj.name}</strong>. Gift is for someone in{" "}
                <strong>{recipientCountryObj.name}</strong>. Should we use{" "}
                <strong>{recipientCurrency}</strong> instead?
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="hero"
                onClick={() => {
                  onCurrencyChange!(recipientCurrency);
                  setCurrencyDismissed(true);
                }}
              >
                Use {recipientCurrency}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCurrencyDismissed(true)}
              >
                Keep {currency}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="min-h-12 sm:w-auto" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          variant="hero"
          size="lg"
          className="min-h-12 w-full"
          disabled={budgetMin == null || budgetMax == null || budgetMax < budgetMin}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
