import { describe, expect, it } from "vitest";

import { buildGiftEmbeddingText, buildRecipientEmbeddingText } from "./embeddings";

describe("buildRecipientEmbeddingText", () => {
  it("includes the main recipient profile fields", () => {
    const text = buildRecipientEmbeddingText({
      id: "r1",
      name: "Priya",
      relationship: "parent",
      relationship_depth: "very_close",
      age_range: "55-64",
      gender: "female",
      interests: ["gardening", "cooking"],
      cultural_context: "indian_hindu",
      country: "IN",
      notes: "Loves practical gifts and avoids clutter.",
    });

    expect(text).toContain("Recipient: Priya");
    expect(text).toContain("Relationship: parent (very_close)");
    expect(text).toContain("Interests: gardening, cooking");
    expect(text).toContain("Cultural context: indian_hindu");
  });

  it("falls back cleanly when optional fields are sparse", () => {
    const text = buildRecipientEmbeddingText({
      id: "r2",
      name: "Alex",
      relationship: "",
      relationship_depth: "",
      age_range: "",
      gender: "",
      interests: [],
      cultural_context: "",
      country: null,
      notes: "",
    });

    expect(text).toContain("Relationship: unknown (unspecified closeness)");
    expect(text).toContain("Interests: unknown");
    expect(text).toContain("Country: unknown");
  });
});

describe("buildGiftEmbeddingText", () => {
  it("includes gift details and occasion context", () => {
    const text = buildGiftEmbeddingText({
      recommendation: {
        name: "Artisan Tea Box",
        description: "A curated tea set with seasonal blends.",
        why_it_works: "Matches her evening ritual and love of small comforts.",
        confidence_score: 88,
        signal_interpretation: "High match",
        search_keywords: ["artisan tea", "gift box"],
        product_category: "food_and_drink",
        price_anchor: 42,
        what_not_to_do: "Avoid coffee gear.",
      },
      occasion: "birthday",
      recipient: {
        relationship: "friend",
        cultural_context: "western",
        country: "US",
      },
    });

    expect(text).toContain("Gift: Artisan Tea Box");
    expect(text).toContain("Occasion: birthday");
    expect(text).toContain("Relationship: friend");
    expect(text).toContain("Country: US");
  });

  it("handles missing description fields gracefully", () => {
    const text = buildGiftEmbeddingText({
      recommendation: {
        name: "Minimal Desk Tray",
        description: "",
        why_it_works: "",
        confidence_score: 72,
        signal_interpretation: "Moderate match",
        search_keywords: ["desk tray"],
        product_category: "home",
        price_anchor: 25,
        what_not_to_do: "",
      },
      occasion: "farewell",
      recipient: null,
    });

    expect(text).toContain("Gift: Minimal Desk Tray");
    expect(text).toContain("Occasion: farewell");
    expect(text).not.toContain("Description:");
  });
});
