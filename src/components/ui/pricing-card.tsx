import * as React from "react";
import { Check, Crown, Flame, Gift, Minus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface PricingCardProps {
  plan: "spark" | "thoughtful" | "confident" | "gifting-pro";
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
  let buttonVariant: "default" | "outline" | "hero" | "heroGhost" | "hero-outline" = "default";
  let buttonClassName = "";

  switch (plan) {
    case "spark":
      title = "Spark";
      tagline = "For modest, warm gifting";
      Icon = Flame;
      bgClass = "bg-background";
      borderClass = "border border-border";
      ctaText = "Start Free";
      buttonVariant = "outline";
      break;
    case "thoughtful":
      title = "Thoughtful";
      tagline = "For considered choices";
      Icon = Gift;
      bgClass = "bg-[#FAF5E8]";
      borderClass = "border border-[#EDD896]";
      badgeText = "Popular Entry";
      badgeClass = "bg-amber-400 px-3 py-1 text-amber-950";
      ctaText = "Get Thoughtful";
      buttonVariant = "hero";
      break;
    case "confident":
      title = "Confident";
      tagline = "Assured giving, anywhere";
      Icon = Star;
      bgClass = "bg-indigo-600 text-[#F2EDE4]";
      borderClass = "border border-transparent shadow-glow-indigo";
      badgeText = "Best Value";
      badgeClass = "bg-amber-400 px-3 py-1 text-amber-950";
      ctaText = "Get Confident";
      buttonVariant = "hero";
      break;
    case "gifting-pro":
      title = "Gifting Pro";
      tagline = "For absolute mastery";
      Icon = Crown;
      bgClass = "bg-[#1A1816] text-[#F2EDE4]";
      borderClass = "relative border border-[#403A31] overflow-hidden";
      ctaText = "Get Gifting Pro";
      buttonVariant = "hero-outline";
      buttonClassName = "border-[#D4A04A]/50 text-[#F2EDE4] hover:bg-[#D4A04A]/10";
      break;
  }

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300",
        bgClass,
        borderClass,
        plan === "confident" && "py-7",
        className,
      )}
      style={
        plan === "gifting-pro"
          ? {
              background: "linear-gradient(#1A1816, #1A1816) padding-box, linear-gradient(135deg, #D4A04A, #4C2A85) border-box",
              border: "1px solid transparent",
            }
          : undefined
      }
    >
      {badgeText ? (
        <div className={cn("absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full text-xs font-semibold shadow-sm", badgeClass)}>
          {badgeText}
        </div>
      ) : null}

      {plan === "spark" ? (
        <div className="absolute right-6 top-6 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 font-mono text-xs font-medium text-neutral-700">
          Free
        </div>
      ) : null}

      {plan === "gifting-pro" ? <div className="absolute inset-x-6 top-0 h-px bg-amber-300/70" aria-hidden="true" /> : null}

      <div className="mb-2 flex items-center gap-3">
        <Icon
          size={24}
          strokeWidth={1.5}
          className={cn(
            "text-amber-500",
            plan === "spark" && "text-neutral-500",
            (plan === "confident" || plan === "gifting-pro") && "text-amber-300",
          )}
        />
        <h3 className="font-heading text-xl font-semibold">{title}</h3>
      </div>

      <p className={cn("mb-6 font-body text-sm text-muted-foreground", plan === "confident" && "text-[#F2EDE4]/80", plan === "gifting-pro" && "text-neutral-400")}>
        {tagline}
      </p>

      <div className="mb-6 flex items-baseline">
        <span className={cn("mr-1 font-heading text-4xl font-bold", (plan === "confident" || plan === "gifting-pro") ? "text-amber-300" : "text-foreground")}>
          {price}
        </span>
        <span className={cn("font-body text-sm text-muted-foreground", plan === "confident" && "text-[#F2EDE4]/80", plan === "gifting-pro" && "text-neutral-400")}>
          {priceContext}
        </span>
      </div>

      <div className={cn("mb-6 border-b", plan === "confident" ? "border-[#F2EDE4]/15" : plan === "gifting-pro" ? "border-neutral-800" : "border-border")} />

      <ul className="mb-8 flex-1 space-y-4">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check size={18} strokeWidth={1.5} className={cn("mt-0.5 shrink-0 text-amber-500", plan === "confident" && "text-amber-300")} />
            <span className={cn("font-body text-sm", plan === "confident" ? "text-[#F2EDE4]" : plan === "gifting-pro" ? "text-neutral-300" : "text-neutral-700")}>
              {feature}
            </span>
          </li>
        ))}

        {disabledFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-3 opacity-50">
            <Minus size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-neutral-400" />
            <span className={cn("font-body text-sm", plan === "confident" ? "text-[#F2EDE4]/65" : "text-neutral-500")}>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {isCurrentPlan ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 py-2.5 text-center text-sm font-medium text-amber-700">
            <Check size={16} strokeWidth={1.5} />
            Current Plan
          </div>
        ) : (
          <Button variant={buttonVariant} className={cn("w-full", buttonClassName)} onClick={onSelect}>
            {ctaText}
          </Button>
        )}
      </div>
    </div>
  );
}
