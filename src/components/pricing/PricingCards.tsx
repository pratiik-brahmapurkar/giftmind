import { useState } from "react";
import { Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/components/pricing/WaitlistForm";
import { WaitlistConfirmation } from "@/components/pricing/WaitlistConfirmation";
import { cn } from "@/lib/utils";
import type { PlanKey } from "@/lib/plans";

type PricingFeature = {
  label: string;
  note: string;
};

type PricingPlan = {
  key: PlanKey;
  name: string;
  kicker: string;
  subtitle: string;
  price: string;
  priceNote?: string;
  badge?: string;
  intro?: PricingFeature;
  features: PricingFeature[];
  footnote?: string;
  cta: string;
  highlighted?: boolean;
};

interface PricingCardsProps {
  currentPlan?: PlanKey;
  highlightPlan?: PlanKey;
  onBuyClick?: (slug: string) => void;
  compact?: boolean;
  source?: string;
}

const plans: PricingPlan[] = [
  {
    key: "spark",
    name: "Spark ✨",
    kicker: "Best for one gift today",
    subtitle: "Find thoughtful gifts with simple AI gifting chat.",
    price: "Free",
    cta: "Current Plan",
    footnote: "Spark includes 30 monthly credit-units. Gift generation uses 2 units. Signal Check may also use credits.",
    features: [
      { label: "15 gift searches/month with Spark credits", note: "Monthly credits are shared across gift tools." },
      { label: "Basic AI gifting chat", note: "Chat for one gift occasion at a time." },
      { label: "Save up to 5 people", note: "Save basic details for 5 recipients." },
      { label: "2 redos per gift", note: "Regenerate suggestions twice per gift." },
      { label: "Gift confidence scores", note: "See how well each gift fits." },
      { label: "Smart Store Links", note: "Find or buy gifts from stores." },
      { label: "Recent gifts saved", note: "Revisit your saved gift sessions." },
      { label: "Signal Check with credits", note: "Uses Spark credits when available." },
      { label: "2 manual occasion reminders", note: "Add 2 important dates manually." },
    ],
  },
  {
    key: "pro",
    name: "Pro 🎯",
    kicker: "Best for remembering everyone",
    badge: "Coming Soon",
    subtitle: "AI that remembers people, occasions, past gifts, and what matters next.",
    price: "Launching Soon",
    priceNote: "Founder pricing for early users.",
    cta: "Join Pro Waitlist",
    highlighted: true,
    intro: {
      label: "Everything in Spark, plus:",
      note: "Includes all Spark features with higher limits and advanced intelligence.",
    },
    features: [
      { label: "Unlimited gift searches", note: "No monthly gift search limit." },
      { label: "Advanced relationship chat", note: "Chat using saved people and history." },
      { label: "Unlimited saved people", note: "Save unlimited recipients." },
      { label: "Unlimited redos", note: "Regenerate ideas without Spark limits." },
      { label: "Full Signal Check on every gift", note: "See meaning, fit, and possible risks." },
      { label: "Recipient Memory", note: "Remembers preferences, dates, and past gifts." },
      { label: "AI learns from feedback", note: "Improves suggestions from your feedback." },
      { label: "Auto birthday & occasion reminders", note: "Smart reminders for important moments." },
      { label: "Messages that sound like you", note: "Writes wishes in your chosen tone." },
      { label: "Batch gifting for festivals", note: "Plan gifts for many people at once." },
      { label: "Forever gift history", note: "Keep your complete gifting record." },
      { label: "Priority AI", note: "Higher-quality recommendations when available." },
    ],
  },
];

function InfoNote({ label, note }: PricingFeature) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`More information about ${label}`}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[#7A6F63] outline-none transition-colors hover:bg-[#E6D9C8]/70 hover:text-[#2A2724] focus-visible:ring-2 focus-visible:ring-[#D4A04A]/60"
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-52 max-w-[min(13rem,70vw)] -translate-x-1/2 rounded-lg bg-[#2A2724] px-3 py-2 text-xs font-normal leading-5 text-[#FAF7F2] shadow-xl sm:left-auto sm:right-0 sm:translate-x-0"
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}

function FeatureRow({ feature }: { feature: PricingFeature }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-5 text-[#2A2724]">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#3F8F7A]" aria-hidden="true" />
      <span className="min-w-0">
        {feature.label}
        <InfoNote {...feature} />
      </span>
    </li>
  );
}

function PricingCard({
  plan,
  currentPlan,
  onBuyClick,
  source,
}: {
  plan: PricingPlan;
  currentPlan: PlanKey;
  onBuyClick?: (slug: string) => void;
  source: string;
}) {
  const [joined, setJoined] = useState<{ position: number; email?: string; already_joined?: boolean } | null>(null);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const isCurrent = currentPlan === plan.key;
  const isPro = plan.key === "pro";

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-[22px] border p-5 shadow-[0_14px_34px_rgba(42,39,36,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(42,39,36,0.11)] sm:p-6",
        plan.highlighted
          ? "border-[#D4A04A]/70 bg-[#F7F0E4] ring-1 ring-[#D4A04A]/30"
          : "border-[#E6D9C8] bg-[#FFFDFC]",
      )}
    >
      <div className="mb-5 flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        <div className="min-w-0">
          <p className={cn(
            "mb-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
            plan.highlighted ? "border-[#D4A04A]/40 bg-[#D4A04A]/15 text-[#6B4716]" : "border-[#E6D9C8] bg-[#FAF7F2] text-[#7A6F63]",
          )}>
            {plan.kicker}
          </p>
          <h3 className="font-heading text-2xl font-semibold tracking-normal text-[#2A2724] min-[380px]:text-3xl">{plan.name}</h3>
          <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#7A6F63]">{plan.subtitle}</p>
        </div>
        {plan.badge ? (
          <span className="w-fit shrink-0 rounded-full border border-[#D4A04A]/40 bg-[#D4A04A]/20 px-2.5 py-1 text-[11px] font-semibold text-[#6B4716]">
            {plan.badge}
          </span>
        ) : null}
      </div>

      <div className="mb-5 rounded-2xl border border-[#E6D9C8]/80 bg-white/35 px-4 py-3">
        <div className="font-heading text-3xl font-semibold tracking-normal text-[#2A2724] sm:text-4xl">{plan.price}</div>
        {plan.priceNote ? <p className="mt-1.5 text-xs text-[#7A6F63]">{plan.priceNote}</p> : null}
      </div>

      {plan.intro ? (
        <p className="mb-3 rounded-xl bg-[#FFFDFC]/55 px-3 py-2 text-[13px] font-semibold text-[#2A2724]">
          {plan.intro.label}
          <InfoNote {...plan.intro} />
        </p>
      ) : null}

      <ul className="mb-6 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <FeatureRow key={feature.label} feature={feature} />
        ))}
      </ul>

      {plan.footnote ? (
        <p className="mb-4 rounded-xl border border-[#E6D9C8]/80 bg-[#FAF7F2]/80 px-3 py-2 text-xs leading-5 text-[#7A6F63]">
          {plan.footnote}
        </p>
      ) : null}

      {isPro && joined ? (
        <WaitlistConfirmation position={joined.position} email={joined.email} alreadyJoined={joined.already_joined} />
      ) : isPro && showWaitlistForm && !onBuyClick ? (
        <div className="[&_button]:w-full [&_button]:rounded-xl [&_button]:bg-[#D4A04A] [&_button]:font-bold [&_button]:text-[#2A2724] [&_button]:shadow-sm [&_button:hover]:bg-[#C28D32]">
          <WaitlistForm source={source} compact onJoined={setJoined} />
        </div>
      ) : (
        <Button
          type="button"
          disabled={!isPro && isCurrent}
          onClick={() => {
            if (!isPro) return;
            if (onBuyClick) {
              onBuyClick(plan.key);
              return;
            }
            setShowWaitlistForm(true);
          }}
          className={cn(
            "h-11 w-full rounded-xl text-sm font-bold transition-colors",
            isPro
              ? "bg-[#D4A04A] text-[#2A2724] shadow-sm hover:bg-[#C28D32]"
              : "border border-[#E6D9C8] bg-[#FAF7F2] text-[#7A6F63] hover:bg-[#F6EFE5] disabled:cursor-default disabled:opacity-100",
          )}
          variant={isPro ? "default" : "outline"}
        >
          {plan.cta}
        </Button>
      )}
    </article>
  );
}

export function PricingCards({
  currentPlan = "spark",
  onBuyClick,
  compact = false,
  source = "plans_page",
}: PricingCardsProps) {
  return (
    <section className="rounded-[22px] bg-[#FAF7F2] px-3 py-10 text-[#2A2724] sm:rounded-[28px] sm:px-6 sm:py-12 lg:px-8" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-4xl">
        <div className={cn("mx-auto mb-9 max-w-2xl text-center", compact && "mb-7")}>
          <h2 id="pricing-heading" className="font-heading text-3xl font-semibold tracking-normal text-[#2A2724] md:text-4xl">
            Choose your gifting assistant
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#7A6F63] md:text-base">
            Start free with simple AI gifting chat. Upgrade later for relationship memory, smart reminders, and deeper gift intelligence.
          </p>
        </div>

        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          {plans.map((plan) => (
            <PricingCard
              key={plan.key}
              plan={plan}
              currentPlan={currentPlan}
              onBuyClick={onBuyClick}
              source={source}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PricingCards;
