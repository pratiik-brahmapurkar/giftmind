import {
  getBearerToken,
  getInternalRecommendationWorkerSecret,
  jsonResponse,
} from "../_lib/http.js";
import {
  isExecutionLeaseActive,
  isExecutionStale,
  readPersistedRecommendationExecution,
  readPersistedRecommendationRequestBody,
} from "../_lib/recommendationGraph.js";
import { createServiceRoleSupabaseClient } from "../_lib/supabase.js";

interface StaleSessionRow {
  id: string;
  graph_state: unknown;
  ai_response: unknown;
}

export default async function handler(request: Request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ message: "Method not allowed" }, 405);
  }

  const headerSecret = getInternalRecommendationWorkerSecret(request);
  const envSecret = process.env.RECOMMENDATION_WORKER_SECRET;
  const bearerToken = getBearerToken(request);
  const isVercelCron = bearerToken === process.env.CRON_SECRET;

  if (!isVercelCron && headerSecret !== envSecret) {
    return jsonResponse({ message: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("gift_sessions")
    .select("id, graph_state, ai_response")
    .not("graph_state", "is", null)
    .is("ai_response", null)
    .limit(50);

  if (error) {
    return jsonResponse({ message: error.message }, 500);
  }

  const sessions = (data ?? []) as StaleSessionRow[];
  let scanned = 0;
  let requeued = 0;
  let skipped = 0;

  for (const session of sessions) {
    scanned += 1;

    const execution = readPersistedRecommendationExecution(session.graph_state as never);
    const requestBody = readPersistedRecommendationRequestBody(session.graph_state as never);

    if (!requestBody) {
      skipped += 1;
      continue;
    }

    if (isExecutionLeaseActive(execution) || !isExecutionStale(execution)) {
      skipped += 1;
      continue;
    }

    const workerUrl = new URL("/api/recommend/worker", request.url);
    void fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-recommendation-worker-secret": process.env.RECOMMENDATION_WORKER_SECRET ?? "",
      },
      body: JSON.stringify({
        session_id: session.id,
      }),
    }).catch((workerError) => {
      console.error("Failed to trigger watchdog worker:", workerError);
    });

    requeued += 1;
  }

  return jsonResponse({
    scanned,
    requeued,
    skipped,
  });
}
