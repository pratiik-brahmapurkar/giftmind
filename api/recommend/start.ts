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
import { DEFAULT_GIFT_GENERATION_UNITS } from "../../src/lib/credits.js";

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

  if (!body.action_id) {
    return jsonResponse({ message: "action_id is required", errorType: "GENERIC" }, 400);
  }

  const now = new Date();
  const nextResetIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const { data: publicSettings } = await supabase.rpc("get_public_platform_settings", {
    p_keys: ["gift_generation_units"],
  });

  const giftGenerationUnits =
    publicSettings && typeof publicSettings === "object" && !Array.isArray(publicSettings) && "gift_generation_units" in publicSettings
      ? Number((publicSettings as { gift_generation_units?: unknown }).gift_generation_units ?? DEFAULT_GIFT_GENERATION_UNITS)
      : DEFAULT_GIFT_GENERATION_UNITS;

  let { data: userProfile } = await supabase
    .from("users")
    .select("active_plan, credits_balance")
    .eq("id", user.id)
    .single();

  const plan = userProfile?.active_plan ?? body.user_plan ?? "spark";
  if (plan === "spark") {
    await supabase.rpc("issue_free_monthly_credits", { p_user_id: user.id }).catch(() => null);
    const refreshed = await supabase
      .from("users")
      .select("active_plan, credits_balance")
      .eq("id", user.id)
      .single();

    if (!refreshed.error && refreshed.data) {
      userProfile = refreshed.data;
    }
  }

  if ((userProfile?.credits_balance ?? 0) < giftGenerationUnits) {
    return jsonResponse(
      {
        error: "NO_CREDITS",
        message: "You're out of credits for this month.",
        next_reset: nextResetIso,
        show_upgrade: true,
        upgrade_to: "thoughtful",
        errorType: "NO_CREDITS",
      },
      402,
    );
  }

  const { data: deductResult, error: deductError } = await supabase.rpc("deduct_user_credit", {
    p_user_id: user.id,
    p_session_id: body.session_id,
    p_amount: giftGenerationUnits,
    p_action_id: body.action_id,
    p_action_type: "gift_generation",
  });

  if (deductError) {
    return jsonResponse({ message: deductError.message, errorType: "CREDIT_ERROR" }, 500);
  }

  if (!deductResult || (typeof deductResult === "object" && "success" in deductResult && deductResult.success === false)) {
    return jsonResponse(
      {
        error: "NO_CREDITS",
        message: "You're out of credits for this month.",
        next_reset: nextResetIso,
        show_upgrade: true,
        upgrade_to: "thoughtful",
        errorType: "NO_CREDITS",
      },
      402,
    );
  }

  const persistedBody: StartRequestBody = {
    ...body,
    action_id: body.action_id,
    gift_generation_units: giftGenerationUnits,
  };

  const baseState = createInitialRecommendationGraphState({
    accessToken,
    userId: user.id,
    body: persistedBody,
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
    await supabase.rpc("refund_user_credit", {
      p_user_id: user.id,
      p_session_id: body.session_id,
      p_amount: giftGenerationUnits,
      p_reason: "gift_generation_queue_failed",
      p_action_id: body.action_id,
    }).catch(() => null);

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
