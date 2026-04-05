import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PricingCards from "./PricingCards";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which plan to recommend based on the user's limitation */
  highlightPlan?: "starter" | "popular" | "pro";
  reason?: string;
}

export default function UpgradeModal({
  open,
  onOpenChange,
  highlightPlan = "popular",
  reason,
}: UpgradeModalProps) {
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
        <PricingCards highlightPlan={highlightPlan} compact />
      </DialogContent>
    </Dialog>
  );
}
