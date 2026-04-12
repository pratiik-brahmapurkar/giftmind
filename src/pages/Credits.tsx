import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import BuyCreditsTab from "@/components/credits/BuyCreditsTab";
import CreditHistoryTab from "@/components/credits/CreditHistoryTab";
import { SEOHead } from "@/components/common/SEOHead";
import { useCredits } from "@/hooks/useCredits";

const Credits = () => {
  const { balance: credits, expiringBatches, isLoading } = useCredits();

  return (
    <DashboardLayout>
      <SEOHead title="Plans & Pricing" description="GiftMind credit plans. Start with 3 free credits." />
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6">Credits</h1>

        <Tabs defaultValue="buy" className="space-y-6">
          <TabsList>
            <TabsTrigger value="buy">Buy Credits</TabsTrigger>
            <TabsTrigger value="history">Credit History</TabsTrigger>
          </TabsList>

          <TabsContent value="buy">
            {isLoading ? (
              <Skeleton className="h-[120px] w-full rounded-xl" />
            ) : (
              <BuyCreditsTab credits={credits} expiringBatches={expiringBatches} />
            )}
          </TabsContent>

          <TabsContent value="history">
            <CreditHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Credits;
