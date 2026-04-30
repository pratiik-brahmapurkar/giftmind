import { useMemo } from "react";
import type { UpcomingOccasion } from "@/lib/reminders";

export type DashboardSegment =
  | "new_user"
  | "exploring"
  | "dormant"
  | "occasion_urgent"
  | "in_progress"
  | "low_credits"
  | "active";

interface SegmentInputs {
  recipientCount: number;
  sessionCount: number;
  creditsBalance: number;
  lastActiveAt: string | null;
  urgentOccasions: UpcomingOccasion[];
  activeSessionCount: number;
}

export function getDaysSince(date: string | null) {
  if (!date) return null;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

export function useDashboardSegment({
  recipientCount,
  sessionCount,
  creditsBalance,
  lastActiveAt,
  urgentOccasions,
  activeSessionCount,
}: SegmentInputs): DashboardSegment {
  return useMemo(() => {
    if (recipientCount === 0) return "new_user";
    if (sessionCount === 0) return "exploring";
    if (urgentOccasions.length > 0) return "occasion_urgent";
    if (activeSessionCount > 0) return "in_progress";
    if (creditsBalance <= 1) return "low_credits";
    if ((getDaysSince(lastActiveAt) ?? 0) > 14) return "dormant";

    return "active";
  }, [activeSessionCount, creditsBalance, lastActiveAt, recipientCount, sessionCount, urgentOccasions.length]);
}
