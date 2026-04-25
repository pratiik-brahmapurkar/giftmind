import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FeatureLockBadgeProps {
  className?: string;
}

export function FeatureLockBadge({ className }: FeatureLockBadgeProps) {
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-full border-amber-200 bg-amber-50 text-amber-900", className)}>
      <Lock className="h-3 w-3" />
      Pro · Coming Soon
    </Badge>
  );
}
