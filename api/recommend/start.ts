import type { Json } from "../../src/integrations/supabase/types";
import { GraphExecutionError } from "../../src/lib/recommendation-v2/runtime";
import { jsonResponse, getBearerToken, readJson } from "../_lib/http";
import {
  buildRecommendationGraphProgressUpdate,
  createInitialRecommendationGraphState,
  executeRecommendationGraph,
  type RecipientRecord,
  type RecommendationGraphState,
  type StartRequestBody,
} from "../_lib/recommendationGraph";
import { createUserSupabaseClient, getAuthenticatedUser } from "../_lib/supabase";

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Recommendation generation failed");
  }

  return "Recommendation generation failed";
}

function getErrorPayload(error: unknown) {
  if (typeof error === "object" && error && "payload" in error) {
    return (error as { payload?: Record<string, unknown> }).payload ?? null;
  }

  if (error instanceof GraphExecutionError && typeof error.cause === "object" && error.cause && "payload" in error.cause) {
    return ((error.cause as { payload?: Record<string, unknown> }).payload) ?? null;
  }

  return null;
}

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    return Number((error as { status?: number }).status ?? 500);
  }

  if (error instanceof GraphExecutionError && typeof error.cause === "object" && error.cause && "status" in error.cause) {
    return Number((error.cause as { status?: number }).status ?? 500);
  }

  return 500;
}

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
      .select("id, user_id, recipient_id, regeneration_count")
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

  const initialState = createInitialRecommendationGraphState({
    accessToken,
    userId: user.id,
    body,
    recipient: recipient as RecipientRecord,
    supabase,
  });

  let currentState: RecommendationGraphState = initialState;

  const persistProgress = async (
    state: RecommendationGraphState,
    extra?: Record<string, unknown>,
  ) => {
    await supabase
      .from("gift_sessions")
      .update({
        ...buildRecommendationGraphProgressUpdate(state),
        ...(extra ?? {}),
      })
      .eq("id", body.session_id)
      .eq("user_id", user.id);
  };

  const failSession = async (state: RecommendationGraphState) => {
    await supabase
      .from("gift_sessions")
      .update({
        node_timings: state.nodeTimings as unknown as Json,
        engine_version: "v2",
        status: "abandoned",
      })
      .eq("id", body.session_id)
      .eq("user_id", user.id);
  };

  await persistProgress(initialState, {
    ai_response: null,
    product_results: null,
    personalization_scores: null,
    cultural_rules_applied: 0,
    past_gifts_checked: 0,
  });

  try {
    const execution = await executeRecommendationGraph(initialState, {
      onNodeComplete: async (state) => {
        currentState = state;
        await persistProgress(state);
      },
    });

    currentState = execution.state;

    const { error: updateError } = await supabase
      .from("gift_sessions")
      .update({
        ...buildRecommendationGraphProgressUpdate(currentState),
        ai_response: currentState.normalizedResponse as unknown as Json,
        product_results: currentState.productResults,
        confidence_score: currentState.topConfidence,
        personalization_scores: currentState.personalization?.scores as unknown as Json ?? null,
        cultural_rules_applied: currentState.culturalRules.length,
        past_gifts_checked: currentState.pastGifts.length + currentState.semanticPastGiftChecks,
        engine_version: "v2",
        status: "active",
      })
      .eq("id", body.session_id)
      .eq("user_id", user.id);

    if (updateError) {
      await failSession(currentState);
      return jsonResponse({ message: updateError.message }, 500);
    }

    const warning =
      currentState.normalizedResponse?._warning_message
        ? {
            code: currentState.normalizedResponse._warning ?? "LIMITED_RESULTS",
            message: currentState.normalizedResponse._warning_message,
          }
        : null;

    return jsonResponse({
      session_id: body.session_id,
      status: "completed",
      warnings: warning ? [warning] : [],
    });
  } catch (error) {
    const failedState = error instanceof GraphExecutionError ? error.state : currentState;
    await failSession(failedState);

    const payload = getErrorPayload(error);
    if (payload) {
      return jsonResponse(payload, getErrorStatus(error));
    }

    console.error("Failed to execute recommendation v2 graph:", error);
    return jsonResponse(
      {
        message: getErrorMessage(error),
        errorType: "AI_ERROR",
      },
      getErrorStatus(error),
    );
  }
}
