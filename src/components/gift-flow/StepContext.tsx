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
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">4</span>
            Added Context
          </motion.p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-5xl text-balance">
            Anything else we should know?
          </h1>
          <p className="text-base text-muted-foreground md:text-lg text-balance max-w-xl">
            Context is optional, but it helps the AI avoid generic ideas and find something truly unique.
          </p>
        </div>

        {/* Interactive toggle chips with animation */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2.5">
            {CONTEXT_TAGS.map((tag) => {
              const isSelected = contextTags.includes(tag.id);
              return (
                <motion.button
                  key={tag.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  animate={isSelected ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/50",
                  )}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="text-base">{tag.emoji}</span>
                  <span>{tag.label}</span>
                  <AnimatePresence>
                    {isSelected && (
                      <motion.span
                        initial={{ opacity: 0, width: 0, scale: 0, marginLeft: 0 }}
                        animate={{ opacity: 1, width: "auto", scale: 1, marginLeft: 4 }}
                        exit={{ opacity: 0, width: 0, scale: 0, marginLeft: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-center"
                      >
                        <Check className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Live count */}
          <AnimatePresence>
            {tagCount > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-4 py-2 border border-primary/10 w-fit">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-primary">
                    <motion.span key={tagCount} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                      {tagCount} tag{tagCount !== 1 ? "s" : ""} selected
                    </motion.span>
                    {" "}— richer results!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">Specific details</label>
          <div className="relative">
            <Textarea
              value={specialContext}
              onChange={(event) => onSpecialContextChange(event.target.value.slice(0, 300))}
              placeholder="Examples: they already own most gadgets, it needs to ship fast, I want this to feel personal but not romantic."
              className="min-h-[140px] resize-none rounded-2xl border-border/80 bg-card p-4 text-base shadow-sm placeholder:text-muted-foreground/60 hover:border-primary/30 focus-visible:ring-primary/20"
            />
            <div className="absolute bottom-4 right-4 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              {specialContext.length}/300
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Credit deduction nudge */}
          <div className={cn(
            "flex h-full flex-col justify-center rounded-2xl border px-5 py-5 shadow-sm transition-colors",
            canAffordGiftGeneration 
              ? "border-amber-200/60 bg-amber-50/50" 
              : "border-destructive/20 bg-destructive/5"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full mt-0.5",
                canAffordGiftGeneration ? "bg-amber-100/80 text-amber-600" : "bg-destructive/10 text-destructive"
              )}>
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <p className={cn("font-semibold", canAffordGiftGeneration ? "text-amber-900" : "text-destructive")}>
                  Generating gifts costs {formatCreditsValue(giftGenerationUnits)} credit{giftGenerationUnits !== 1 ? "s" : ""}
                </p>
                {creditsBalance > 0 ? (
                  <p className={cn("text-sm leading-snug", canAffordGiftGeneration ? "text-amber-800/80" : "text-destructive/80")}>
                    You currently have {formatCreditsValue(creditsBalance)} remaining in your account.
                  </p>
                ) : (
                  <p className="text-sm text-destructive/80">
                    You&apos;re out of credits.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Signal Check teaser */}
          {isSignalCheckEnabled ? (
            <Card className="overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm h-full hidden xl:block">
              <CardContent className="p-5 h-full flex flex-col justify-center">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary shadow-inner mt-0.5">
                    <MessageCircleHeart className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">After results, try Signal Check</p>
                    <p className="text-sm leading-snug text-muted-foreground">
                      {recipientName
                        ? `Signal Check tells you what each gift says about your relationship with ${recipientName}.`
                        : "Signal Check tells you what each gift says about your relationship."}
                    </p>
                    <div className="inline-flex items-center rounded-full bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur w-fit">
                      <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
                      {canUseSignalCheck
                        ? `${signalCostLabel} credits per analysis`
                        : "Available on Confident plan"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {isSignalCheckEnabled ? (
            <Card className="overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm xl:hidden">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary shadow-inner mt-0.5">
                    <MessageCircleHeart className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">After results, try Signal Check</p>
                    <p className="text-sm leading-snug text-muted-foreground">
                      {recipientName
                        ? `Signal Check tells you what each gift says about your relationship with ${recipientName}.`
                        : "Signal Check tells you what each gift says about your relationship."}
                    </p>
                    <div className="inline-flex items-center rounded-full bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur w-fit">
                      <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
                      {canUseSignalCheck
                        ? `${signalCostLabel} credits per analysis`
                        : "Available on Confident plan"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
        ) : null}

        {!canAffordGiftGeneration ? (
          <div className="pt-2">
            <SoftPaywall compact title="You need credits to generate new ideas." />
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-3 border-t bg-background/80 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-0 md:bg-transparent md:border-none md:backdrop-blur-none mt-auto">
        <Button type="button" variant="outline" className="h-14 sm:w-32 rounded-xl shadow-sm bg-background" onClick={onBack}>
          <ArrowLeft className="mr-2 h-5 w-5" />
          Back
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full sm:w-auto">
          {!hasContext ? (
            <Button type="button" variant="ghost" className="h-14 rounded-xl text-primary font-medium hover:bg-primary/5 hover:text-primary" onClick={onSkip}>
              Skip context
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="group relative h-14 rounded-xl text-base shadow-sm font-semibold sm:min-w-[200px] bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
            onClick={onContinue}
            disabled={!canAffordGiftGeneration}
          >
            {/* Subtle pulse glow */}
            <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sparkles className="mr-2 h-5 w-5" />
            {hasContext ? "Continue with context" : "Continue"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
