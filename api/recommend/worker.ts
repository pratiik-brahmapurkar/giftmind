import type { Json } from "../../src/integrations/supabase/types.js";
import { GraphExecutionError } from "../../src/lib/recommendation-v2/runtime.js";
import {
  hasInternalRecommendationWorkerAccess,
  jsonResponse,
  getBearerToken,
  readJson,
} from "../_lib/http.js";
import {
  buildRecommendationGraphProgressUpdate,
  createInitialRecommendationGraphState,
  executeRecommendationGraph,
  hydrateRecommendationGraphState,
  isExecutionLeaseActive,
  readPersistedRecommendationRequestBody,
  readPersistedRecommendationExecution,
  serializeRecommendationGraphState,
  withExecutionMetadata,
  type RecipientRecord,
  type RecommendationGraphState,
} from "../_lib/recommendationGraph.js";
import {
  createServiceRoleSupabaseClient,
  createUserSupabaseClient,
  getAuthenticatedUser,
  getServiceRoleToken,
} from "../_lib/supabase.js";

interface WorkerRequestBody {
  session_id: string;
}

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

  const internalAccess = hasInternalRecommendationWorkerAccess(request);
  const bearerToken = getBearerToken(request);

  if (!internalAccess && !bearerToken) {
    return jsonResponse({ message: "Missing bearer token", errorType: "AUTH_REQUIRED" }, 401);
  }

  const user = internalAccess ? null : await getAuthenticatedUser(bearerToken!);
  if (!internalAccess && !user) {
    return jsonResponse({ message: "Unauthorized", errorType: "AUTH_REQUIRED" }, 401);
  }

  const body = await readJson<WorkerRequestBody>(request);
  const supabase = internalAccess ? createServiceRoleSupabaseClient() : createUserSupabaseClient(bearerToken!);
  const executionToken = internalAccess ? getServiceRoleToken() : bearerToken!;

  let sessionQuery = supabase
    .from("gift_sessions")
    .select("id, user_id, recipient_id, graph_state, ai_response, engine_version")
    .eq("id", body.session_id);

  if (!internalAccess) {
    sessionQuery = sessionQuery.eq("user_id", user!.id);
  }

  const { data: session, error: sessionError } = await sessionQuery.single();

  if (sessionError || !session) {
    return jsonResponse({ message: "Gift session not found" }, 404);
  }

  if (session.ai_response) {
    return jsonResponse({
      session_id: body.session_id,
      status: "completed",
      skipped: true,
    });
  }

  const persistedRequestBody = readPersistedRecommendationRequestBody(session.graph_state);
  if (!persistedRequestBody) {
    return jsonResponse({ message: "Graph state is missing session input." }, 400);
  }

  const existingExecution = readPersistedRecommendationExecution(session.graph_state);
  if (isExecutionLeaseActive(existingExecution)) {
    return jsonResponse({
      session_id: body.session_id,
      status: "already_running",
    }, 202);
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("recipients")
    .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
    .eq("id", persistedRequestBody.recipient_id)
    .eq("user_id", user.id)
    .single();

  if (recipientError || !recipient) {
    return jsonResponse({ message: "Recipient not found" }, 404);
  }

  const baseState = createInitialRecommendationGraphState({
    accessToken: executionToken,
    userId: session.user_id,
    body: persistedRequestBody,
    recipient: recipient as RecipientRecord,
    supabase,
  });

  const initialState = hydrateRecommendationGraphState(baseState, session.graph_state);
  let currentState: RecommendationGraphState = initialState;
  const runId = crypto.randomUUID();
  const leaseDurationMs = 20_000;

  const acquireLeaseState = withExecutionMetadata(
    serializeRecommendationGraphState(initialState),
    {
      attemptCount: (existingExecution?.attemptCount ?? 0) + 1,
      lastRunId: runId,
      leaseOwnerId: runId,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    },
  );

  const persistProgress = async (
    state: RecommendationGraphState,
    extra?: Record<string, unknown>,
  ) => {
    await supabase
      .from("gift_sessions")
      .update({
        ...buildRecommendationGraphProgressUpdate(state),
        graph_state: withExecutionMetadata(
          serializeRecommendationGraphState(state),
          {
            attemptCount: (existingExecution?.attemptCount ?? 0) + 1,
            lastRunId: runId,
            leaseOwnerId: runId,
            leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
            lastHeartbeatAt: new Date().toISOString(),
            lastEnqueuedAt: existingExecution?.lastEnqueuedAt ?? null,
          },
        ) as unknown as Json,
        ...(extra ?? {}),
      })
      .eq("id", body.session_id)
      .eq("user_id", session.user_id);
  };

  const failSession = async (state: RecommendationGraphState) => {
    await supabase
      .from("gift_sessions")
      .update({
        node_timings: state.nodeTimings as unknown as Json,
        engine_version: "v2",
        graph_state: withExecutionMetadata(
          serializeRecommendationGraphState(state),
          {
            attemptCount: (existingExecution?.attemptCount ?? 0) + 1,
            lastRunId: runId,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: new Date().toISOString(),
            lastEnqueuedAt: existingExecution?.lastEnqueuedAt ?? null,
          },
        ) as unknown as Json,
        status: "abandoned",
      })
      .eq("id", body.session_id)
      .eq("user_id", session.user_id);
  };

  const { error: leaseError } = await supabase
    .from("gift_sessions")
    .update({
      ...buildRecommendationGraphProgressUpdate(initialState),
      graph_state: acquireLeaseState as unknown as Json,
    })
    .eq("id", body.session_id)
    .eq("user_id", session.user_id);

  if (leaseError) {
    return jsonResponse({ message: leaseError.message }, 500);
  }

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
        graph_state: null,
        status: "active",
      })
      .eq("id", body.session_id)
      .eq("user_id", session.user_id);

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

    console.error("Failed to execute recommendation worker:", error);
    return jsonResponse(
      {
        message: getErrorMessage(error),
        errorType: "AI_ERROR",
      },
      getErrorStatus(error),
    );
  }
}
