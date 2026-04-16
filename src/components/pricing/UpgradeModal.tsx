import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PricingCards from "./PricingCards";
import PaymentMethodModal from "./PaymentMethodModal";
import type { PlanSlug } from "@/lib/geoConfig";
import { trackEvent } from "@/lib/posthog";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightPlan?: PlanSlug;
  reason?: string;
  onBuyClick?: (planKey: string) => void;
}

export default function UpgradeModal({
  open,
  onOpenChange,
  highlightPlan = "confident",
  reason,
  onBuyClick,
}: UpgradeModalProps) {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string | null>(null);

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

  const handleBuy = (planKey: string) => {
    if (onBuyClick) {
      onBuyClick(planKey);
      return;
    }
    // Instead of redirecting to /credits, immediately launch payment modal
    setSelectedPlanSlug(planKey);
    setPaymentModalOpen(true);
    // Optionally close the underlying modal so it's a clean checkout flow
    onOpenChange(false);
  };

  return (
    <>
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
          <PricingCards highlightPlan={highlightPlan} compact onBuyClick={handleBuy} />
        </DialogContent>
      </Dialog>

      <PaymentMethodModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        planSlug={selectedPlanSlug}
      />
    </>
  );
}
