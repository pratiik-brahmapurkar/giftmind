export const RECOMMENDATION_V2_WARNING_CODES = {
  LIMITED_RESULTS: "LIMITED_RESULTS",
} as const;

export type RecommendationV2WarningCode =
  (typeof RECOMMENDATION_V2_WARNING_CODES)[keyof typeof RECOMMENDATION_V2_WARNING_CODES];

export interface RecommendationV2Warning {
  code: RecommendationV2WarningCode;
  message: string;
}

export interface RecommendationWithPriceAnchor {
  price_anchor: number | string | null | undefined;
}

export const BUDGET_FILTER_REJECT_REASONS = {
  MISSING_PRICE: "MISSING_PRICE",
  INVALID_PRICE: "INVALID_PRICE",
  BELOW_MIN: "BELOW_MIN",
  ABOVE_MAX: "ABOVE_MAX",
} as const;

export type BudgetFilterRejectReason =
  (typeof BUDGET_FILTER_REJECT_REASONS)[keyof typeof BUDGET_FILTER_REJECT_REASONS];

export interface BudgetFilteredOutRecommendation<TRecommendation> {
  recommendation: TRecommendation;
  reason: BudgetFilterRejectReason;
  parsedPrice: number | null;
}

export interface BudgetEnforcementResult<TRecommendation> {
  filtered: TRecommendation[];
  filteredOut: BudgetFilteredOutRecommendation<TRecommendation>[];
  retryRequired: boolean;
  warning: RecommendationV2Warning | null;
}
