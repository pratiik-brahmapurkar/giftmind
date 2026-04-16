import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PayPalCheckoutButton } from "@/components/credits/PayPalCheckoutButton";
import PricingCards from "@/components/pricing/PricingCards";
import type { PlanSlug } from "@/lib/geoConfig";
import { trackEvent } from "@/lib/posthog";

type CreditPackage = Database["public"]["Tables"]["credit_packages"]["Row"];

const CREDIT_USAGE = [
  { action: "Gift session", cost: "1 credit" },
  { action: "Signal Check", cost: "0.5 credits" },
  { action: "Regeneration", cost: "Free" },
  { action: "Save a person", cost: "Free" },
];

interface BuyCreditsTabProps {
  currentPlan?: PlanSlug;
  onPurchaseComplete?: () => void | Promise<void>;
}

const BuyCreditsTab = ({ currentPlan = "spark", onPurchaseComplete }: BuyCreditsTabProps) => {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);

  useEffect(() => {
    trackEvent("credit_purchase_started", { trigger: "credits_page" });
  }, []);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const packagesBySlug = useMemo(
    () => new Map(packages.map((pkg) => [pkg.slug, pkg])),
    [packages],
  );

  const handleBuy = (slug: string) => {
    const pkg = packagesBySlug.get(slug);
    if (!pkg) return;
    setSelectedPackage(pkg);
  };

  return (
    <div className="space-y-8">
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-[360px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <PricingCards compact currentPlan={currentPlan} onBuyClick={handleBuy} />
      )}

      {selectedPackage && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Checkout: {selectedPackage.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <PayPalCheckoutButton
              creditPackage={selectedPackage}
              disabled={Number(selectedPackage.price_usd ?? 0) <= 0}
              onPurchaseComplete={onPurchaseComplete}
            />
          </CardContent>
        </Card>
      )}

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
    </div>
  );
};

export default BuyCreditsTab;
