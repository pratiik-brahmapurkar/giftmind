/**
 * usePlanLimits
 *
 * Thin extension layer on top of the existing useUserPlan hook.
 * Adds helper functions for feature-gating checks and upgrade routing.
 *
 * NOTE: useUserPlan already handles plan detection, limit values, and
 * isLoaded state. This hook re-exports those plus the helper functions
 * so callers have a single import point.
 */
import { useUserPlan, type PlanKey, type PlanLimits, PLAN_CONFIG } from "@/hooks/useUserPlan";

export type StoresLevel = "basic" | "standard" | "all";

export interface ExtendedPlanLimits {
  plan: PlanKey;
  maxRecipients: number;           // -1 = unlimited (maps from Infinity)
  maxRegenerations: number;        // -1 = unlimited
  maxReminders: number;            // -1 = unlimited
  storesLevel: StoresLevel;
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasPriorityAi: boolean;
  hasHistoryExport: boolean;
  isLoading: boolean;
  // Helpers
  canAddRecipient: (currentCount: number) => boolean;
  canRegenerate: (currentRegenCount: number) => boolean;
  canUseSignalCheck: () => boolean;
  canUseBatchMode: () => boolean;
  getStoreLimit: () => number;
  getUpgradePlan: (feature: string) => PlanKey;
}

/* ── Map PlanLimits → ExtendedPlanLimits ─────────────────────────────────── */
function toExtended(plan: PlanKey, raw: PlanLimits): Omit<ExtendedPlanLimits, "plan" | "isLoading"> {
  // Map Infinity → -1 for clean consumption
  const maxRecipients = raw.recipients === Infinity ? -1 : raw.recipients;
  const maxRegenerations = raw.regenerations === Infinity ? -1 : raw.regenerations;
  const maxReminders = raw.reminders === Infinity ? -1 : raw.reminders;

  // storesLevel based on how many stores the plan unlocks
  const storeCount = raw.storeAccess.length;
  const storesLevel: StoresLevel = storeCount <= 1 ? "basic" : storeCount <= 2 ? "standard" : "all";

  return {
    maxRecipients,
    maxRegenerations,
    maxReminders,
    storesLevel,
    hasSignalCheck: raw.hasSignalCheck,
    hasBatchMode: raw.hasBatchMode,
    hasPriorityAi: plan === "pro",
    hasHistoryExport: raw.hasExport,

    canAddRecipient: (currentCount: number) => {
      if (maxRecipients === -1) return true;
      return currentCount < maxRecipients;
    },

    canRegenerate: (currentRegenCount: number) => {
      if (maxRegenerations === -1) return true;
      return currentRegenCount < maxRegenerations;
    },

    canUseSignalCheck: () => raw.hasSignalCheck,
    canUseBatchMode: () => raw.hasBatchMode,

    getStoreLimit: () => {
      if (storesLevel === "basic") return 1;
      if (storesLevel === "standard") return 2;
      return 99;
    },

    getUpgradePlan: (feature: string): PlanKey => {
      const featurePlanMap: Record<string, PlanKey> = {
        signal_check: "popular",
        batch_mode: "popular",
        more_recipients: plan === "free" ? "starter" : "popular",
        more_stores: plan === "free" ? "starter" : "popular",
        more_regenerations: plan === "free" ? "starter" : "popular",
        priority_ai: "pro",
        history_export: "pro",
        reminders: "popular",
      };
      return featurePlanMap[feature] ?? "popular";
    },
  };
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */
export function usePlanLimits(): ExtendedPlanLimits {
  const { plan, limits, isLoaded } = useUserPlan();
  const extended = toExtended(plan, limits);

  return {
    plan,
    isLoading: !isLoaded,
    ...extended,
  };
}

/* ── Re-export plan config for any component that needs raw values ─────────── */
export { PLAN_CONFIG };
export type { PlanKey, PlanLimits };
