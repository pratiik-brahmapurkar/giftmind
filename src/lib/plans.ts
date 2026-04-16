export type PlanKey = "spark" | "thoughtful" | "confident" | "gifting-pro";
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
  spark: {
    recipients: 1,
    regenerations: 1,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon"],
    label: "Spark ✨",
  },
  thoughtful: {
    recipients: 5,
    regenerations: 2,
    reminders: 0,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon", "flipkart"],
    label: "Thoughtful 💝",
  },
  confident: {
    recipients: 15,
    regenerations: 3,
    reminders: 3,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Confident 🎯",
  },
  "gifting-pro": {
    recipients: Number.POSITIVE_INFINITY,
    regenerations: Number.POSITIVE_INFINITY,
    reminders: Number.POSITIVE_INFINITY,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: true,
    hasHistoryExport: true,
    storeAccess: ["amazon", "flipkart", "myntra", "etsy", "others"],
    label: "Gifting Pro 🚀",
  },
};

export function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "spark" || plan === "thoughtful" || plan === "confident" || plan === "gifting-pro") return plan;
  return "spark";
}

export function getUpgradePlanForFeature(plan: PlanKey, feature: string): PlanKey {
  const featureMap: Record<string, PlanKey> = {
    signal_check: "confident",
    batch_mode: "confident",
    more_recipients: plan === "spark" ? "thoughtful" : "confident",
    more_regenerations: plan === "spark" ? "thoughtful" : "confident",
    more_stores: plan === "spark" ? "thoughtful" : "confident",
    priority_ai: "gifting-pro",
    history_export: "gifting-pro",
  };

  return featureMap[feature] ?? "confident";
}

export function getNextPlan(plan: PlanKey): Exclude<PlanKey, "spark"> {
  if (plan === "spark") return "thoughtful";
  if (plan === "thoughtful") return "confident";
  return "gifting-pro";
}

export function getStoresLevel(storeAccess: string[]): StoresLevel {
  if (storeAccess.length <= 1) return "basic";
  if (storeAccess.length <= 2) return "standard";
  return "all";
}
