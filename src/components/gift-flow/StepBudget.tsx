import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  BUDGET_PRESETS_BY_CURRENCY,
  CURRENCIES,
  SUPPORTED_COUNTRIES,
  detectUserCountry,
  type BudgetCurrencyKey,
  type BudgetPreset,
} from "./constants";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StepBudgetProps {
  min: number;
  max: number;
  currency: string;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  onCurrencyChange: (v: string) => void;
  recipientRelationship?: string;
  recipientCountry?: string;
}

/* ─── Budget insight logic ─── */
function getBudgetInsight(
  min: number,
  max: number,
  currency: string,
  relationship?: string
): string | null {
  // Normalize thresholds per currency
  const isLow =
    (currency === "INR" && max <= 500) ||
    (currency === "USD" && max <= 15) ||
    (currency === "EUR" && max <= 10) ||
    (currency === "GBP" && max <= 10) ||
    (currency === "AED" && max <= 50) ||
    (currency === "CAD" && max <= 20) ||
    (currency === "AUD" && max <= 20) ||
    (currency === "SGD" && max <= 20);

  const isHigh =
    (currency === "INR" && min >= 5000) ||
    (currency === "USD" && min >= 100) ||
    (currency === "EUR" && min >= 100) ||
    (currency === "GBP" && min >= 75) ||
    (currency === "AED" && min >= 400) ||
    (currency === "CAD" && min >= 150) ||
    (currency === "AUD" && min >= 150) ||
    (currency === "SGD" && min >= 150);

  const isVeryHigh =
    (currency === "INR" && min >= 10000) ||
    (currency === "USD" && min >= 200) ||
    (currency === "EUR" && min >= 200) ||
    (currency === "GBP" && min >= 150) ||
    (currency === "AED" && min >= 750) ||
    (currency === "CAD" && min >= 250) ||
    (currency === "AUD" && min >= 300) ||
    (currency === "SGD" && min >= 250);

  const isMidLow =
    (currency === "INR" && min >= 500 && max <= 1500) ||
    (currency === "USD" && min >= 15 && max <= 30) ||
    (currency === "EUR" && min >= 10 && max <= 30) ||
    (currency === "GBP" && min >= 10 && max <= 25);

  if (isLow && relationship === "partner") {
    return "💡 For a partner, consider experiential gifts in this range — they communicate more than material items.";
  }
  if (isHigh && (relationship === "colleague" || relationship === "boss")) {
    return "💡 This is generous for a colleague. A moderate range is typical for professional relationships.";
  }
  if (isMidLow && relationship === "new_relationship") {
    return "💡 Perfect range for early relationships. Thoughtful but not overwhelming.";
  }
  if (isVeryHigh && (relationship === "friend" || relationship === "close_friend")) {
    return "💡 Very generous! Make sure the gift doesn't create an awkward reciprocity imbalance.";
  }
  return null;
}

const StepBudget = ({
  min,
  max,
  currency,
  onMinChange,
  onMaxChange,
  onCurrencyChange,
  recipientRelationship,
  recipientCountry,
}: StepBudgetProps) => {
  const currencyKey = (currency as BudgetCurrencyKey) || "INR";
  const presets = BUDGET_PRESETS_BY_CURRENCY[currencyKey] || BUDGET_PRESETS_BY_CURRENCY.INR;
  const currencyObj = CURRENCIES.find((c) => c.value === currency) || CURRENCIES[0];
  const [customOpen, setCustomOpen] = useState(false);
  const insight = getBudgetInsight(min, max, currency, recipientRelationship);

  const userCountry = detectUserCountry();
  const isCrossBorder = recipientCountry && recipientCountry !== userCountry;
  const recipientCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);

  const selectPreset = (preset: BudgetPreset) => {
    onMinChange(preset.min);
    onMaxChange(preset.max);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          What's your budget?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          We'll find the best options in this range
        </p>
      </div>

      {/* Currency selector */}
      <div>
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger className="w-auto h-9 rounded-lg border-border gap-2 px-3 text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.symbol} {c.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preset chips */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const isSelected = min === p.min && max === p.max;
          return (
            <button
              key={p.label}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-foreground border-border hover:border-primary/40"
              )}
              onClick={() => selectPreset(p)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Cross-border note */}
      {isCrossBorder && recipientCountryObj && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
          💡 Your budget is in {currencyObj.symbol} {currency}. We'll find gifts that match this range in {recipientCountryObj.name}'s local stores.
        </p>
      )}

      {/* Budget insight */}
      {insight && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-sm text-warning">
          {insight}
        </div>
      )}

      {/* Custom range */}
      <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Or set a custom range
          <ChevronDown className={cn("w-4 h-4 transition-transform", customOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Min</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencyObj.symbol}
                </span>
                <Input
                  type="number"
                  value={min}
                  onChange={(e) => onMinChange(Math.max(0, Number(e.target.value)))}
                  className="pl-7"
                  min={0}
                />
              </div>
            </div>
            <span className="text-muted-foreground mt-5">–</span>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Max</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencyObj.symbol}
                </span>
                <Input
                  type="number"
                  value={max}
                  onChange={(e) => onMaxChange(Math.max(min, Number(e.target.value)))}
                  className="pl-7"
                  min={min}
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default StepBudget;
