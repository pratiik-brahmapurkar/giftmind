import { Badge } from "@/components/ui/badge";
import { PLAN_CONFIG, normalizePlan, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface PlanBadgeProps {
  plan: PlanKey | string | null | undefined;
  size?: "sm" | "md";
  showName?: boolean;
  className?: string;
}

export function PlanBadge({ plan, size = "sm", showName = true, className }: PlanBadgeProps) {
  const planKey = normalizePlan(plan);
  const config = PLAN_CONFIG[planKey];

  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit gap-1.5 rounded-full border-border/70 bg-background text-muted-foreground",
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
        planKey === "pro" && "border-amber-300 bg-amber-50 text-amber-900",
        className,
      )}
    >
      <span>{config.emoji}</span>
      {showName ? <span>{config.name}</span> : null}
    </Badge>
  );
}
