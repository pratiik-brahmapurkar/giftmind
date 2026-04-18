import { RECOMMENDATION_GRAPH_NODE_ORDER } from "../../src/lib/recommendation-v2/graphContract";

function getObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function inferProgressSnapshot(session: {
  status?: string | null;
  ai_response?: unknown;
  node_timings?: unknown;
}) {
  const aiResponse = getObject(session.ai_response);
  const completed = Boolean(aiResponse && Array.isArray(aiResponse.recommendations));
  const failed = session.status === "abandoned";
  const timings = getObject(session.node_timings) ?? {};
  const nodesCompleted = RECOMMENDATION_GRAPH_NODE_ORDER.filter((node) => node in timings);

  const currentNode = failed
    ? "gift_generator"
    : completed
      ? "response_formatter"
      : session.status === "in_progress"
        ? RECOMMENDATION_GRAPH_NODE_ORDER.find((node) => !(node in timings)) ?? "response_formatter"
        : "gift_generator";

  return {
    aiResponse,
    completed,
    failed,
    nodeTimings: timings,
    nodesCompleted,
    currentNode,
  };
}
