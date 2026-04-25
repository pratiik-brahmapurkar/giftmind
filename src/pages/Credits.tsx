import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import CreditHistoryTab from "@/components/credits/CreditHistoryTab";
import SoftPaywall from "@/components/credits/SoftPaywall";
import { SEOHead } from "@/components/common/SEOHead";
import { useCredits } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { Link } from "react-router-dom";

const Credits = () => {
  const {
    balanceLabel,
    batches,
    transactions,
    isLoading,
    nearestExpiry,
    isEmpty,
    isFreeTier,
    monthlyProgress,
    resetDate,
    resetCountdownLabel,
    halfCreditNotice,
  } = useCredits();
  const [activeTab, setActiveTab] = useState("history");

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  return (
    <DashboardLayout>
      <SEOHead title="Credits" description="View your GiftMind credits and usage history." />
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
              <div className="space-y-2">
                <div className="text-[40px] font-bold leading-none text-primary">🪙 {balanceLabel} available</div>
                {halfCreditNotice ? <p className="text-sm text-muted-foreground">{halfCreditNotice}</p> : null}
              </div>

              {isFreeTier ? (
                <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-foreground">Credits this month</p>
                    <p className="text-xs text-muted-foreground">{resetCountdownLabel ?? "Resets monthly"}</p>
                  </div>
                  <Progress value={monthlyProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground">
                    Resets on {formatDate(resetDate ?? new Date().toISOString())}
                  </p>
                </div>
              ) : null}

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
                        {batch.package_name}: {(batch.credits_remaining / 2).toString().replace(/\.0$/, "")} remaining (expires {formatDate(batch.expires_at)})
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active credit batches.</p>
                )}
              </div>

              {isEmpty && (
                <SoftPaywall compact />
              )}

              <Button asChild variant="outline">
                <Link to="/plans">See Plans</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="history">Credit History</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <CreditHistoryTab transactions={transactions} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Credits;
