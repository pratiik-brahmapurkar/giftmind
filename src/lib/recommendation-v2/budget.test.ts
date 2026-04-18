import { describe, expect, it } from "vitest";

import { BUDGET_FILTER_REJECT_REASONS, RECOMMENDATION_V2_WARNING_CODES } from "./contracts";
import { enforceBudget } from "./budget";

interface TestRecommendation {
  name: string;
  price_anchor: number | string | null | undefined;
}

describe("enforceBudget", () => {
  it("passes recommendations within an inclusive budget range", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "A", price_anchor: 30 },
        { name: "B", price_anchor: 45 },
        { name: "C", price_anchor: 60 },
      ],
      30,
      60,
    );

    expect(result.filtered.map((item) => item.name)).toEqual(["A", "B", "C"]);
    expect(result.filteredOut).toHaveLength(0);
    expect(result.retryRequired).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("filters items below and above budget bounds", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "Too Low", price_anchor: 19 },
        { name: "Good", price_anchor: 25 },
        { name: "Too High", price_anchor: 40 },
      ],
      20,
      30,
    );

    expect(result.filtered.map((item) => item.name)).toEqual(["Good"]);
    expect(result.filteredOut).toEqual([
      {
        recommendation: { name: "Too Low", price_anchor: 19 },
        reason: BUDGET_FILTER_REJECT_REASONS.BELOW_MIN,
        parsedPrice: 19,
      },
      {
        recommendation: { name: "Too High", price_anchor: 40 },
        reason: BUDGET_FILTER_REJECT_REASONS.ABOVE_MAX,
        parsedPrice: 40,
      },
    ]);
    expect(result.retryRequired).toBe(true);
    expect(result.warning?.code).toBe(RECOMMENDATION_V2_WARNING_CODES.LIMITED_RESULTS);
  });

  it("parses numeric string price anchors", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "String Price", price_anchor: "45.00" },
        { name: "Integer String", price_anchor: "50" },
        { name: "Trimmed String", price_anchor: " 55 " },
      ],
      40,
      60,
    );

    expect(result.filtered.map((item) => item.name)).toEqual(["String Price", "Integer String", "Trimmed String"]);
    expect(result.retryRequired).toBe(false);
  });

  it("rejects missing and invalid prices", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "Missing", price_anchor: null },
        { name: "Undefined", price_anchor: undefined },
        { name: "Invalid", price_anchor: "not-a-number" },
        { name: "Valid", price_anchor: 25 },
      ],
      20,
      30,
    );

    expect(result.filtered.map((item) => item.name)).toEqual(["Valid"]);
    expect(result.filteredOut).toEqual([
      {
        recommendation: { name: "Missing", price_anchor: null },
        reason: BUDGET_FILTER_REJECT_REASONS.MISSING_PRICE,
        parsedPrice: null,
      },
      {
        recommendation: { name: "Undefined", price_anchor: undefined },
        reason: BUDGET_FILTER_REJECT_REASONS.MISSING_PRICE,
        parsedPrice: null,
      },
      {
        recommendation: { name: "Invalid", price_anchor: "not-a-number" },
        reason: BUDGET_FILTER_REJECT_REASONS.INVALID_PRICE,
        parsedPrice: null,
      },
    ]);
    expect(result.retryRequired).toBe(true);
  });

  it("allows zero-priced gifts when the lower bound is zero", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "Free", price_anchor: 0 },
        { name: "Cheap", price_anchor: 5 },
        { name: "Affordable", price_anchor: 10 },
      ],
      0,
      10,
    );

    expect(result.filtered).toHaveLength(3);
    expect(result.warning).toBeNull();
  });

  it("returns a limited-results warning when fewer than three items survive", () => {
    const result = enforceBudget<TestRecommendation>(
      [
        { name: "Good One", price_anchor: 22 },
        { name: "Too Low", price_anchor: 5 },
      ],
      20,
      25,
    );

    expect(result.filtered.map((item) => item.name)).toEqual(["Good One"]);
    expect(result.retryRequired).toBe(true);
    expect(result.warning).toEqual({
      code: RECOMMENDATION_V2_WARNING_CODES.LIMITED_RESULTS,
      message: "We found 1 personalized match within your exact $20-$25 budget. Consider widening the range slightly for more options.",
    });
  });

  it("throws on invalid budget ranges", () => {
    expect(() => enforceBudget<TestRecommendation>([], 50, 20)).toThrow(RangeError);
    expect(() => enforceBudget<TestRecommendation>([], -1, 20)).toThrow(RangeError);
  });
});
