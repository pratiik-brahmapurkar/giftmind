import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface DashboardActionCard {
  id: string;
  title: string;
  description: string;
  cta: string;
  urgency: "high" | "medium" | "low";
  icon: LucideIcon;
  onClick: () => void;
}

const urgencyStyles: Record<DashboardActionCard["urgency"], string> = {
  high: "border-orange-200 bg-orange-50 text-orange-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-border/60 bg-muted text-muted-foreground",
};

interface ActionCardGridProps {
  actions: DashboardActionCard[];
}

export function ActionCardGrid({ actions }: ActionCardGridProps) {
  if (actions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground">Recommended next steps</h2>
        <p className="text-sm text-muted-foreground">The most useful actions for your account right now.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {actions.slice(0, 3).map((action) => (
          <Card key={action.id} className="border-border/60 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="outline" className={cn("px-2 py-0 text-[10px]", urgencyStyles[action.urgency])}>
                  {action.urgency}
                </Badge>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{action.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{action.description}</p>
              </div>

              <Button type="button" variant={action.urgency === "high" ? "hero" : "outline"} size="sm" className="w-full" onClick={action.onClick}>
                {action.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
