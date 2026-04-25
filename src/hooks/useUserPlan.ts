import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePlan, PLAN_CONFIG, getUpgradePlanForFeature, getPlanConfig, type PlanConfig } from "@/lib/plans";

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
  const isPro = plan === "pro";

  return {
    plan,
    planName: limits.name,
    planEmoji: limits.emoji,
    limits,
    credits,
    isLoaded: !user || isFetched,
    isLoading: user ? !isFetched : false,
    isPro,
    isComingSoon: limits.isComingSoon,
    isOnWaitlist: false,
    canUpgrade: !isPro,
    maxRecipients: limits.maxRecipients,
    maxRegenerations: limits.maxRegenerations,
    maxReminders: limits.maxReminders,
    hasSignalCheck: limits.hasSignalCheck,
    hasBatchMode: limits.hasBatchMode,
    hasPriorityAi: limits.hasPriorityAi,
    hasHistoryExport: limits.hasHistoryExport,
    storesLevel: limits.storesLevel,
    canAddRecipient: (count: number) => limits.recipients === -1 || count < limits.recipients,
    canRegenerate: (count: number) => limits.regenerations === -1 || count < limits.regenerations,
    canUseSignalCheck: () => limits.hasSignalCheck,
    canUseBatchMode: () => limits.hasBatchMode,
    getStoreLimit: () => 99,
    getUpgradePlan: getUpgradePlanForFeature,
    getUpgradeText: (feature: string) => {
      const copy: Record<string, string> = {
        more_recipients: "Join the Pro waitlist for unlimited saved people.",
        more_regenerations: "Join the Pro waitlist for unlimited redos.",
        reminders: "Join the Pro waitlist for unlimited reminders.",
        batch_mode: "Batch mode is coming with Pro.",
        history_export: "History export is coming with Pro.",
      };
      return copy[feature] ?? `${getPlanConfig("pro").name} is coming soon. Join the waitlist.`;
    },
  };
}

export { PLAN_CONFIG };
export type { PlanConfig };
