import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PricingCards from "@/components/pricing/PricingCards";
import PaymentMethodModal from "@/components/pricing/PaymentMethodModal";
import type { PlanSlug } from "@/lib/geoConfig";
import { trackEvent } from "@/lib/posthog";

const CREDIT_USAGE = [
  { action: "Gift recommendation", cost: "1 credit" },
  { action: "Signal Check", cost: "0.5 credits" },
  { action: "AI message draft", cost: "0.5 credits" },
  { action: "Relationship insight", cost: "Free" },
  { action: "Save a person", cost: "Free" },
];

interface BuyCreditsTabProps {
  currentPlan?: PlanSlug;
  onPurchaseComplete?: () => void | Promise<void>;
}

const BuyCreditsTab = ({ currentPlan = "spark", onPurchaseComplete }: BuyCreditsTabProps) => {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("credit_purchase_started", { trigger: "credits_page" });
  }, []);

  const handleBuy = (slug: string) => {
    setSelectedPlanSlug(slug);
    setPaymentModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <PricingCards compact currentPlan={currentPlan} onBuyClick={handleBuy} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">What do credits get you?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium text-foreground">Action</th>
                  <th className="py-2 text-left font-medium text-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_USAGE.map((row) => (
                  <tr key={row.action} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{row.action}</td>
                    <td className="py-2 text-muted-foreground">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PaymentMethodModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        planSlug={selectedPlanSlug}
        onPurchaseComplete={onPurchaseComplete}
      />
    </div>
  );
};

export default BuyCreditsTab;
