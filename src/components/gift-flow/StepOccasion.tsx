import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, Clock, Sparkles, Zap } from "lucide-react";
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
          "group relative min-h-[126px] overflow-hidden rounded-3xl border p-4 text-left transition-all duration-150",
          isSelected
            ? "scale-[1.01] border-primary bg-primary text-primary-foreground shadow-[0_14px_35px_rgba(197,144,53,0.24)]"
            : "border-border/70 bg-white hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md",
        )}
        onClick={() => onSelectOccasion(occasion.id)}
      >
        <div className={cn(
          "flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition-colors",
          isSelected ? "bg-white/18" : "bg-[#FBF6EC]",
        )}>
          {occasion.emoji}
        </div>
        <div className="mt-4 text-sm font-semibold leading-tight">{occasion.label}</div>
        <p className={cn("mt-1 text-xs", isSelected ? "text-primary-foreground/75" : "text-muted-foreground")}>
          Tune the tone and gift signal
        </p>
        {isSelected ? (
          <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 2</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">What&apos;s the occasion?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Choose the moment you&apos;re buying for. This shapes tone, budget, and store matching.
        </p>
      </div>

      <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Common occasions</p>
            <p className="mt-1 text-sm text-muted-foreground">Most gift searches start here.</p>
          </div>
          <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COMMON_OCCASIONS.map(renderOccasionButton)}
        </div>
      </section>

      {/* Seasonal occasions — always visible */}
      {SEASONAL_OCCASIONS.length > 0 && (
        <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seasonal / Professional</p>
            <p className="mt-1 text-sm text-muted-foreground">Good for work, holidays, and social moments.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {SEASONAL_OCCASIONS.map(renderOccasionButton)}
          </div>
        </section>
      )}

      {/* Regional occasions — auto-expanded if recipient's country has them (Item 7) */}
      {regionalOccasions.length > 0 && country && (
        <section className="rounded-3xl border border-sky-200 bg-sky-50/70 p-4 md:p-5">
          <p className="text-sm font-semibold text-sky-950">
            {country.flag} Common in {country.name}
          </p>
          <p className="mt-1 text-sm text-sky-800/80">Regional occasions help the AI keep cultural context in mind.</p>
          <div className="flex flex-wrap gap-2">
            {regionalOccasions.map((occasion) => {
              const isSelected = selectedOccasion === occasion.id;
              return (
                <button
                  key={occasion.id}
                  type="button"
                  className={cn(
                    "mt-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-sky-200 bg-white text-sky-950 hover:border-primary/30",
                  )}
                  onClick={() => onSelectOccasion(occasion.id)}
                >
                  {occasion.emoji} {occasion.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Date picker with microcopy (Item 8) */}
      <Card className="rounded-3xl border-border/60 bg-card shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="occasion-date" className="text-sm font-semibold">
                When is it?
              </Label>
              <input
                id="occasion-date"
                type="date"
                value={occasionDate ?? ""}
                onChange={(event) => onOccasionDateChange(event.target.value || null)}
                className="h-12 w-full rounded-2xl border border-input bg-background px-3 text-sm"
              />
              {/* Microcopy explaining WHY (Item 8) */}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Helps us prioritize items that can arrive in time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2">
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

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur sm:flex-row md:-mx-6 md:px-6">
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
