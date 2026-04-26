import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown, Globe2, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BUDGET_CHIPS, SUPPORTED_COUNTRIES } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";

interface StepBudgetProps {
  budgetMin: number | null;
  budgetMax: number | null;
  onBudgetChange: (min: number, max: number) => void;
  isCrossBorder: boolean;
  recipientCountry: string | null;
  relationship: string | null;
  userCountry?: string;
  onContinue: () => void;
  onBack: () => void;
}

interface BudgetInsightResult {
  text: string;
  variant: "amber" | "sky" | "default";
}

function getBudgetInsight(min: number, max: number, relationship: string | null): BudgetInsightResult {
  if (relationship === "partner" && max <= 30) {
    return {
      text: "This range works best if the gift feels personal or experiential, not generic.",
      variant: "amber",
    };
  }
  if ((relationship === "boss" || relationship === "colleague") && min >= 100) {
    return {
      text: "This is generous for a professional relationship. Make sure it still feels appropriate.",
      variant: "sky",
    };
  }
  if (relationship === "new_relationship" && max <= 50) {
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
  isCrossBorder,
  recipientCountry,
  relationship,
  userCountry,
  onContinue,
  onBack,
}: StepBudgetProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const activeCountry = SUPPORTED_COUNTRIES.find((country) => country.code === recipientCountry);

  const budgetInsight = useMemo(() => {
    if (budgetMin == null || budgetMax == null) return null;
    return getBudgetInsight(budgetMin, budgetMax, relationship);
  }, [budgetMax, budgetMin, relationship]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-[calc(100svh-8rem)] md:h-auto"
    >
      <div className="flex-1 space-y-8 md:pb-8 overflow-y-auto px-1 py-1 scrollbar-hide">
        <div className="space-y-3">
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">3</span>
            Budget Band
          </motion.p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-5xl text-balance">
            What&apos;s your budget?
          </h1>
          <p className="text-base text-muted-foreground md:text-lg text-balance max-w-xl">
            Pick a budget band or set a custom range. We&apos;ll find amazing gifts within these limits.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BUDGET_CHIPS.map((chip) => {
            const isSelected = budgetMin === chip.min && budgetMax === chip.max;
            return (
              <button
                key={chip.label}
                type="button"
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-5 text-center transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
                )}
                onClick={() => onBudgetChange(chip.min, chip.max)}
              >
                <span className={cn(
                  "text-lg font-bold tracking-tight",
                  isSelected ? "text-primary" : "text-foreground"
                )}>
                  {chip.label}
                </span>
                {isSelected && (
                  <motion.div
                    layoutId="budget-chip-active"
                    className="absolute inset-0 rounded-2xl border-2 border-primary"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 px-3 py-1.5 rounded-full -ml-3">
            Set a custom range
            <ChevronDown className={cn("h-4 w-4 transition-transform", customOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <Card className="border-border shadow-sm overflow-hidden rounded-2xl">
              <CardContent className="grid gap-6 p-6 md:grid-cols-2 bg-muted/10">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground">Minimum</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={budgetMin ?? ""}
                      onChange={(event) => onBudgetChange(Number(event.target.value || 0), budgetMax ?? Number(event.target.value || 0))}
                      className="pl-9 h-12 text-lg rounded-xl border-border/80 bg-background shadow-sm hover:border-primary/30 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground">Maximum</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      type="number"
                      min={budgetMin ?? 0}
                      value={budgetMax ?? ""}
                      onChange={(event) => onBudgetChange(budgetMin ?? 0, Number(event.target.value || 0))}
                      className="pl-9 h-12 text-lg rounded-xl border-border/80 bg-background shadow-sm hover:border-primary/30 focus-visible:ring-primary/20"
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
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className={cn(
                "flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm mt-4",
                insightStyles[budgetInsight.variant],
              )}>
                {(() => {
                  const Icon = insightIcons[budgetInsight.variant];
                  return <Icon className="mt-0.5 h-5 w-5 shrink-0" />;
                })()}
                <p className="leading-relaxed">{budgetInsight.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cross-border mode notice */}
        {isCrossBorder && activeCountry && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-5 py-4 text-sm font-medium text-sky-900 shadow-sm">
            <span className="flex items-start gap-3">
              <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
              <span className="leading-relaxed">Cross-border mode is on. We&apos;ll match stores for {activeCountry.name} while keeping your budget in USD.</span>
            </span>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/80 px-4 py-4 backdrop-blur-xl sm:flex-row md:-mx-6 md:px-0 md:bg-transparent md:border-none md:backdrop-blur-none mt-auto">
        <Button type="button" variant="outline" className="h-14 sm:w-32 rounded-xl shadow-sm bg-background" onClick={onBack}>
          <ArrowLeft className="mr-2 h-5 w-5" />
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-14 w-full rounded-xl text-base shadow-sm font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
          disabled={budgetMin == null || budgetMax == null || budgetMax < budgetMin}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
