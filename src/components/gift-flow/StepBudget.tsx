import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BUDGET_PRESETS, CURRENCIES } from "./constants";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface StepBudgetProps {
  min: number;
  max: number;
  currency: string;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  onCurrencyChange: (v: string) => void;
  recipientRelationship?: string;
}

function getBudgetInsight(min: number, max: number, relationship?: string): string | null {
  if (max <= 500 && relationship === "partner") {
    return "💡 For a partner, consider experiential gifts in this range — they communicate more than material items.";
  }
  if (min >= 5000 && (relationship === "colleague" || relationship === "boss")) {
    return "💡 This is generous for a colleague. ₹1,500–3,000 is typical for professional relationships.";
  }
  return null;
}

const StepBudget = ({ min, max, currency, onMinChange, onMaxChange, onCurrencyChange, recipientRelationship }: StepBudgetProps) => {
  const currencyObj = CURRENCIES.find((c) => c.value === currency) || CURRENCIES[0];
  const [customOpen, setCustomOpen] = useState(false);
  const insight = getBudgetInsight(min, max, recipientRelationship);

  const selectPreset = (preset: typeof BUDGET_PRESETS[number]) => {
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

      {/* Preset chips */}
      <div className="flex flex-wrap gap-2">
        {BUDGET_PRESETS.map((p) => {
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
          {/* Currency toggle */}
          <div className="flex gap-2">
            {CURRENCIES.map((c) => (
              <Badge
                key={c.value}
                variant={currency === c.value ? "default" : "outline"}
                className="cursor-pointer text-xs px-3 py-1"
                onClick={() => onCurrencyChange(c.value)}
              >
                {c.symbol} {c.value}
              </Badge>
            ))}
          </div>

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
