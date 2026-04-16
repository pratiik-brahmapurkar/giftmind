import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PayPalCheckoutButton } from "@/components/credits/PayPalCheckoutButton";
import { Loader2, ShieldCheck, Zap, AlertCircle } from "lucide-react";
import { trackEvent } from "@/lib/posthog";

type CreditPackage = Database["public"]["Tables"]["credit_packages"]["Row"];

interface PaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planSlug: string | null;
  onPurchaseComplete?: () => void | Promise<void>;
}

export default function PaymentMethodModal({
  open,
  onOpenChange,
  planSlug,
  onPurchaseComplete,
}: PaymentMethodModalProps) {
  // PostHog Tracking for modal open state
  useEffect(() => {
    if (open && planSlug) {
      trackEvent("payment_method_flow_opened", { plan: planSlug });
    }
  }, [open, planSlug]);

  const { data: packages = [], isLoading, error } = useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      return data ?? [];
    },
    // Only fetch if the modal is open
    enabled: open,
  });

  const selectedPackage = useMemo(() => {
    if (!planSlug || !packages.length) return null;
    return packages.find((pkg) => pkg.slug === planSlug) || null;
  }, [packages, planSlug]);

  const handleComplete = async () => {
    if (onPurchaseComplete) {
      await onPurchaseComplete();
    }
    // Automatically close the modal after successful purchase
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/50">
        <DialogHeader className="p-6 md:p-8 bg-muted/30 border-b border-border/40 text-center">
          <DialogTitle className="text-2xl font-heading font-bold">
            Choose Payment Method
          </DialogTitle>
          <DialogDescription className="text-sm mt-2 text-muted-foreground">
            Complete your checkout securely to upgrade your account.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 md:p-8 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Preparing checkout...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 bg-destructive/10 text-destructive p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium text-destructive">
                Failed to load package details. Please try again.
              </p>
            </div>
          )}

          {!isLoading && !error && selectedPackage && (
            <>
              {/* Premium Plan Summary Card */}
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {selectedPackage.name} Plan
                    </h3>
                    <p className="text-sm text-primary flex items-center gap-1 mt-1">
                      <Zap className="w-3.5 h-3.5" />
                      {selectedPackage.credits} Gift Sessions included
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-heading font-bold text-foreground">
                      ${selectedPackage.price_usd}
                    </span>
                    {selectedPackage.validity_days > 0 && (
                      <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Valid for {selectedPackage.validity_days} days
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <ShieldCheck className="w-4 h-4 text-success" />
                  <span>Secure 256-bit encrypted checkout</span>
                </div>
              </div>

              {/* Payment Action Area */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs uppercase font-semibold text-muted-foreground px-2">
                    Pay via PayPal
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>

                <div className="min-h-[48px]">
                  <PayPalCheckoutButton
                    creditPackage={selectedPackage}
                    disabled={Number(selectedPackage.price_usd ?? 0) <= 0}
                    onPurchaseComplete={handleComplete}
                  />
                </div>
              </div>
            </>
          )}

          {!isLoading && !error && !selectedPackage && planSlug && (
            <div className="flex items-center gap-3 bg-destructive/10 text-destructive p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium text-destructive">
                The selected plan could not be found.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
