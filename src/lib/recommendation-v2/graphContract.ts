export const RECOMMENDATION_GRAPH_NODE_ORDER = [
  "recipient_analyzer",
  "cultural_context_retriever",
  "past_gift_retriever",
  "gift_generator",
  "budget_enforcer",
  "personalization_validator",
  "response_formatter",
] as const;

export type RecommendationGraphNodeId = (typeof RECOMMENDATION_GRAPH_NODE_ORDER)[number];
