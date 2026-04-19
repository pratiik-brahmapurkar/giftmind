import { Badge } from "@/components/ui/badge";
import { PricingCard } from "@/components/ui/pricing-card";
import { PLANS, PlanSlug } from "@/lib/geoConfig";
import { Sparkles } from "lucide-react";

interface PricingCardsProps {
  currentPlan?: PlanSlug;
  highlightPlan?: PlanSlug;
  onBuyClick: (slug: string) => void;
  compact?: boolean;
}

export function PricingCards({
  currentPlan = "spark",
  highlightPlan = "confident",
  onBuyClick,
  compact = false,
}: PricingCardsProps) {
  const planOrder: PlanSlug[] = compact
    ? ["thoughtful", "confident", "gifting-pro"]
    : ["spark", "thoughtful", "confident", "gifting-pro"];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className={`grid items-stretch gap-6 ${compact ? "lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
        {planOrder.map((slug) => {
          const plan = PLANS[slug];
          const priceLabel = slug === "spark" ? "Free" : `$${plan.price.toFixed(2)}`;
          const contextLabel = slug === "spark" ? "to start" : `per ${plan.credits} sessions`;

          return (
            <PricingCard
              key={slug}
              plan={slug}
              price={priceLabel}
              priceContext={contextLabel}
              features={plan.features}
              disabledFeatures={plan.lockedFeatures.map((item) => item.text)}
              isRecommended={highlightPlan === slug}
              isCurrentPlan={currentPlan === slug}
              onSelect={() => onBuyClick(slug)}
            />
          );
        })}
      </div>

      <div className="space-y-4 pb-8 pt-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm">
          <Sparkles className="h-4 w-4 text-[#D4A04A]" />
          All plans include: AI recommendations · Confidence scores · Regional store links
        </div>
        <p className="flex items-center justify-center gap-2 text-sm font-bold tracking-wide text-[#6F5326]">
          <span className="inline-block text-xl drop-shadow-sm">🎁</span>
          Start with 3 free credits on Spark — no card needed
        </p>
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200/50 bg-gray-50 px-4 py-1.5 text-xs font-medium text-gray-500">
          <Badge variant="secondary" size="sm" className="rounded-full border-none bg-[#00457C]/10 text-[#00457C]">
            PayPal
          </Badge>
          All prices in USD. PayPal accepts cards from 200+ countries.
        </div>
      </div>
    </div>
  );
}

export default PricingCards;
