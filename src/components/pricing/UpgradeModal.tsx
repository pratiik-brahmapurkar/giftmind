import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PricingCards, { CurrencyKey } from "./PricingCards";
import { trackEvent } from "@/lib/posthog";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightPlan?: "starter" | "popular" | "pro";
  reason?: string;
  defaultCurrency?: CurrencyKey;
  onSelectPlan?: (planKey: string, currency: CurrencyKey) => void;
}

export default function UpgradeModal({
  open,
  onOpenChange,
  highlightPlan = "popular",
  reason,
  defaultCurrency,
  onSelectPlan,
}: UpgradeModalProps) {
  useEffect(() => {
    if (open) {
      if (reason) {
        trackEvent('upgrade_nudge_shown', { 
          trigger: reason.toLowerCase().includes('signal check') ? 'signal_check' : 'locked_feature',
          recommended_plan: highlightPlan 
        });
      }
      trackEvent('credit_purchase_started', { 
        trigger: reason ? 'upgrade_nudge' : 'pricing_page',
        current_plan: 'unknown' 
      });
    }
  }, [open, highlightPlan, reason]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6 sm:p-8">
        <DialogHeader className="text-center mb-4">
          <DialogTitle className="text-2xl font-heading font-bold">
            Upgrade Your Plan
          </DialogTitle>
          {reason && (
            <DialogDescription className="text-muted-foreground">
              {reason}
            </DialogDescription>
          )}
        </DialogHeader>
        <PricingCards highlightPlan={highlightPlan} compact defaultCurrency={defaultCurrency} onSelectPlan={onSelectPlan} />
      </DialogContent>
    </Dialog>
  );
}
