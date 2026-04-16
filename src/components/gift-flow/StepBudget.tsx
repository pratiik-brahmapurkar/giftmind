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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">What&apos;s your budget?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Pick a budget band or set a custom range. We&apos;ll stay inside it.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {BUDGET_CHIPS.map((chip) => {
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
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

      {/* Cross-border mode notice */}
      {isCrossBorder && activeCountry && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="inline-flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Cross-border mode is on. We&apos;ll match stores for {activeCountry.name} while keeping your budget in USD.
          </span>
        </div>
      )}

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
