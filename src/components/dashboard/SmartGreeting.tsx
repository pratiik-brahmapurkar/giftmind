import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardSegment } from "@/hooks/useDashboardSegment";

const segmentCopy: Record<DashboardSegment, { title: string; description: string; cta: string }> = {
  new_user: {
    title: "Let's set up your gifting circle",
    description: "Add someone you care about so GiftMind can remember dates, interests, and gift history.",
    cta: "Add your first person",
  },
  exploring: {
    title: "You're all set to find your first gift",
    description: "Pick one of your saved people and get ranked gift ideas with confidence scores.",
    cta: "Find a Gift",
  },
  dormant: {
    title: "Welcome back to your gift list",
    description: "A few saved people and occasions may be ready for a fresh recommendation.",
    cta: "Find a Gift",
  },
  occasion_urgent: {
    title: "You have an occasion coming up",
    description: "Start with the most time-sensitive date and keep the gift decision moving.",
    cta: "Plan urgent gift",
  },
  in_progress: {
    title: "Pick up your gift search",
    description: "Resume your latest in-progress session before starting from scratch.",
    cta: "Resume session",
  },
  low_credits: {
    title: "Use your remaining credits carefully",
    description: "You still have enough context saved to make the next recommendation count.",
    cta: "Find a Gift",
  },
  active: {
    title: "Ready for the next thoughtful pick?",
    description: "Start a new recommendation, check upcoming dates, or revisit recent gift sessions.",
    cta: "Find a Gift",
  },
};

interface SmartGreetingProps {
  firstName: string;
  segment: DashboardSegment;
  onPrimaryAction: () => void;
}

export function SmartGreeting({ firstName, segment, onPrimaryAction }: SmartGreetingProps) {
  const copy = segmentCopy[segment];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          <Sparkles className="h-3.5 w-3.5" />
          GiftMind Dashboard
        </p>
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Hi {firstName}, {copy.title.charAt(0).toLowerCase() + copy.title.slice(1)}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{copy.description}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Recommendations include confidence scores
        </div>
      </div>

      <Button type="button" variant="hero" className="h-11 w-full md:w-auto" onClick={onPrimaryAction}>
        {copy.cta}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
