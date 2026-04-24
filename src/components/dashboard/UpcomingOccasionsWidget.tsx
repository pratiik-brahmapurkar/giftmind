import { useEffect } from "react";
import { ArrowRight, Bell, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { UpcomingOccasion } from "@/lib/reminders";
import { formatCountdown } from "@/lib/reminders";
import { trackEvent } from "@/lib/posthog";

interface UpcomingOccasionsWidgetProps {
  occasions: UpcomingOccasion[];
  isLocked: boolean;
  onFindGift: (occasion: UpcomingOccasion) => void;
  onManage: () => void;
  onUpgrade: () => void;
}

export function UpcomingOccasionsWidget({
  occasions,
  isLocked,
  onFindGift,
  onManage,
  onUpgrade,
}: UpcomingOccasionsWidgetProps) {
  useEffect(() => {
    if (occasions.length === 0) return;

    trackEvent("upcoming_occasions_widget_viewed", {
      count: occasions.length,
      locked: isLocked,
    });
  }, [isLocked, occasions.length]);

  if (occasions.length === 0) return null;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="h-4 w-4 text-primary" />
              Upcoming Occasions
            </div>
            <p className="text-sm text-muted-foreground">
              {isLocked
                ? `You have ${occasions.length} saved date${occasions.length === 1 ? "" : "s"}. Activate email reminders on Confident.`
                : `${occasions.length} occasion${occasions.length === 1 ? "" : "s"} in the next 60 days.`}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onManage}>
            Manage
          </Button>
        </div>

        <div className="space-y-2">
          {occasions.slice(0, 3).map((occasion) => (
            <div
              key={`${occasion.recipientId}-${occasion.label}-${occasion.date}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {occasion.emoji} {occasion.recipientName}&apos;s {occasion.label}
                </p>
                <p className="text-xs text-muted-foreground">{formatCountdown(occasion.daysUntil)}</p>
              </div>

              {isLocked ? (
                <Badge variant="outline" className="shrink-0 gap-1 border-border/60 text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Locked
                </Badge>
              ) : (
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onFindGift(occasion)}>
                  Find a Gift
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="justify-start px-0" onClick={onManage}>
            View all people
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {isLocked ? (
            <Button
              type="button"
              variant="hero"
              size="sm"
              onClick={() => {
                trackEvent("upcoming_occasions_upgrade_clicked", {
                  count: occasions.length,
                });
                onUpgrade();
              }}
            >
              Unlock Reminders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
