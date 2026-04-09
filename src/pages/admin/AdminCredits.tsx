import { SEOHead } from "@/components/common/SEOHead";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RevenueTab from "@/components/admin/credits/RevenueTab";
import PackagesTab from "@/components/admin/credits/PackagesTab";
import TransactionsTab from "@/components/admin/credits/TransactionsTab";

const AdminCredits = () => {
  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Credits & Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">Revenue analytics, package management, and transaction logs</p>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-6">
          <RevenueTab />
        </TabsContent>
        <TabsContent value="packages" className="mt-6">
          <PackagesTab />
        </TabsContent>
        <TabsContent value="transactions" className="mt-6">
          <TransactionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCredits;
