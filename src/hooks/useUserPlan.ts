import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePlan, PLAN_CONFIG, type PlanKey, type PlanLimits } from "@/lib/plans";

export function useUserPlan() {
  const { user } = useAuth();

  const { data: profile, isFetched } = useQuery({
    queryKey: ["user-entitlements", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("credits_balance, active_plan")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const credits = profile?.credits_balance ?? 0;
  const plan = normalizePlan(profile?.active_plan);
  const limits = PLAN_CONFIG[plan];

  return { plan, limits, credits, isLoaded: !user || isFetched };
}

export { PLAN_CONFIG };
export type { PlanLimits };
