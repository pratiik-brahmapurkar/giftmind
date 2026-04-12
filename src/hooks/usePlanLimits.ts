import { useMemo } from "react";
import { useUserPlan } from "@/hooks/useUserPlan";
import {
  getStoresLevel,
  getUpgradePlanForFeature,
  type PlanKey,
  type PlanLimits,
  type StoresLevel,
} from "@/lib/plans";

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
  const { plan, limits, isLoaded } = useUserPlan();
  const isLoading = !isLoaded;

  return useMemo(() => {
    const storesLevel = getStoresLevel(limits.storeAccess);

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
      getUpgradePlan: (feature: string) => getUpgradePlanForFeature(plan, feature),
    };
  }, [isLoading, limits, plan]);
}
