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
      <div className="mx-auto max-w-6xl">
        <PricingCards currentPlan={plan} source="plans_page" />
      </div>
    </DashboardLayout>
  );
};

export default Plans;
