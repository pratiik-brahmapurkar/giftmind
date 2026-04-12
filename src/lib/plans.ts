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

export function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "starter" || plan === "popular" || plan === "pro") return plan;
  return "free";
}

export function getUpgradePlanForFeature(plan: PlanKey, feature: string): PlanKey {
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
}

export function getNextPlan(plan: PlanKey): Exclude<PlanKey, "free"> {
  if (plan === "free") return "starter";
  if (plan === "starter") return "popular";
  return "pro";
}

export function getStoresLevel(storeAccess: string[]): StoresLevel {
  if (storeAccess.length <= 1) return "basic";
  if (storeAccess.length <= 2) return "standard";
  return "all";
}
