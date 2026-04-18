import { getBearerToken } from "../_lib/http.js";
import { inferProgressSnapshot } from "../_lib/recommendationProgress.js";
import { createUserSupabaseClient, getAuthenticatedUser } from "../_lib/supabase.js";

function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return new Response("Missing bearer token", { status: 401 });
  }

  const user = await getAuthenticatedUser(accessToken);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return new Response("session_id is required", { status: 400 });
  }

  const supabase = createUserSupabaseClient(accessToken);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emittedNodes = new Set<string>();

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { data: session } = await supabase
          .from("gift_sessions")
          .select("id, status, ai_response, product_results, ai_latency_ms, ai_provider_used, ai_attempt_number, engine_version, node_timings, cultural_rules_applied, past_gifts_checked, personalization_scores")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .single();

        if (!session) {
          controller.enqueue(encoder.encode(formatSseEvent("error", { code: "NOT_FOUND", message: "Gift session not found." })));
          controller.close();
          return;
        }

        const { aiResponse, completed, failed, currentNode, nodesCompleted, nodeTimings } = inferProgressSnapshot(session);
        const avgPersonalizationScore =
          typeof aiResponse?._meta === "object" && aiResponse?._meta && "avg_personalization_score" in aiResponse._meta
            ? aiResponse._meta.avg_personalization_score
            : null;

        controller.enqueue(
          encoder.encode(
            formatSseEvent("status", {
              session_id: session.id,
              status: failed ? "failed" : completed ? "completed" : session.status === "in_progress" ? "in_progress" : "pending",
              current_node: currentNode,
              nodes_completed: nodesCompleted,
              recommendations: completed ? aiResponse?.recommendations ?? null : null,
              product_results: completed ? session.product_results ?? null : null,
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
              },
              error: failed
                ? {
                    code: "GENERATION_FAILED",
                    message: "Recommendation generation failed.",
                  }
                : null,
            }),
          ),
        );

        for (const node of nodesCompleted) {
          if (emittedNodes.has(node) || !(node in nodeTimings)) continue;
          emittedNodes.add(node);
          controller.enqueue(
            encoder.encode(
              formatSseEvent("node_complete", {
                node,
                duration_ms: nodeTimings[node],
              }),
            ),
          );
        }

        if (completed) {
          controller.enqueue(
            encoder.encode(
              formatSseEvent("recommendations", {
                recommendations: aiResponse?.recommendations ?? [],
                product_results: session.product_results ?? null,
                occasion_insight: aiResponse?.occasion_insight ?? null,
                budget_assessment: aiResponse?.budget_assessment ?? null,
                cultural_note: aiResponse?.cultural_note ?? null,
                warning:
                  typeof aiResponse?._warning_message === "string"
                    ? {
                        code: typeof aiResponse?._warning === "string" ? aiResponse._warning : "LIMITED_RESULTS",
                        message: aiResponse._warning_message,
                      }
                    : null,
                meta: {
                  provider: session.ai_provider_used ?? null,
                  attempt: session.ai_attempt_number ?? null,
                  total_duration_ms: session.ai_latency_ms ?? null,
                  engine_version: session.engine_version ?? null,
                  node_timings: session.node_timings ?? null,
                  cultural_rules_applied: session.cultural_rules_applied ?? 0,
                  past_gifts_checked: session.past_gifts_checked ?? 0,
                  personalization_scores: session.personalization_scores ?? null,
                  avg_personalization_score: avgPersonalizationScore,
                },
              }),
            ),
          );
          controller.enqueue(encoder.encode(formatSseEvent("done", { session_id: session.id })));
          controller.close();
          return;
        }

        if (failed) {
          controller.enqueue(encoder.encode(formatSseEvent("error", { code: "GENERATION_FAILED", message: "Recommendation generation failed." })));
          controller.close();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      controller.enqueue(encoder.encode(formatSseEvent("error", { code: "TIMEOUT", message: "Recommendation stream timed out." })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
