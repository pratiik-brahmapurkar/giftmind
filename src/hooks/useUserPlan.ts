import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PlanKey = "free" | "starter" | "popular" | "pro";

interface PlanLimits {
  recipients: number;
  regenerations: number;
  reminders: number;
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasExport: boolean;
  storeAccess: ("amazon" | "flipkart" | "myntra" | "etsy" | "others")[];
  label: string;
}

const PLAN_CONFIG: Record<PlanKey, PlanLimits> = {
  free: {
    recipients: 1,
    regenerations: 1,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasExport: false,
    storeAccess: ["amazon"],
    label: "Free",
  },
  starter: {
    recipients: 5,
    regenerations: 2,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasExport: false,
    storeAccess: ["amazon", "flipkart"],
    label: "Starter",
  },
  popular: {
    recipients: 15,
    regenerations: 3,
    reminders: 3,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasExport: false,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Popular",
  },
  pro: {
    recipients: Infinity,
    regenerations: Infinity,
    reminders: Infinity,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasExport: true,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Pro",
  },
};

function derivePlan(credits: number, hasTransactions: boolean): PlanKey {
  // Simple heuristic: check credit balance + purchase history
  // In production this would come from a plan field on the profile
  if (!hasTransactions && credits <= 3) return "free";
  if (credits <= 25) return "starter";
  if (credits <= 75) return "popular";
  return "pro";
}

export function useUserPlan() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["user-plan-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("credits")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: hasTx } = useQuery({
    queryKey: ["user-plan-tx", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("credit_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("type", "purchase");
      return (count ?? 0) > 0;
    },
    enabled: !!user,
  });

  const credits = profile?.credits ?? 0;
  const plan = derivePlan(credits, hasTx ?? false);
  const limits = PLAN_CONFIG[plan];

  return { plan, limits, credits, isLoaded: profile !== undefined };
}

export { PLAN_CONFIG };
export type { PlanLimits };
