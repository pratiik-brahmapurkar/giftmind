import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BUDGET_CHIPS, SUPPORTED_COUNTRIES, getCurrencySymbol } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";

interface StepBudgetProps {
  budgetMin: number | null;
  budgetMax: number | null;
  onBudgetChange: (min: number, max: number) => void;
  currency: string;
  isCrossBorder: boolean;
  recipientCountry: string | null;
  relationship: string | null;
  onContinue: () => void;
  onBack: () => void;
}

function getBudgetInsight(min: number, max: number, currency: string, relationship: string | null) {
  if (relationship === "partner" && max <= (currency === "INR" ? 1500 : 30)) {
    return "This range works best if the gift feels personal or experiential, not generic.";
  }
  if ((relationship === "boss" || relationship === "colleague") && min >= (currency === "INR" ? 5000 : 100)) {
    return "This is generous for a professional relationship. Make sure it still feels appropriate.";
  }
  if (relationship === "new_relationship" && max <= (currency === "INR" ? 3000 : 50)) {
    return "Good signal for something thoughtful without making the moment feel too intense.";
  }
  return "We&apos;ll use this range to keep recommendations realistic and culturally appropriate.";
}

export default function StepBudget({
  budgetMin,
  budgetMax,
  onBudgetChange,
  currency,
  isCrossBorder,
  recipientCountry,
  relationship,
  onContinue,
  onBack,
}: StepBudgetProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const chips = BUDGET_CHIPS[currency] ?? BUDGET_CHIPS.USD;
  const symbol = getCurrencySymbol(currency);
  const activeCountry = SUPPORTED_COUNTRIES.find((country) => country.code === recipientCountry);

  const budgetInsight = useMemo(() => {
    if (budgetMin == null || budgetMax == null) return null;
    return getBudgetInsight(budgetMin, budgetMax, currency, relationship);
  }, [budgetMax, budgetMin, currency, relationship]);

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
                "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
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

      {budgetInsight && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {budgetInsight}
        </div>
      )}

      {isCrossBorder && activeCountry && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="inline-flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Cross-border mode is on. We&apos;ll match stores for {activeCountry.name} while keeping your budget in {currency}.
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
