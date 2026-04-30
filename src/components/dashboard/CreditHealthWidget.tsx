import { ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface CreditHealthWidgetProps {
  creditsBalance: number;
  monthlyAllowance: number;
  renewalDate: Date | null;
  onTopUp: () => void;
}

function getCreditStatus(balance: number) {
  if (balance <= 0) return { label: "No credits", className: "text-destructive", bar: "[&>div]:bg-destructive" };
  if (balance <= 3) return { label: "Almost empty", className: "text-orange-700", bar: "[&>div]:bg-orange-500" };
  if (balance <= 8) return { label: "Running low", className: "text-amber-700", bar: "[&>div]:bg-amber-500" };
  return { label: "Healthy", className: "text-success", bar: "[&>div]:bg-success" };
}

export function CreditHealthWidget({ creditsBalance, monthlyAllowance, renewalDate, onTopUp }: CreditHealthWidgetProps) {
  const allowance = Math.max(monthlyAllowance, 1);
  const progress = Math.min(100, Math.max(0, (creditsBalance / allowance) * 100));
  const status = getCreditStatus(creditsBalance);
  const showCta = creditsBalance <= 3;

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Coins className="h-4 w-4 text-primary" />
              Credit health
            </div>
            <p className={cn("text-sm font-medium", status.className)}>{status.label}</p>
          </div>
          <div className="text-right">
            <p className="font-heading text-3xl font-bold leading-none text-foreground">{creditsBalance}</p>
            <p className="text-xs text-muted-foreground">of {monthlyAllowance}/mo</p>
          </div>
        </div>

        <Progress value={progress} className={cn("h-2 bg-muted", status.bar)} />

        <p className="text-sm text-muted-foreground">
          {renewalDate
            ? `Refreshes ${renewalDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
            : "Monthly Spark credits refresh automatically."}
        </p>

        {showCta ? (
          <Button type="button" variant="hero" size="sm" className="w-full" onClick={onTopUp}>
            Get More Credits
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
