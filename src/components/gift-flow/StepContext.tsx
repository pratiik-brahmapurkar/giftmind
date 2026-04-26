import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, MessageCircleHeart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import SoftPaywall from "@/components/credits/SoftPaywall";
import { formatCreditsValue } from "@/lib/credits";
import { CONTEXT_TAGS } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";

interface StepContextProps {
  specialContext: string;
  onSpecialContextChange: (text: string) => void;
  contextTags: string[];
  onContextTagsChange: (tags: string[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
  recipientName?: string | null;
  canUseSignalCheck?: boolean;
  isSignalCheckEnabled?: boolean;
  signalCheckCost?: number;
  creditsBalance?: number;
  giftGenerationUnits?: number;
}

export default function StepContext({
  specialContext,
  onSpecialContextChange,
  contextTags,
  onContextTagsChange,
  onContinue,
  onSkip,
  onBack,
  recipientName,
  canUseSignalCheck = false,
  isSignalCheckEnabled = true,
  signalCheckCost = 0.5,
  creditsBalance = 0,
  giftGenerationUnits = 2,
}: StepContextProps) {
  const toggleTag = (id: string) => {
    if (contextTags.includes(id)) {
      onContextTagsChange(contextTags.filter((tag) => tag !== id));
      return;
    }
    onContextTagsChange([...contextTags, id]);
  };

  const tagCount = contextTags.length;
  const signalCostLabel = Number.isInteger(signalCheckCost)
    ? `${signalCheckCost}`
    : signalCheckCost.toFixed(1).replace(/\.0$/, "");
  const canAffordGiftGeneration = creditsBalance >= giftGenerationUnits;
  const hasContext = specialContext.trim().length > 0 || contextTags.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Anything else we should know?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Context is optional, but it helps the AI avoid generic ideas.
        </p>
      </div>

      {/* Interactive toggle chips with animation (Item 12) */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {CONTEXT_TAGS.map((tag) => {
            const isSelected = contextTags.includes(tag.id);
            return (
              <motion.button
                key={tag.id}
                type="button"
                whileTap={{ scale: 0.95 }}
                animate={isSelected ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors duration-150",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/5",
                )}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.emoji} {tag.label}
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Live count (Item 12) */}
        <AnimatePresence>
          {tagCount > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 text-xs text-primary"
            >
              <Sparkles className="h-3 w-3" />
              <motion.span key={tagCount} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                {tagCount} tag{tagCount !== 1 ? "s" : ""} selected
              </motion.span>
              → richer results
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-2">
        <Textarea
          value={specialContext}
          onChange={(event) => onSpecialContextChange(event.target.value.slice(0, 300))}
          placeholder="Examples: they already own most gadgets, it needs to ship fast, I want this to feel personal but not romantic."
          className="min-h-[140px]"
        />
        <p className="text-right text-xs text-muted-foreground">{specialContext.length}/300</p>
      </div>

      {/* Signal Check teaser (Item 2) */}
      {isSignalCheckEnabled ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageCircleHeart className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">After results, try Signal Check</p>
                <p className="text-xs text-muted-foreground">
                  {recipientName
                    ? `Signal Check tells you what each gift says about your relationship with ${recipientName}.`
                    : "Signal Check tells you what each gift says about your relationship."}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {canUseSignalCheck
                    ? `${signalCostLabel} credits per analysis`
                    : "Available on Confident plan"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Credit deduction nudge (Item 1) — inline callout on Continue */}
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-amber-800">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>1 credit</strong> will be used when you continue.{" "}
            {creditsBalance > 0 && (
              <span className="text-amber-700/80">You have {formatCreditsValue(creditsBalance)} remaining.</span>
            )}
          </span>
        </p>
      </div>

      {!canAffordGiftGeneration ? <SoftPaywall compact title="You need 1 credit to generate new recommendations." /> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" className="min-h-12" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {!hasContext ? (
            <Button type="button" variant="outline" className="min-h-12" onClick={onSkip}>
              Skip context
            </Button>
          ) : null}
        <Button
          type="button"
          variant="hero"
          size="lg"
          className="group relative min-h-12 overflow-hidden"
          onClick={onContinue}
          disabled={!canAffordGiftGeneration}
        >
          {/* Subtle pulse glow */}
          <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Sparkles className="mr-2 h-4 w-4" />
            {hasContext ? "Continue with context" : "Continue"}
        </Button>
        </div>
      </div>
    </div>
  );
}
