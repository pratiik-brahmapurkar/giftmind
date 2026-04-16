import { PLANS, type PlanSlug } from "@/lib/geoConfig";

export const RECIPIENT_LIMITS: Record<PlanSlug, number> = {
  spark: PLANS.spark.maxRecipients,
  thoughtful: PLANS.thoughtful.maxRecipients,
  confident: PLANS.confident.maxRecipients,
  "gifting-pro": PLANS["gifting-pro"].maxRecipients,
};

export function getRecipientLimit(plan: string | null | undefined) {
  return RECIPIENT_LIMITS[plan as PlanSlug] ?? RECIPIENT_LIMITS.spark;
}

export function canAddRecipientForPlan(plan: string | null | undefined, count: number) {
  const maxAllowed = getRecipientLimit(plan);
  return maxAllowed === -1 || count < maxAllowed;
}

export function getRecipientLimitMessage(plan: string | null | undefined, maxAllowed = getRecipientLimit(plan)) {
  const planConfig = PLANS[plan as PlanSlug] ?? PLANS.spark;
  return `Your ${planConfig.name} plan allows up to ${maxAllowed} ${maxAllowed === 1 ? "person" : "people"}. Upgrade to add more.`;
}
