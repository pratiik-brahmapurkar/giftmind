import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/posthog";

interface ReengagementBannerProps {
  daysSinceActive: number | null;
  upcomingCount: number;
  ungiftedCount: number;
  onFindGift: () => void;
}

const DISMISS_KEY = "gm_reengagement_dismissed";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isDismissed() {
  const rawValue = localStorage.getItem(DISMISS_KEY);
  if (!rawValue) return false;

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp)) return rawValue === "true";

  return Date.now() - timestamp < THIRTY_DAYS_MS;
}

export function ReengagementBanner({ daysSinceActive, upcomingCount, ungiftedCount, onFindGift }: ReengagementBannerProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed());

  useEffect(() => {
    if (dismissed) return;

    trackEvent("reengagement_banner_shown", {
      days_since_active: daysSinceActive,
      upcoming_count: upcomingCount,
      ungifted_count: ungiftedCount,
    });
  }, [daysSinceActive, dismissed, ungiftedCount, upcomingCount]);

  if (dismissed) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-4 shadow-sm md:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Ready for your next thoughtful pick?</p>
          <p className="text-sm text-muted-foreground">
            {upcomingCount > 0
              ? `You have ${upcomingCount} upcoming occasion${upcomingCount === 1 ? "" : "s"} to plan for.`
              : ungiftedCount > 0
                ? `${ungiftedCount} saved ${ungiftedCount === 1 ? "person has" : "people have"} no gift history yet.`
                : "Start a fresh recommendation with your saved people."}
          </p>
        </div>

        <button
          type="button"
          aria-label="Dismiss re-engagement banner"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="hero"
          size="sm"
          onClick={() => {
            trackEvent("reengagement_banner_clicked", {
              days_since_active: daysSinceActive,
            });
            onFindGift();
          }}
        >
          Find a Gift
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
