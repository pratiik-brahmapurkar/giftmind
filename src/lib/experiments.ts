import { getFeatureFlag } from "@/lib/posthog";

export const EXPERIMENTS = {
  GIFT_CARD_LAYOUT: "gift-card-layout",
  ONBOARDING_FLOW: "onboarding-flow-v2",
  SIGNAL_CHECK_PLACEMENT: "signal-check-cta",
  RESULTS_PAGE_CTA: "results-cta-copy",
} as const;

export type ExperimentKey = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS];

export function getExperimentVariant(key: string): string | undefined {
  const variant = getFeatureFlag(key);
  return typeof variant === "string" ? variant : undefined;
}
