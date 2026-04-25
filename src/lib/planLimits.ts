import { PLAN_CONFIG, normalizePlan, type PlanKey } from "@/lib/plans";

export const RECIPIENT_LIMITS: Record<PlanKey, number> = {
  spark: PLAN_CONFIG.spark.recipients,
  pro: PLAN_CONFIG.pro.recipients,
};

export function getRecipientLimit(plan: string | null | undefined) {
  return RECIPIENT_LIMITS[normalizePlan(plan)] ?? RECIPIENT_LIMITS.spark;
}

export function canAddRecipientForPlan(plan: string | null | undefined, count: number) {
  const maxAllowed = getRecipientLimit(plan);
  return maxAllowed === -1 || count < maxAllowed;
}

export function getRecipientLimitMessage(plan: string | null | undefined, maxAllowed = getRecipientLimit(plan)) {
  const planConfig = PLAN_CONFIG[normalizePlan(plan)];
  return `Your ${planConfig.name} plan allows up to ${maxAllowed} ${maxAllowed === 1 ? "person" : "people"}. Join the Pro waitlist to add more.`;
}
