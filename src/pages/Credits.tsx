import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BuyCreditsTab from "@/components/credits/BuyCreditsTab";
import CreditHistoryTab from "@/components/credits/CreditHistoryTab";

const Credits = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("credits")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const credits = profile?.credits ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6">Credits</h1>

        <Tabs defaultValue="buy" className="space-y-6">
          <TabsList>
            <TabsTrigger value="buy">Buy Credits</TabsTrigger>
            <TabsTrigger value="history">Credit History</TabsTrigger>
          </TabsList>

          <TabsContent value="buy">
            <BuyCreditsTab credits={credits} />
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
