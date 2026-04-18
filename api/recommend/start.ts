import type { Json } from "../../src/integrations/supabase/types.js";
import { jsonResponse, getBearerToken, readJson } from "../_lib/http.js";
import {
  buildRecommendationGraphProgressUpdate,
  createInitialRecommendationGraphState,
  hydrateRecommendationGraphState,
  serializeRecommendationGraphState,
  withExecutionMetadata,
  type RecipientRecord,
  type StartRequestBody,
} from "../_lib/recommendationGraph.js";
import { createUserSupabaseClient, getAuthenticatedUser } from "../_lib/supabase.js";

export default async function handler(request: Request) {
  if (request.method !== "POST") {
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

  const body = await readJson<StartRequestBody>(request);
  const supabase = createUserSupabaseClient(accessToken);

  const [{ data: session, error: sessionError }, { data: recipient, error: recipientError }] = await Promise.all([
    supabase
      .from("gift_sessions")
      .select("id, user_id, recipient_id, regeneration_count, status, engine_version, graph_state, ai_response")
      .eq("id", body.session_id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("recipients")
      .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
      .eq("id", body.recipient_id)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (sessionError || !session) {
    return jsonResponse({ message: "Gift session not found" }, 404);
  }

  if (recipientError || !recipient) {
    return jsonResponse({ message: "Recipient not found" }, 404);
  }

  if (session.recipient_id !== body.recipient_id) {
    return jsonResponse({ message: "Recipient does not match session" }, 400);
  }

  if (session.ai_response && !body.is_regeneration) {
    return jsonResponse({
      session_id: body.session_id,
      status: "completed",
      resumed: false,
    });
  }

  const baseState = createInitialRecommendationGraphState({
    accessToken,
    userId: user.id,
    body,
    recipient: recipient as RecipientRecord,
    supabase,
  });

  const shouldResume =
    !body.is_regeneration &&
    !session.ai_response &&
    session.graph_state &&
    session.engine_version === "v2";

  const initialState = shouldResume
    ? hydrateRecommendationGraphState(baseState, session.graph_state)
    : baseState;

  const { error: queueError } = await supabase
    .from("gift_sessions")
    .update({
      ...buildRecommendationGraphProgressUpdate(initialState),
      graph_state: withExecutionMetadata(
        serializeRecommendationGraphState(initialState),
        {
          lastEnqueuedAt: new Date().toISOString(),
        },
      ) as unknown as Json,
      ai_response: shouldResume ? session.ai_response : null,
      product_results: shouldResume ? undefined : null,
      personalization_scores: shouldResume ? undefined : null,
      cultural_rules_applied: shouldResume ? initialState.culturalRules.length : 0,
      past_gifts_checked: shouldResume ? initialState.pastGifts.length + initialState.semanticPastGiftChecks : 0,
    })
    .eq("id", body.session_id)
    .eq("user_id", user.id);

  if (queueError) {
    return jsonResponse({ message: queueError.message }, 500);
  }

  const workerUrl = new URL("/api/recommend/worker", request.url);
  void fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-recommendation-worker-secret": process.env.RECOMMENDATION_WORKER_SECRET ?? "",
    },
    body: JSON.stringify({
      session_id: body.session_id,
    }),
  }).catch((error) => {
    console.error("Failed to trigger recommendation worker:", error);
  });

  return jsonResponse({
    session_id: body.session_id,
    status: "accepted",
    resumed: shouldResume,
  }, 202);
}
