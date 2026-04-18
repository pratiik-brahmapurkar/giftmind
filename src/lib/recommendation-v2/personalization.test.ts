import { describe, expect, it } from "vitest";

import { validateAndRankRecommendations } from "./personalization";

const recipient = {
  id: "r1",
  name: "Priya",
  relationship: "parent",
  relationship_depth: "very_close",
  age_range: "55-64",
  gender: "female",
  interests: ["gardening", "cooking"],
  cultural_context: "indian_hindu",
  country: "IN",
  notes: "Values practical gifts.",
};

describe("validateAndRankRecommendations", () => {
  it("ranks interest-aligned gifts above generic ones", () => {
    const result = validateAndRankRecommendations(
      [
        {
          name: "Generic Gift Card",
          description: "A flexible option for anything she wants.",
          why_it_works: "It is easy and safe.",
          confidence_score: 70,
          signal_interpretation: "Useful",
          search_keywords: ["gift card"],
          product_category: "general",
          price_anchor: 40,
          what_not_to_do: "Avoid overthinking.",
        },
        {
          name: "Raised Herb Garden Kit",
          description: "A compact indoor herb garden for home cooks.",
          why_it_works: "It matches her love of gardening and cooking.",
          confidence_score: 82,
          signal_interpretation: "Shows you notice her hobbies and daily rituals.",
          search_keywords: ["herb garden", "cooking gift"],
          product_category: "home_decor",
          price_anchor: 45,
          what_not_to_do: "Avoid something too decorative.",
        },
      ],
      {
        recipient,
        specialContext: "birthday dinner with family",
        contextTags: ["birthday"],
        pastGiftNames: [],
      },
    );

    expect(result.recommendations[0].name).toBe("Raised Herb Garden Kit");
    expect(result.scores[0].score).toBeGreaterThan(result.scores[1].score);
  });

  it("penalizes exact repeat gifts", () => {
    const result = validateAndRankRecommendations(
      [
        {
          name: "Cooking Class",
          description: "A local hands-on cooking workshop.",
          why_it_works: "It matches her interest in cooking.",
          confidence_score: 80,
          signal_interpretation: "Thoughtful",
          search_keywords: ["cooking class"],
          product_category: "experience",
          price_anchor: 55,
          what_not_to_do: "Avoid generic gadgets.",
        },
      ],
      {
        recipient,
        specialContext: "",
        contextTags: [],
        pastGiftNames: ["Cooking Class"],
      },
    );

    expect(result.scores[0].reasons).toContain("repeat_gift_penalty");
    expect(result.scores[0].score).toBeLessThan(50);
  });

  it("lightly rewrites weak why_it_works text when personalization is thin", () => {
    const result = validateAndRankRecommendations(
      [
        {
          name: "Ceramic Planter",
          description: "A handcrafted planter.",
          why_it_works: "This is a nice present.",
          confidence_score: 68,
          signal_interpretation: "Warm",
          search_keywords: ["planter"],
          product_category: "home_decor",
          price_anchor: 30,
          what_not_to_do: "Avoid generic decor.",
        },
      ],
      {
        recipient,
        specialContext: "birthday",
        contextTags: ["birthday"],
        pastGiftNames: [],
      },
    );

    expect(result.scores[0].was_rewritten).toBe(true);
    expect(result.recommendations[0].why_it_works).toContain("interest in gardening");
  });

  it("penalizes semantically similar past gifts", () => {
    const result = validateAndRankRecommendations(
      [
        {
          name: "Loose Leaf Tea Sampler",
          description: "A curated tea tasting set.",
          why_it_works: "It feels thoughtful and calming.",
          confidence_score: 72,
          signal_interpretation: "Comforting",
          search_keywords: ["tea sampler"],
          product_category: "food",
          price_anchor: 35,
          what_not_to_do: "Avoid generic snacks.",
        },
      ],
      {
        recipient,
        specialContext: "",
        contextTags: [],
        pastGiftNames: [],
        semanticRepeatMatchesByGiftName: {
          "Loose Leaf Tea Sampler": [
            {
              gift_name: "Tea Subscription Box",
              gift_description: "Monthly tea box",
              occasion: "birthday",
              reaction: "didnt_like",
              similarity: 0.88,
              gifted_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
      },
    );

    expect(result.scores[0].reasons).toContain("semantic_repeat_penalty");
    expect(result.scores[0].reasons).toContain("negative_feedback_history");
    expect(result.scores[0].score).toBeLessThan(50);
  });
});
