import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/components/pricing/WaitlistForm";
import { WaitlistConfirmation } from "@/components/pricing/WaitlistConfirmation";
import { trackEvent } from "@/lib/posthog";
import type { PlanKey } from "@/lib/plans";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightPlan?: PlanKey;
  reason?: string;
  onBuyClick?: (planKey: string) => void;
  source?: string;
}

export default function UpgradeModal({
  open,
  onOpenChange,
  reason,
  source = "upgrade_modal",
}: UpgradeModalProps) {
  const [joined, setJoined] = useState<{ position: number; email?: string; already_joined?: boolean } | null>(null);

  useEffect(() => {
    if (open) {
      trackEvent("plan_comparison_viewed", { source, current_plan: "spark" });
      if (reason) {
        trackEvent("feature_lock_shown", { source, feature: reason });
      }
    }
  }, [open, reason, source]);

  useEffect(() => {
    if (!open) setJoined(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Pro is coming soon</DialogTitle>
          <DialogDescription>
            {reason ?? "Join the waitlist for unlimited credits, profiles, redos, batch mode, priority AI, and history export."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Pro will be $5.99/month.</p>
            <p className="mt-1">Spark stays free with 15 credits every month while Pro is being built.</p>
          </div>

          {joined ? (
            <WaitlistConfirmation position={joined.position} email={joined.email} alreadyJoined={joined.already_joined} />
          ) : (
            <WaitlistForm source={source} compact onJoined={setJoined} />
          )}

          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
