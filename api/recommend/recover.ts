import {
  hasInternalRecommendationWorkerAccess,
  jsonResponse,
  getBearerToken,
  readJson,
} from "../_lib/http.js";
import {
  isExecutionLeaseActive,
  readPersistedRecommendationExecution,
  readPersistedRecommendationRequestBody,
} from "../_lib/recommendationGraph.js";
import {
  createServiceRoleSupabaseClient,
  createUserSupabaseClient,
  getAuthenticatedUser,
} from "../_lib/supabase.js";

interface RecoverRequestBody {
  session_id: string;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ message: "Method not allowed" }, 405);
  }

  const internalAccess = hasInternalRecommendationWorkerAccess(request);
  const accessToken = getBearerToken(request);
  if (!internalAccess && !accessToken) {
    return jsonResponse({ message: "Missing bearer token", errorType: "AUTH_REQUIRED" }, 401);
  }

  const user = internalAccess ? null : await getAuthenticatedUser(accessToken!);
  if (!internalAccess && !user) {
    return jsonResponse({ message: "Unauthorized", errorType: "AUTH_REQUIRED" }, 401);
  }

  const body = await readJson<RecoverRequestBody>(request);
  const supabase = internalAccess ? createServiceRoleSupabaseClient() : createUserSupabaseClient(accessToken!);

  let sessionQuery = supabase
    .from("gift_sessions")
    .select("id, user_id, ai_response, graph_state")
    .eq("id", body.session_id);

  if (!internalAccess) {
    sessionQuery = sessionQuery.eq("user_id", user!.id);
  }

  const { data: session, error } = await sessionQuery.single();

  if (error || !session) {
    return jsonResponse({ message: "Gift session not found" }, 404);
  }

  if (session.ai_response) {
    return jsonResponse({ session_id: body.session_id, status: "completed" });
  }

  const persistedRequest = readPersistedRecommendationRequestBody(session.graph_state);
  if (!persistedRequest) {
    return jsonResponse({ message: "Graph state is missing session input." }, 400);
  }

  const execution = readPersistedRecommendationExecution(session.graph_state);
  if (isExecutionLeaseActive(execution)) {
    return jsonResponse({ session_id: body.session_id, status: "already_running" }, 202);
  }

  const workerUrl = new URL("/api/recommend/worker", request.url);
  void fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(internalAccess
        ? { "x-recommendation-worker-secret": process.env.RECOMMENDATION_WORKER_SECRET ?? "" }
        : { Authorization: `Bearer ${accessToken!}` }),
    },
    body: JSON.stringify({
      session_id: body.session_id,
    }),
  }).catch((workerError) => {
    console.error("Failed to trigger recovery worker:", workerError);
  });

  return jsonResponse({
    session_id: body.session_id,
    status: "requeued",
  }, 202);
}
