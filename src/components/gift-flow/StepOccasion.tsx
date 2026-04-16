import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SUPPORTED_COUNTRIES, REGIONAL_OCCASIONS, UNIVERSAL_OCCASIONS } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";

interface StepOccasionProps {
  selectedOccasion: string | null;
  onSelectOccasion: (id: string) => void;
  occasionDate: string | null;
  onOccasionDateChange: (date: string | null) => void;
  targetCountry: string;
  onContinue: () => void;
  onBack: () => void;
}

/* ─── Group universal occasions for reduced cognitive load (Item 7) ─── */
const COMMON_IDS = new Set(["birthday", "anniversary", "valentines", "just_because", "wedding", "baby_shower", "housewarming", "graduation", "thank_you"]);
const SEASONAL_IDS = new Set(["christmas", "corporate", "secret_santa"]);

const COMMON_OCCASIONS = UNIVERSAL_OCCASIONS.filter((o) => COMMON_IDS.has(o.id));
const SEASONAL_OCCASIONS = UNIVERSAL_OCCASIONS.filter((o) => SEASONAL_IDS.has(o.id));

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const target = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export default function StepOccasion({
  selectedOccasion,
  onSelectOccasion,
  occasionDate,
  onOccasionDateChange,
  targetCountry,
  onContinue,
  onBack,
}: StepOccasionProps) {
  const country = SUPPORTED_COUNTRIES.find((item) => item.code === targetCountry);
  const regionalOccasions = REGIONAL_OCCASIONS[targetCountry] ?? [];
  const daysUntil = useMemo(() => getDaysUntil(occasionDate), [occasionDate]);
  const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil < 3;

  const renderOccasionButton = (occasion: { id: string; emoji: string; label: string }) => {
    const isSelected = selectedOccasion === occasion.id;
    return (
      <button
        key={occasion.id}
        type="button"
        className={cn(
          "rounded-2xl border px-4 py-5 text-left transition-all duration-150",
          isSelected
            ? "scale-[1.01] border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
        )}
        onClick={() => onSelectOccasion(occasion.id)}
      >
        <div className="text-2xl">{occasion.emoji}</div>
        <div className="mt-3 text-sm font-medium">{occasion.label}</div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">What&apos;s the occasion?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Choose the moment you&apos;re buying for. This shapes tone, budget, and store matching.
        </p>
      </div>

      {/* Common occasions — always visible (Item 7) */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Common</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COMMON_OCCASIONS.map(renderOccasionButton)}
        </div>
      </div>

      {/* Seasonal occasions — always visible */}
      {SEASONAL_OCCASIONS.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seasonal / Professional</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {SEASONAL_OCCASIONS.map(renderOccasionButton)}
          </div>
        </div>
      )}

      {/* Regional occasions — auto-expanded if recipient's country has them (Item 7) */}
      {regionalOccasions.length > 0 && country && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            {country.flag} Common in {country.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {regionalOccasions.map((occasion) => {
              const isSelected = selectedOccasion === occasion.id;
              return (
                <button
                  key={occasion.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors duration-150",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/30",
                  )}
                  onClick={() => onSelectOccasion(occasion.id)}
                >
                  {occasion.emoji} {occasion.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date picker with microcopy (Item 8) */}
      <Card className="border-border/60">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="occasion-date" className="text-sm font-medium">
              When is it?
            </Label>
            <input
              id="occasion-date"
              type="date"
              value={occasionDate ?? ""}
              onChange={(event) => onOccasionDateChange(event.target.value || null)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
            {/* Microcopy explaining WHY (Item 8) */}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Helps us prioritize items that can arrive in time
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="occasion-date-unknown"
              checked={!occasionDate}
              onCheckedChange={(checked) => {
                if (checked) onOccasionDateChange(null);
              }}
            />
            <Label htmlFor="occasion-date-unknown" className="text-sm text-muted-foreground">
              I&apos;m not sure yet
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Urgency callout (Item C) */}
      <AnimatePresence>
        {isUrgent && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Short on time?</strong> We&apos;ll prioritize items available for fast delivery or instant gifting.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="min-h-12 sm:w-auto" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button type="button" variant="hero" size="lg" className="min-h-12 w-full" disabled={!selectedOccasion} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
