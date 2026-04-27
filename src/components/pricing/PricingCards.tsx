import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_CONFIG, type PlanKey } from "@/lib/plans";
import { WaitlistForm } from "@/components/pricing/WaitlistForm";
import { WaitlistConfirmation } from "@/components/pricing/WaitlistConfirmation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PricingCardsProps {
  currentPlan?: PlanKey;
  highlightPlan?: PlanKey;
  onBuyClick?: (slug: string) => void;
  compact?: boolean;
  source?: string;
}

export function PricingCards({
  currentPlan = "spark",
  compact = false,
  onBuyClick,
  source = "plans_page",
}: PricingCardsProps) {
  const [joined, setJoined] = useState<{ position: number; email?: string; already_joined?: boolean } | null>(null);
  const plans: PlanKey[] = ["spark", "pro"];

  return (
    <TooltipProvider delayDuration={150}>
    <div className="mx-auto w-full max-w-5xl">
      <div className={cn("grid items-stretch gap-6", compact ? "md:grid-cols-2" : "md:grid-cols-2")}>
        {plans.map((slug) => {
          const plan = PLAN_CONFIG[slug];
          const isCurrent = currentPlan === slug;
          const isPro = slug === "pro";

          return (
            <div
              key={slug}
              className={cn(
                "flex h-full flex-col rounded-lg border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
                isPro ? "border-amber-300 bg-amber-50/40 hover:border-amber-400" : "border-border hover:border-amber-200",
              )}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading text-2xl font-bold text-foreground">
                    {plan.name} {plan.emoji}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                </div>
                {plan.isComingSoon ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="cursor-help bg-amber-500 text-amber-950 hover:bg-amber-400">Coming Soon</Badge>
                    </TooltipTrigger>
                    <TooltipContent>Join the waitlist and we will notify you before Pro launches.</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>

              <div className="mb-6">
                <span className="font-heading text-4xl font-bold text-foreground">
                  {plan.price === 0 ? "Free" : `$${plan.price.toFixed(2)}`}
                </span>
                {plan.price > 0 ? <span className="text-sm text-muted-foreground">/month</span> : null}
              </div>

              <ul className="mb-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="group flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success transition-transform group-hover:scale-110" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="rounded-md border border-border bg-background py-2.5 text-center text-sm font-medium text-muted-foreground">
                  Current Plan
                </div>
              ) : !isPro ? (
                <div className="rounded-md border border-border bg-background py-2.5 text-center text-sm font-medium text-muted-foreground">
                  Free Plan
                </div>
              ) : joined ? (
                <WaitlistConfirmation position={joined.position} email={joined.email} alreadyJoined={joined.already_joined} />
              ) : onBuyClick ? (
                <Button className="w-full" onClick={() => onBuyClick(slug)}>
                  Join Pro Waitlist
                </Button>
              ) : (
                <WaitlistForm source={source} compact onJoined={setJoined} />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3 pb-4 pt-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm">
          <Sparkles className="h-4 w-4 text-[#D4A04A]" />
          All users get Signal Check, AI message drafts, confidence scores, and all store links.
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Spark includes 15 free credits every month. Pro removes limits when it launches.
        </p>
        <Button variant="link" className="text-primary" asChild>
          <a href="/settings">Refer a friend to earn 1 free credit instantly</a>
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}

export default PricingCards;
