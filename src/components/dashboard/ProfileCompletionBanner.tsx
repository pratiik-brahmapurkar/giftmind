import { useEffect, useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trackEvent } from "@/lib/posthog";

interface ProfileCompletionBannerProps {
  completionPercentage: number;
  sessionCount: number;
  missingFields: string[];
  onClick: () => void;
}

const DISMISS_KEY = "gm_profile_banner_dismissed_v2";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isDismissed() {
  const rawValue = localStorage.getItem(DISMISS_KEY);
  if (!rawValue) return false;

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp)) return rawValue === "true";

  return Date.now() - timestamp < THIRTY_DAYS_MS;
}

export function ProfileCompletionBanner({
  completionPercentage,
  sessionCount,
  missingFields,
  onClick,
}: ProfileCompletionBannerProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed());

  useEffect(() => {
    if (dismissed || completionPercentage >= 100) return;
    trackEvent("profile_banner_shown", {
      completion_percentage: completionPercentage,
      session_number: sessionCount,
    });
  }, [completionPercentage, dismissed, sessionCount]);

  const missingText = useMemo(() => missingFields.slice(0, 2).join(" · "), [missingFields]);

  if (dismissed || completionPercentage >= 100) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-amber-900">Complete your profile</p>
            <span className="text-xs font-medium text-amber-700">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-2 bg-amber-100 [&>div]:bg-amber-400" />
          <p className="text-sm text-amber-800">
            {missingText ? `Complete: ${missingText}` : "A few details will improve your recommendations."}
          </p>
        </div>

        <button
          type="button"
          aria-label="Dismiss profile completion banner"
          className="shrink-0 rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setDismissed(true);
            trackEvent("profile_banner_dismissed", {
              completion_percentage: completionPercentage,
            });
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="hero"
          size="sm"
          onClick={() => {
            trackEvent("profile_banner_clicked", {
              completion_percentage: completionPercentage,
            });
            onClick();
          }}
        >
          Finish Setup
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
