import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import BuyCreditsTab from "@/components/credits/BuyCreditsTab";
import CreditHistoryTab from "@/components/credits/CreditHistoryTab";
import { SEOHead } from "@/components/common/SEOHead";
import { useCredits } from "@/hooks/useCredits";
import { useUserPlan } from "@/hooks/useUserPlan";
import { Coins } from "lucide-react";

const Credits = () => {
  const { balance, batches, transactions, isLoading, nearestExpiry, isEmpty, refresh } = useCredits();
  const { plan } = useUserPlan();
  const [activeTab, setActiveTab] = useState("buy");

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  return (
    <DashboardLayout>
      <SEOHead title="Plans & Pricing" description="GiftMind credit plans. Start with 3 free credits." />
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-heading font-bold text-foreground">Credits</h1>

        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-2xl" />
        ) : (
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl">
                <Coins className="h-5 w-5 text-primary" />
                Your Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="text-[40px] font-bold leading-none text-primary">🪙 {balance} credits available</div>

              {nearestExpiry && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⏰ {nearestExpiry.credits} credits expiring in {nearestExpiry.daysLeft} day{nearestExpiry.daysLeft === 1 ? "" : "s"}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Active Batches</p>
                {batches.length > 0 ? (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {batches.map((batch) => (
                      <p key={batch.id}>
                        {batch.package_name}: {batch.credits_remaining} remaining (expires {formatDate(batch.expires_at)})
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active credit batches.</p>
                )}
              </div>

              {isEmpty && (
                <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-destructive">No credits remaining</p>
                  <Button type="button" onClick={() => setActiveTab("buy")}>
                    Get Credits →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="buy">Buy Credits</TabsTrigger>
            <TabsTrigger value="history">Credit History</TabsTrigger>
          </TabsList>

          <TabsContent value="buy">
            <BuyCreditsTab currentPlan={plan} onPurchaseComplete={refresh} />
          </TabsContent>

          <TabsContent value="history">
            <CreditHistoryTab transactions={transactions} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Credits;
