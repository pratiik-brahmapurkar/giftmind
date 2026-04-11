import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type PlanKey = "free" | "starter" | "popular" | "pro";
export type StoresLevel = "basic" | "standard" | "all";

export interface PlanLimits {
  recipients: number;
  regenerations: number;
  reminders: number;
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasPriorityAi: boolean;
  hasHistoryExport: boolean;
  storeAccess: string[];
  label: string;
}

export const PLAN_CONFIG: Record<PlanKey, PlanLimits> = {
  free: {
    recipients: 1,
    regenerations: 1,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon"],
    label: "Free",
  },
  starter: {
    recipients: 5,
    regenerations: 2,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon", "flipkart"],
    label: "Starter",
  },
  popular: {
    recipients: 15,
    regenerations: 3,
    reminders: 3,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Popular",
  },
  pro: {
    recipients: Number.POSITIVE_INFINITY,
    regenerations: Number.POSITIVE_INFINITY,
    reminders: Number.POSITIVE_INFINITY,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: true,
    hasHistoryExport: true,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Pro",
  },
};

function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "starter" || plan === "popular" || plan === "pro") return plan;
  return "free";
}

export interface ExtendedPlanLimits {
  plan: PlanKey;
  limits: PlanLimits;
  isLoading: boolean;
  maxRecipients: number;
  maxRegenerations: number;
  maxReminders: number;
  storesLevel: StoresLevel;
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasPriorityAi: boolean;
  hasHistoryExport: boolean;
  canAddRecipient: (currentCount: number) => boolean;
  canRegenerate: (currentRegenCount: number) => boolean;
  canUseSignalCheck: () => boolean;
  canUseBatchMode: () => boolean;
  getStoreLimit: () => number;
  getUpgradePlan: (feature: string) => PlanKey;
}

export function usePlanLimits(): ExtendedPlanLimits {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanKey>("free");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPlan() {
      if (!user) {
        if (isMounted) {
          setPlan("free");
          setIsLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("active_plan")
        .eq("id", user.id)
        .single();

      if (isMounted) {
        setPlan(normalizePlan(data?.active_plan));
        setIsLoading(false);
      }
    }

    void loadPlan();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const limits = PLAN_CONFIG[plan];

  return useMemo(() => {
    const storesLevel: StoresLevel =
      limits.storeAccess.length <= 1 ? "basic" : limits.storeAccess.length <= 2 ? "standard" : "all";

    const getUpgradePlan = (feature: string): PlanKey => {
      const featureMap: Record<string, PlanKey> = {
        signal_check: "popular",
        batch_mode: "popular",
        more_recipients: plan === "free" ? "starter" : "popular",
        more_regenerations: plan === "free" ? "starter" : "popular",
        more_stores: plan === "free" ? "starter" : "popular",
        priority_ai: "pro",
        export: "pro",
      };

      return featureMap[feature] ?? "popular";
    };

    return {
      plan,
      limits,
      isLoading,
      maxRecipients: Number.isFinite(limits.recipients) ? limits.recipients : -1,
      maxRegenerations: Number.isFinite(limits.regenerations) ? limits.regenerations : -1,
      maxReminders: Number.isFinite(limits.reminders) ? limits.reminders : -1,
      storesLevel,
      hasSignalCheck: limits.hasSignalCheck,
      hasBatchMode: limits.hasBatchMode,
      hasPriorityAi: limits.hasPriorityAi,
      hasHistoryExport: limits.hasHistoryExport,
      canAddRecipient: (currentCount: number) =>
        !Number.isFinite(limits.recipients) || currentCount < limits.recipients,
      canRegenerate: (currentRegenCount: number) =>
        !Number.isFinite(limits.regenerations) || currentRegenCount < limits.regenerations,
      canUseSignalCheck: () => limits.hasSignalCheck,
      canUseBatchMode: () => limits.hasBatchMode,
      getStoreLimit: () => limits.storeAccess.length,
      getUpgradePlan,
    };
  }, [isLoading, limits, plan]);
}
