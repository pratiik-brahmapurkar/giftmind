import { ArrowRight, CalendarDays, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UpcomingOccasion } from "@/lib/reminders";
import { formatCountdown } from "@/lib/reminders";

export type OccasionUrgencyTier = "critical" | "soon" | "upcoming";

export function getOccasionUrgencyTier(daysUntil: number): OccasionUrgencyTier {
  if (daysUntil <= 7) return "critical";
  if (daysUntil <= 21) return "soon";
  return "upcoming";
}

const tierStyles: Record<OccasionUrgencyTier, { label: string; card: string; badge: string }> = {
  critical: {
    label: "Critical",
    card: "border-orange-200 bg-orange-50/80",
    badge: "border-orange-200 bg-orange-100 text-orange-900",
  },
  soon: {
    label: "Soon",
    card: "border-amber-200 bg-amber-50/80",
    badge: "border-amber-200 bg-amber-100 text-amber-900",
  },
  upcoming: {
    label: "Upcoming",
    card: "border-border/60 bg-card",
    badge: "border-border/60 bg-muted text-muted-foreground",
  },
};

interface OccasionsStripProps {
  occasions: UpcomingOccasion[];
  isLocked: boolean;
  onFindGift: (occasion: UpcomingOccasion, tier: OccasionUrgencyTier) => void;
  onManage: () => void;
  onUpgrade: () => void;
}

export function OccasionsStrip({ occasions, isLocked, onFindGift, onManage, onUpgrade }: OccasionsStripProps) {
  if (occasions.length === 0) {
    return (
      <Card className="border-border/60 bg-card shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No upcoming dates yet</p>
              <p className="text-sm text-muted-foreground">Add birthdays and anniversaries to plan ahead.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onManage}>
            Manage people
          </Button>
        </CardContent>
      </Card>
    );
  }

  const visibleOccasions = occasions
    .slice()
    .sort((left, right) => {
      const tierWeight = { critical: 0, soon: 1, upcoming: 2 };
      return tierWeight[getOccasionUrgencyTier(left.daysUntil)] - tierWeight[getOccasionUrgencyTier(right.daysUntil)] || left.daysUntil - right.daysUntil;
    })
    .slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Upcoming occasions</h2>
          <p className="text-sm text-muted-foreground">{occasions.length} saved date{occasions.length === 1 ? "" : "s"} in the next 60 days.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="w-fit px-0 sm:px-3" onClick={onManage}>
          Manage dates
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {visibleOccasions.map((occasion) => {
          const tier = getOccasionUrgencyTier(occasion.daysUntil);
          const styles = tierStyles[tier];

          return (
            <Card key={`${occasion.recipientId}-${occasion.label}-${occasion.date}`} className={cn("border shadow-sm", styles.card)}>
              <CardContent className="flex h-full flex-col gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xl" aria-hidden="true">
                      {occasion.emoji}
                    </span>
                    <Badge variant="outline" className={cn("shrink-0 px-2 py-0 text-[10px]", styles.badge)}>
                      {styles.label}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">{occasion.recipientName}</p>
                    <p className="truncate text-sm text-muted-foreground">{occasion.label}</p>
                    <p className="text-xs font-medium text-foreground">{formatCountdown(occasion.daysUntil)}</p>
                  </div>
                </div>

                {isLocked ? (
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={onUpgrade}>
                    <Lock className="h-4 w-4" />
                    Unlock
                  </Button>
                ) : (
                  <Button type="button" variant={tier === "critical" ? "hero" : "outline"} size="sm" className="w-full" onClick={() => onFindGift(occasion, tier)}>
                    Find a Gift
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
