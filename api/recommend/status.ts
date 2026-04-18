import { jsonResponse, getBearerToken } from "../_lib/http.js";
import { inferProgressSnapshot } from "../_lib/recommendationProgress.js";
import {
  isExecutionLeaseActive,
  isExecutionStale,
  readPersistedRecommendationExecution,
} from "../_lib/recommendationGraph.js";
import { createUserSupabaseClient, getAuthenticatedUser } from "../_lib/supabase.js";

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse({ message: "Method not allowed" }, 405);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonResponse({ message: "Missing bearer token", errorType: "AUTH_REQUIRED" }, 401);
  }

  const user = await getAuthenticatedUser(accessToken);
  if (!user) {
    return jsonResponse({ message: "Unauthorized", errorType: "AUTH_REQUIRED" }, 401);
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return jsonResponse({ message: "session_id is required" }, 400);
  }

  const supabase = createUserSupabaseClient(accessToken);
  const { data: session, error } = await supabase
    .from("gift_sessions")
    .select("id, status, ai_response, product_results, ai_latency_ms, ai_provider_used, ai_attempt_number, engine_version, node_timings, cultural_rules_applied, past_gifts_checked, personalization_scores, graph_state")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (error || !session) {
    return jsonResponse({ message: "Gift session not found" }, 404);
  }

  const { aiResponse, completed, failed, nodesCompleted, currentNode } = inferProgressSnapshot(session);
  const execution = readPersistedRecommendationExecution(session.graph_state);
  const stale = isExecutionStale(execution);
  const leaseActive = isExecutionLeaseActive(execution);
  const avgPersonalizationScore =
    typeof aiResponse?._meta === "object" && aiResponse?._meta && "avg_personalization_score" in aiResponse._meta
      ? aiResponse._meta.avg_personalization_score
      : null;

  return jsonResponse({
    session_id: session.id,
    status: failed ? "failed" : completed ? "completed" : session.status === "in_progress" ? "in_progress" : "pending",
    current_node: currentNode,
    nodes_completed: nodesCompleted,
    recommendations: completed ? aiResponse?.recommendations ?? null : null,
    product_results: session.product_results ?? null,
    occasion_insight: completed ? aiResponse?.occasion_insight ?? null : null,
    budget_assessment: completed ? aiResponse?.budget_assessment ?? null : null,
    cultural_note: completed ? aiResponse?.cultural_note ?? null : null,
    warning:
      completed && typeof aiResponse?._warning_message === "string"
        ? {
            code: typeof aiResponse?._warning === "string" ? aiResponse._warning : "LIMITED_RESULTS",
            message: aiResponse._warning_message,
          }
        : null,
    total_duration_ms: session.ai_latency_ms ?? null,
    meta: {
      provider: completed ? session.ai_provider_used ?? null : null,
      attempt: completed ? session.ai_attempt_number ?? null : null,
      engine_version: session.engine_version ?? null,
      node_timings: session.node_timings ?? null,
      cultural_rules_applied: session.cultural_rules_applied ?? 0,
      past_gifts_checked: session.past_gifts_checked ?? 0,
      personalization_scores: session.personalization_scores ?? null,
      avg_personalization_score: avgPersonalizationScore,
      execution: {
        attempt_count: execution?.attemptCount ?? 0,
        lease_active: leaseActive,
        last_heartbeat_at: execution?.lastHeartbeatAt ?? null,
        stale,
        recoverable: !completed && !failed && Boolean(session.graph_state) && !leaseActive,
      },
    },
    error: failed
      ? {
          code: "GENERATION_FAILED",
          message: "Recommendation generation failed.",
        }
      : null,
  });
}
