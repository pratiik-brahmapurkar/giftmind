import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Check, Crown, Flame, Gift, Star, Minus } from "lucide-react";

export interface PricingCardProps {
  plan: 'spark' | 'thoughtful' | 'confident' | 'gifting-pro';
  price: string;
  priceContext: string;
  features: string[];
  disabledFeatures?: string[];
  isRecommended?: boolean;
  isCurrentPlan?: boolean;
  onSelect: () => void;
  className?: string;
}

export function PricingCard({
  plan,
  price,
  priceContext,
  features,
  disabledFeatures = [],
  isRecommended,
  isCurrentPlan,
  onSelect,
  className,
}: PricingCardProps) {
  let title = "";
  let tagline = "";
  let Icon = Flame;
  let bgClass = "";
  let borderClass = "";
  let badgeText = "";
  let badgeClass = "";
  let ctaText = "";
  let buttonVariant: "default" | "outline" | "hero" = "default";
  let buttonProps = {};

  switch (plan) {
    case 'spark':
      title = "Spark";
      tagline = "For modest, warm gifting";
      Icon = Flame;
      bgClass = "bg-card";
      borderClass = "border border-border";
      badgeText = "Free";
      ctaText = "Start Free";
      buttonVariant = "outline";
      break;
    case 'thoughtful':
      title = "Thoughtful";
      tagline = "For considered choices";
      Icon = Gift;
      bgClass = "bg-[#FAF5E8]";
      borderClass = "border-2 border-[#E4C663]";
      badgeText = "Most Popular";
      badgeClass = "bg-amber-400 text-amber-950 px-3 py-1";
      ctaText = "Get Thoughtful";
      buttonVariant = "hero";
      break;
    case 'confident':
      title = "Confident";
      tagline = "Assured giving, anywhere";
      Icon = Star;
      bgClass = "bg-amber-400 text-amber-950";
      borderClass = "border-2 border-transparent shadow-[0_0_24px_rgba(76,42,133,0.15)] scale-[1.03]";
      badgeText = "Best Value";
      badgeClass = "bg-[#2A2724] text-[#F2EDE4] px-3 py-1";
      ctaText = "Get Confident";
      buttonVariant = "hero";
      buttonProps = { className: "bg-[#2A2724] text-[#F2EDE4] hover:bg-neutral-800" };
      break;
    case 'gifting-pro':
      title = "Gifting Pro";
      tagline = "For absolute mastery";
      Icon = Crown;
      bgClass = "bg-[#2A2724] text-[#F2EDE4]";
      borderClass = "border border-[#403A31] relative overflow-hidden";
      ctaText = "Go Pro";
      buttonVariant = "outline"; 
      buttonProps = { className: "border-[#403A31] hover:bg-neutral-800 text-[#F2EDE4]" };
      break;
  }

  return (
    <div 
      className={cn(
        "rounded-xl p-6 relative flex flex-col h-full transition-all duration-300", 
        bgClass, 
        borderClass,
        plan === 'confident' && "py-7 -my-1",
        className
      )}
      style={plan === 'gifting-pro' ? {
        background: 'linear-gradient(#2A2724, #2A2724) padding-box, linear-gradient(135deg, #D4A04A, #4C2A85) border-box',
        border: '1px solid transparent',
      } : {}}
    >
      {badgeText && plan !== 'spark' && (
        <div className={cn("absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold rounded-full shadow-sm z-10", badgeClass)}>
          {badgeText}
        </div>
      )}
      {plan === 'spark' && (
        <div className="absolute top-6 right-6 px-2.5 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-full text-xs font-medium font-mono">
          Free
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <Icon size={24} strokeWidth={1.5} className={cn("text-amber-500", plan === 'confident' && "text-amber-700", plan === "spark" && "text-neutral-500")} />
        <h3 className="font-heading text-xl font-semibold">{title}</h3>
      </div>
      <p className={cn("font-body text-sm text-muted-foreground mb-6", plan === 'confident' && "text-amber-900/80", plan === 'gifting-pro' && "text-neutral-400")}>
        {tagline}
      </p>

      <div className="mb-6 flex items-baseline">
        <span className={cn("font-heading font-bold text-4xl mr-1", plan === 'confident' ? "text-amber-950" : plan === 'gifting-pro' ? "text-amber-300" : "text-foreground")}>
          {price}
        </span>
        <span className={cn("font-body text-sm text-muted-foreground", plan === 'confident' && "text-amber-900/80")}>
          {priceContext}
        </span>
      </div>

      <div className={cn("border-b mb-6", plan === 'confident' ? "border-amber-500/30" : plan === 'gifting-pro' ? "border-neutral-800" : "border-border")} />

      <ul className="flex-1 space-y-4 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check size={18} strokeWidth={2} className={cn("text-amber-500 shrink-0 mt-0.5", plan === 'confident' && "text-amber-800")} />
            <span className={cn("font-body text-sm", plan === 'confident' ? "text-amber-950" : plan === 'gifting-pro' ? "text-neutral-300" : "text-neutral-700")}>
              {feature}
            </span>
          </li>
        ))}
        {disabledFeatures.map((feature, i) => (
          <li key={`disabled-${i}`} className="flex items-start gap-3 opacity-50">
            <Minus size={18} strokeWidth={2} className={cn("text-neutral-400 shrink-0 mt-0.5")} />
            <span className={cn("font-body text-sm", plan === 'confident' ? "text-amber-900/70" : plan === 'gifting-pro' ? "text-neutral-500" : "text-neutral-500")}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {isCurrentPlan ? (
          <div className="w-full py-2.5 text-center text-sm font-medium text-amber-700 bg-amber-50 rounded-md border border-amber-200 flex justify-center items-center gap-2">
            <Check size={16} strokeWidth={2} />
            Current Plan
          </div>
        ) : (
          <Button 
            variant={buttonVariant} 
            className="w-full" 
            onClick={onSelect}
            {...buttonProps}
          >
            {ctaText}
          </Button>
        )}
      </div>
    </div>
  );
}
