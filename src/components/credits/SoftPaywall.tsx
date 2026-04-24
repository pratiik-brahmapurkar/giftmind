import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { formatResetDate } from "@/lib/credits";

interface SoftPaywallProps {
  compact?: boolean;
  title?: string;
  detail?: string;
}

export default function SoftPaywall({
  compact = false,
  title,
  detail,
}: SoftPaywallProps) {
  const { resetDate, resetCountdownLabel, userPlan } = useCredits();
  const resetLabel = formatResetDate(resetDate);
  const isSpark = userPlan === "spark";

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50/80 ${compact ? "p-4" : "p-5"}`}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-amber-900">
          {title ?? (isSpark && resetLabel ? `You're out of credits until ${resetLabel}.` : "You're out of credits right now.")}
        </p>
        <p className="text-sm text-amber-800">
          {detail ?? (resetCountdownLabel || "Buy more credits to keep generating recommendations.")}
        </p>
        <p className="text-sm text-amber-700">Insights and saving memories are still free.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild size="sm">
          <Link to="/credits">
            Get unlimited sessions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Link to="/credits" className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 hover:underline">
          <Sparkles className="h-4 w-4" />
          View plans
        </Link>
      </div>
    </div>
  );
}
