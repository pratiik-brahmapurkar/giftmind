import { buildGiftEmbeddingText } from "../../src/lib/recommendation-v2/embeddings.js";
import { jsonResponse, getBearerToken, readJson } from "../_lib/http.js";
import { generateEmbedding } from "../_lib/openai.js";
import { createUserSupabaseClient, getAuthenticatedUser, invokeSupabaseFunction } from "../_lib/supabase.js";

interface SelectRequestBody {
  session_id: string;
  gift_index: number;
  gift_name: string;
}

function getSelectedConfidence(aiResponse: unknown, giftIndex: number) {
  if (!aiResponse || typeof aiResponse !== "object") return null;
  const recommendations = (aiResponse as { recommendations?: Array<{ confidence_score?: number }> }).recommendations;
  if (!Array.isArray(recommendations)) return null;
  return recommendations[giftIndex]?.confidence_score ?? null;
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

  const body = await readJson<SelectRequestBody>(request);
  const supabase = createUserSupabaseClient(accessToken);

  const { data: session, error } = await supabase
    .from("gift_sessions")
    .select("id, recipient_id, ai_response, occasion")
    .eq("id", body.session_id)
    .eq("user_id", user.id)
    .single();

  if (error || !session) {
    return jsonResponse({ message: "Gift session not found" }, 404);
  }

  const confidenceScore = getSelectedConfidence(session.ai_response, body.gift_index);

  const { error: updateError } = await supabase
    .from("gift_sessions")
    .update({
      selected_gift_index: body.gift_index,
      selected_gift_name: body.gift_name,
      confidence_score: confidenceScore,
      status: "completed",
    })
    .eq("id", body.session_id)
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ message: updateError.message }, 500);
  }

  const aiResponse =
    session.ai_response && typeof session.ai_response === "object"
      ? (session.ai_response as { recommendations?: Array<Record<string, unknown>> })
      : null;
  const selectedRecommendation = aiResponse?.recommendations?.[body.gift_index];

  if (session.recipient_id && selectedRecommendation) {
    const { data: recipient } = await supabase
      .from("recipients")
      .select("relationship, cultural_context, country")
      .eq("id", session.recipient_id)
      .eq("user_id", user.id)
      .single();

    try {
      const sourceText = buildGiftEmbeddingText({
        recommendation: {
          name: String(selectedRecommendation.name ?? body.gift_name),
          description: String(selectedRecommendation.description ?? ""),
          why_it_works: String(selectedRecommendation.why_it_works ?? ""),
          confidence_score: Number(selectedRecommendation.confidence_score ?? 0),
          signal_interpretation: String(selectedRecommendation.signal_interpretation ?? ""),
          search_keywords: Array.isArray(selectedRecommendation.search_keywords)
            ? selectedRecommendation.search_keywords.map((value) => String(value))
            : [],
          product_category: String(selectedRecommendation.product_category ?? ""),
          price_anchor: Number(selectedRecommendation.price_anchor ?? 0),
          what_not_to_do: String(selectedRecommendation.what_not_to_do ?? ""),
        },
        occasion: session.occasion,
        recipient: recipient ?? null,
      });

      const embedding = await generateEmbedding(sourceText);

      await supabase
        .from("gift_embeddings")
        .upsert({
          session_id: session.id,
          recipient_id: session.recipient_id,
          user_id: user.id,
          gift_name: String(selectedRecommendation.name ?? body.gift_name),
          gift_description: String(selectedRecommendation.description ?? ""),
          product_category: String(selectedRecommendation.product_category ?? ""),
          price_anchor: Number(selectedRecommendation.price_anchor ?? 0),
          occasion: session.occasion,
          embedding: embedding.vectorLiteral,
          embedding_model: "text-embedding-3-small",
          source_text: sourceText,
        }, { onConflict: "session_id,gift_name" });
    } catch (embeddingError) {
      console.error("Failed to persist selected gift embedding:", embeddingError);
    }
  }

  if (session.recipient_id) {
    await supabase
      .from("recipients")
      .update({ last_gift_date: new Date().toISOString() })
      .eq("id", session.recipient_id)
      .eq("user_id", user.id);
  }

  await invokeSupabaseFunction("award-referral-credits", accessToken, {
    session_id: body.session_id,
  }).catch(() => null);

  return jsonResponse({
    success: true,
    session_updated: true,
  });
}
