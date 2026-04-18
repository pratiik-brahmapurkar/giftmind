import { describe, expect, it } from "vitest";

import { applySemanticMemoryGuard, SEMANTIC_REPEAT_DROP_THRESHOLD, SEMANTIC_REPEAT_PENALTY_THRESHOLD } from "./memory";

const baseRecommendation = {
  description: "Thoughtful gift",
  why_it_works: "Relevant to the recipient",
  confidence_score: 0.8,
  signal_interpretation: "Strong signal",
  search_keywords: ["thoughtful"],
  product_category: "hobby",
  price_anchor: 50,
  what_not_to_do: "Avoid generic options",
};

describe("applySemanticMemoryGuard", () => {
  it("drops hard semantic repeats", () => {
    const result = applySemanticMemoryGuard(
      [
        { ...baseRecommendation, name: "Leather Journal" },
        { ...baseRecommendation, name: "Tea Sampler" },
      ],
      {
        "Leather Journal": [
          {
            gift_name: "Leather Journal",
            gift_description: "Premium journal",
            occasion: "birthday",
            reaction: "liked_it",
            similarity: SEMANTIC_REPEAT_DROP_THRESHOLD,
            gifted_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    );

    expect(result.recommendations.map((entry) => entry.name)).toEqual(["Tea Sampler"]);
    expect(result.filteredCount).toBe(1);
    expect(result.assessments[0]?.decision).toBe("drop");
  });

  it("keeps softer repeats but marks them for penalty", () => {
    const result = applySemanticMemoryGuard(
      [
        { ...baseRecommendation, name: "Tea Sampler" },
        { ...baseRecommendation, name: "Sketchbook Set" },
      ],
      {
        "Tea Sampler": [
          {
            gift_name: "Loose Leaf Tea Box",
            gift_description: "Tea gift",
            occasion: "anniversary",
            reaction: "neutral",
            similarity: SEMANTIC_REPEAT_PENALTY_THRESHOLD,
            gifted_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    );

    expect(result.recommendations).toHaveLength(2);
    expect(result.penalizedMatchesByGiftName["Tea Sampler"]).toHaveLength(1);
    expect(result.assessments[0]?.decision).toBe("penalize");
  });

  it("keeps the lowest-risk fallback when every candidate would be dropped", () => {
    const result = applySemanticMemoryGuard(
      [
        { ...baseRecommendation, name: "Tea Sampler" },
        { ...baseRecommendation, name: "Sketchbook Set" },
      ],
      {
        "Tea Sampler": [
          {
            gift_name: "Tea Sampler",
            gift_description: "Tea gift",
            occasion: "birthday",
            reaction: "liked_it",
            similarity: 0.99,
            gifted_at: "2026-01-01T00:00:00Z",
          },
        ],
        "Sketchbook Set": [
          {
            gift_name: "Artist Sketch Kit",
            gift_description: "Art gift",
            occasion: "birthday",
            reaction: "liked_it",
            similarity: 0.95,
            gifted_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.name).toBe("Sketchbook Set");
  });
});
