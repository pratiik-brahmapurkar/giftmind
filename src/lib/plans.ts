export type PlanKey = "spark" | "pro";
export type StoresLevel = "all";

export interface PlanConfig {
  slug: PlanKey;
  name: string;
  emoji: string;
  tagline: string;
  price: number;
  isComingSoon: boolean;
  credits: number | "unlimited";
  recipients: number;
  regenerations: number;
  reminders: number;
  hasSignalCheck: boolean;
  hasBatchMode: boolean;
  hasPriorityAi: boolean;
  hasHistoryExport: boolean;
  storeAccess: "all";
  aiProviderTier: "free" | "priority";
  features: string[];
  proOnlyFeatures: string[];
  badgeVariant: "default" | "pro";
  label: string;
  maxRecipients: number;
  maxRegenerations: number;
  maxReminders: number;
  storesLevel: StoresLevel;
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  spark: {
    slug: "spark",
    name: "Spark",
    emoji: "✨",
    tagline: "Everything you need to find the perfect gift",
    price: 0,
    isComingSoon: false,
    credits: 15,
    recipients: 5,
    regenerations: 2,
    reminders: 2,
    hasSignalCheck: true,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    storeAccess: "all",
    aiProviderTier: "free",
    features: [
      "15 credits/month (auto-refresh)",
      "5 saved profiles",
      "2 redos per gift",
      "Signal Check",
      "AI message drafts",
      "All stores",
      "Confidence scores",
    ],
    proOnlyFeatures: [
      "Unlimited credits",
      "Batch mode",
      "Priority AI",
      "History export",
    ],
    badgeVariant: "default",
    label: "Spark ✨",
    maxRecipients: 5,
    maxRegenerations: 2,
    maxReminders: 2,
    storesLevel: "all",
  },
  pro: {
    slug: "pro",
    name: "Pro",
    emoji: "🎯",
    tagline: "Unlimited gifting for people who care deeply",
    price: 5.99,
    isComingSoon: true,
    credits: "unlimited",
    recipients: -1,
    regenerations: -1,
    reminders: -1,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: true,
    hasHistoryExport: true,
    storeAccess: "all",
    aiProviderTier: "priority",
    features: [
      "Unlimited credits",
      "Unlimited profiles",
      "Unlimited redos",
      "Signal Check",
      "AI message drafts",
      "Batch mode",
      "Priority AI (Claude Sonnet)",
      "Gift history export",
      "All stores",
    ],
    proOnlyFeatures: [],
    badgeVariant: "pro",
    label: "Pro 🎯",
    maxRecipients: -1,
    maxRegenerations: -1,
    maxReminders: -1,
    storesLevel: "all",
  },
};

export function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "pro") return "pro";
  return "spark";
}

export function getPlanConfig(slug?: string | null) {
  return PLAN_CONFIG[normalizePlan(slug)];
}

export function getUpgradePlanForFeature(): PlanKey {
  return "pro";
}

export function getNextPlan(): PlanKey {
  return "pro";
}

export function getStoresLevel(): StoresLevel {
  return "all";
}
