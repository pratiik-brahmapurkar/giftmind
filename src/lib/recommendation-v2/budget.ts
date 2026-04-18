import {
  BUDGET_FILTER_REJECT_REASONS,
  RECOMMENDATION_V2_WARNING_CODES,
  type BudgetEnforcementResult,
  type BudgetFilterRejectReason,
  type RecommendationWithPriceAnchor,
} from "./contracts.js";

interface ParsedPriceAnchor {
  price: number | null;
  reason: BudgetFilterRejectReason | null;
}

function parsePriceAnchor(value: RecommendationWithPriceAnchor["price_anchor"]): ParsedPriceAnchor {
  if (value == null) {
    return {
      price: null,
      reason: BUDGET_FILTER_REJECT_REASONS.MISSING_PRICE,
    };
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { price: value, reason: null }
      : { price: null, reason: BUDGET_FILTER_REJECT_REASONS.INVALID_PRICE };
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return {
        price: null,
        reason: BUDGET_FILTER_REJECT_REASONS.MISSING_PRICE,
      };
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed)
      ? { price: parsed, reason: null }
      : { price: null, reason: BUDGET_FILTER_REJECT_REASONS.INVALID_PRICE };
  }

  return {
    price: null,
    reason: BUDGET_FILTER_REJECT_REASONS.INVALID_PRICE,
  };
}

function getRejectReason(price: number, budgetMin: number, budgetMax: number): BudgetFilterRejectReason | null {
  if (price < budgetMin) return BUDGET_FILTER_REJECT_REASONS.BELOW_MIN;
  if (price > budgetMax) return BUDGET_FILTER_REJECT_REASONS.ABOVE_MAX;
  return null;
}

function validateBudgetRange(budgetMin: number, budgetMax: number) {
  if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax)) {
    throw new RangeError("Budget bounds must be finite numbers.");
  }

  if (budgetMin < 0 || budgetMax < 0) {
    throw new RangeError("Budget bounds must be zero or positive.");
  }

  if (budgetMax < budgetMin) {
    throw new RangeError("Budget max must be greater than or equal to budget min.");
  }
}

function buildLimitedResultsMessage(count: number, budgetMin: number, budgetMax: number) {
  return `We found ${count} personalized match${count === 1 ? "" : "es"} within your exact $${budgetMin}-$${budgetMax} budget. Consider widening the range slightly for more options.`;
}

export function enforceBudget<TRecommendation extends RecommendationWithPriceAnchor>(
  recommendations: TRecommendation[],
  budgetMin: number,
  budgetMax: number,
): BudgetEnforcementResult<TRecommendation> {
  validateBudgetRange(budgetMin, budgetMax);

  const filtered: TRecommendation[] = [];
  const filteredOut: BudgetEnforcementResult<TRecommendation>["filteredOut"] = [];

  for (const recommendation of recommendations) {
    const { price: parsedPrice, reason: parseReason } = parsePriceAnchor(recommendation.price_anchor);
    const rejectReason = parseReason ?? (parsedPrice == null ? null : getRejectReason(parsedPrice, budgetMin, budgetMax));

    if (rejectReason) {
      filteredOut.push({
        recommendation,
        reason: rejectReason,
        parsedPrice,
      });
      continue;
    }

    filtered.push(recommendation);
  }

  const retryRequired = filtered.length < 3;

  return {
    filtered,
    filteredOut,
    retryRequired,
    warning: retryRequired
      ? {
          code: RECOMMENDATION_V2_WARNING_CODES.LIMITED_RESULTS,
          message: buildLimitedResultsMessage(filtered.length, budgetMin, budgetMax),
        }
      : null,
  };
}
