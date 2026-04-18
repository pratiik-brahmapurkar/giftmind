import { describe, expect, it } from "vitest";

import {
  createInitialRecommendationGraphState,
  hydrateRecommendationGraphState,
  serializeRecommendationGraphState,
} from "../../../api/_lib/recommendationGraph";

describe("recommendation graph state persistence", () => {
  it("serializes and rehydrates graph progress", () => {
    const baseState = createInitialRecommendationGraphState({
      accessToken: "token",
      userId: "user-1",
      body: {
        session_id: "session-1",
        recipient_id: "recipient-1",
        occasion: "birthday",
        occasion_date: null,
        budget_min: 10,
        budget_max: 50,
        currency: "USD",
        recipient_country: "US",
        user_country: "US",
        special_context: "loves tea",
        context_tags: ["birthday"],
        user_plan: "spark",
      },
      recipient: {
        id: "recipient-1",
        name: "Priya",
        relationship: "friend",
        relationship_depth: "close",
        age_range: "25-34",
        gender: "female",
        interests: ["tea"],
        cultural_context: "indian_hindu",
        country: "IN",
        notes: "Enjoys cozy gifts",
      },
      supabase: {} as never,
    });

    const persisted = serializeRecommendationGraphState({
      ...baseState,
      nodeTimings: {
        recipient_analyzer: 12,
        cultural_context_retriever: 5,
      },
      recipientEmbeddingSource: "Recipient: Priya",
      queryEmbeddingVector: "[0.1,0.2]",
      culturalRules: [
        {
          id: "rule-1",
          rule_text: "Avoid leather",
          rule_type: "hard_constraint",
          confidence: 0.9,
          similarity: 0.8,
          context_tags: ["festival"],
          avoid_examples: ["leather wallet"],
          suggest_instead: ["cotton item"],
        },
      ],
      pastGifts: [
        {
          gift_name: "Tea Set",
          occasion: "birthday",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      augmentedSpecialContext: "Avoid leather",
      normalizedResponse: {
        recommendations: [],
        occasion_insight: "insight",
        budget_assessment: "budget",
        cultural_note: "note",
      },
      personalization: {
        recommendations: [],
        scores: [{ gift_index: 0, score: 80, was_rewritten: false, original_score: null, reasons: [] }],
        averageScore: 80,
      },
      semanticFilteredCount: 1,
      semanticPastGiftChecks: 2,
    });

    const hydrated = hydrateRecommendationGraphState(baseState, persisted as never);

    expect(hydrated.nodeTimings.recipient_analyzer).toBe(12);
    expect(hydrated.queryEmbeddingVector).toBe("[0.1,0.2]");
    expect(hydrated.culturalRules).toHaveLength(1);
    expect(hydrated.personalization?.averageScore).toBe(80);
    expect(hydrated.semanticFilteredCount).toBe(1);
    expect(hydrated.semanticPastGiftChecks).toBe(2);
  });

  it("ignores invalid persisted payloads", () => {
    const baseState = createInitialRecommendationGraphState({
      accessToken: "token",
      userId: "user-1",
      body: {
        session_id: "session-1",
        recipient_id: "recipient-1",
        occasion: "birthday",
        occasion_date: null,
        budget_min: 10,
        budget_max: 50,
        currency: "USD",
        recipient_country: "US",
        user_country: "US",
        special_context: "",
        context_tags: [],
        user_plan: "spark",
      },
      recipient: {
        id: "recipient-1",
        name: "Priya",
        relationship: "friend",
        relationship_depth: "close",
        age_range: "25-34",
        gender: "female",
        interests: [],
        cultural_context: "",
        country: "IN",
        notes: "",
      },
      supabase: {} as never,
    });

    const hydrated = hydrateRecommendationGraphState(baseState, { version: 2 } as never);
    expect(hydrated).toEqual(baseState);
  });
});
