import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { BUDGET_PRESETS, CURRENCIES } from "./constants";
import { cn } from "@/lib/utils";

interface StepBudgetProps {
  min: number;
  max: number;
  currency: string;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  onCurrencyChange: (v: string) => void;
}

const StepBudget = ({ min, max, currency, onMinChange, onMaxChange, onCurrencyChange }: StepBudgetProps) => {
  const currencyObj = CURRENCIES.find((c) => c.value === currency) || CURRENCIES[0];

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

      {/* Preset chips */}
      <div className="flex flex-wrap gap-2">
        {BUDGET_PRESETS.map((p) => {
          const isSelected = min === p.min && max === p.max;
          return (
            <Badge
              key={p.label}
              variant={isSelected ? "default" : "outline"}
              className="cursor-pointer text-xs px-3 py-1.5"
              onClick={() => selectPreset(p)}
            >
              {p.label}
            </Badge>
          );
        })}
      </div>

      {/* Slider */}
      <div className="px-1">
        <Slider
          min={0}
          max={50000}
          step={500}
          value={[min, max]}
          onValueChange={([newMin, newMax]) => {
            onMinChange(newMin);
            onMaxChange(newMax);
          }}
          className="mt-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{currencyObj.symbol}0</span>
          <span>{currencyObj.symbol}50,000</span>
        </div>
      </div>

      {/* Custom inputs */}
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
    </div>
  );
};

export default StepBudget;
