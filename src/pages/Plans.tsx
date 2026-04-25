import { useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PricingCards from "@/components/pricing/PricingCards";
import { SEOHead } from "@/components/common/SEOHead";
import { useUserPlan } from "@/hooks/useUserPlan";
import { trackEvent } from "@/lib/posthog";

const Plans = () => {
  const { plan } = useUserPlan();

  useEffect(() => {
    trackEvent("plan_comparison_viewed", { source: "plans_page", current_plan: plan });
  }, [plan]);

  return (
    <DashboardLayout>
      <SEOHead title="Plans" description="Compare Spark and Pro for GiftMind." />
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground">Choose Your Plan</h1>
          <p className="text-muted-foreground">Spark is free and generous. Pro is coming soon for unlimited gifting.</p>
        </div>
        <PricingCards currentPlan={plan} source="plans_page" />
      </div>
    </DashboardLayout>
  );
};

export default Plans;
