import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AIFallbackError,
  AIProviderError,
  callAIWithFallback,
  getProviderChain,
  parseAIJson,
} from "../_shared/ai-providers.ts";
import {
  parseJsonBody,
  sanitizeArray,
  sanitizeString,
  validateBudget,
  validateCurrency,
  validateOccasion,
} from "../_shared/validate.ts";
import {
  DEFAULT_GIFT_GENERATION_UNITS,
  formatCreditUnits,
  getNextResetIso,
  parseNumberSetting,
} from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Recipient {
  name: string;
  relationship: string;
  relationship_depth?: string;
  age_range?: string;
  gender?: string;
  interests?: string[];
  cultural_context?: string;
  country?: string;
  notes?: string;
}

interface GiftRequest {
  recipient: Recipient;
  occasion: string;
  occasion_date?: string | null;
  budget_min: number;
  budget_max: number;
  currency: string;
  special_context?: string | null;
  context_tags?: string[];
  recipient_country?: string | null;
  user_plan?: string | null;
  session_id: string;
  is_regeneration?: boolean;
  action_id?: string | null;
}

interface GiftRecommendation {
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;
  signal_interpretation: string;
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
  what_not_to_do: string;
}

interface AIResponse {
  recommendations: GiftRecommendation[];
  occasion_insight: string;
  budget_assessment: string;
  cultural_note: string | null;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadGiftGenerationUnits(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["gift_generation_units"]);

  if (error) {
    console.error("Failed to load gift generation settings:", error.message);
    return { giftGenerationUnits: DEFAULT_GIFT_GENERATION_UNITS };
  }

  const settings = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    giftGenerationUnits: Math.max(
      0,
      Math.floor(parseNumberSetting(settings.get("gift_generation_units"), DEFAULT_GIFT_GENERATION_UNITS)),
    ),
  };
}

async function refundGiftGenerationCredits(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  sessionId: string;
  amount: number;
  actionId: string;
}) {
  const { data, error } = await params.supabaseAdmin.rpc("refund_user_credit", {
    p_user_id: params.userId,
    p_session_id: params.sessionId,
    p_amount: params.amount,
    p_reason: "gift_generation_ai_failure",
    p_action_id: params.actionId,
  });

  if (error) {
    console.error("Gift generation refund failed:", error.message);
    return { refunded: false, newBalance: null as number | null };
  }

  const payload = data && typeof data === "object" ? data as Record<string, unknown> : null;
  return {
    refunded: typeof payload?.refunded === "number" ? payload.refunded > 0 : Boolean(payload?.already_refunded),
    newBalance: typeof payload?.new_balance === "number" ? payload.new_balance : null,
  };
}

function regenerationLimit(plan: string): number {
  const limits: Record<string, number> = {
    spark: 2,
    pro: -1,
  };

  return limits[plan] ?? limits.spark;
}

function validateAIResponse(parsed: unknown): parsed is AIResponse {
  if (typeof parsed !== "object" || parsed === null) return false;

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.recommendations) || obj.recommendations.length !== 3) return false;
  if (typeof obj.occasion_insight !== "string") return false;
  if (typeof obj.budget_assessment !== "string") return false;
  if (obj.cultural_note !== null && typeof obj.cultural_note !== "string") return false;

  return obj.recommendations.every((recommendation) => {
    if (typeof recommendation !== "object" || recommendation === null) return false;
    const rec = recommendation as Record<string, unknown>;

    return (
      typeof rec.name === "string" &&
      typeof rec.description === "string" &&
      typeof rec.why_it_works === "string" &&
      typeof rec.confidence_score === "number" &&
      typeof rec.signal_interpretation === "string" &&
      Array.isArray(rec.search_keywords) &&
      typeof rec.product_category === "string" &&
      typeof rec.price_anchor === "number" &&
      typeof rec.what_not_to_do === "string"
    );
  });
}

function mapAIError(error: unknown) {
  if (error instanceof AIFallbackError) {
    if (error.finalType === "rate_limit") {
      return {
        status: 429,
        body: {
          error: "Too many AI requests right now. Please wait a minute and try again.",
          errorType: "RATE_LIMITED",
          retry_after: 60,
          technical: error.message.substring(0, 200),
        },
      };
    }

    if (error.finalType === "timeout") {
      return {
        status: 504,
        body: {
          error: "AI request timed out. Please try again.",
          errorType: "AI_ERROR",
          technical: error.message.substring(0, 200),
        },
      };
    }

    if (error.finalType === "invalid_response") {
      return {
        status: 502,
        body: {
          error: "AI returned an invalid response. Please try again.",
          errorType: "AI_PARSE_ERROR",
          technical: error.message.substring(0, 200),
        },
      };
    }

    return {
      status: 502,
      body: {
        error: "AI temporarily unavailable. Please try again.",
        errorType: "AI_ERROR",
        technical: error.message.substring(0, 200),
      },
    };
  }

  if (error instanceof AIProviderError) {
    if (error.type === "rate_limit") {
      return {
        status: 429,
        body: {
          error: "Too many AI requests right now. Please wait a minute and try again.",
          errorType: "RATE_LIMITED",
          retry_after: 60,
          technical: error.message.substring(0, 200),
        },
      };
    }

    if (error.type === "invalid_response") {
      return {
        status: 502,
        body: {
          error: "AI returned an invalid response. Please try again.",
          errorType: "AI_PARSE_ERROR",
          technical: error.message.substring(0, 200),
        },
      };
    }

    return {
      status: error.type === "timeout" ? 504 : 502,
      body: {
        error: "AI temporarily unavailable. Please try again.",
        errorType: "AI_ERROR",
        technical: error.message.substring(0, 200),
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    body: {
      error: "AI temporarily unavailable. Please try again.",
      errorType: "AI_ERROR",
      technical: message.substring(0, 200),
    },
  };
}

function buildSystemPrompt(): string {
  return `You are GiftMind's AI gift recommender. Your job is to suggest 3 thoughtful, personalized gifts that demonstrate emotional intelligence about the recipient.

For each gift, provide:
- name: the gift (specific, not generic)
- description: 1-2 sentences describing the gift
- why_it_works: personalized reasoning that references the recipient's specific details
- confidence_score: 0-100 (how confident you are it's a good match)
- signal_interpretation: what this gift communicates about the relationship
- search_keywords: 3-5 keywords for product search
- product_category: one of [electronics, fashion, accessories, beauty, home_decor, kitchen, books, personalized, flowers_cakes, jewelry, wellness, toys_kids, sports, luxury, handmade, food, experience, general]
- price_anchor: estimated price in USD (number)
- what_not_to_do: one specific thing to avoid

Also provide:
- occasion_insight: 1 sentence about the occasion itself
- budget_assessment: 1 sentence about whether the budget is appropriate
- cultural_note: optional note about cultural context (null if not relevant)

RULES:
- Avoid generic suggestions (no "gift card", "flowers", "chocolates" unless uniquely justified)
- Reference specific recipient details in every why_it_works
- Price anchors must fit within the user's budget range
- Consider cultural context (Diwali, Eid, etc.) if recipient's country implies it
- Return STRICTLY JSON. No markdown. No explanation. Just JSON.

RESPONSE FORMAT (strict JSON only):
{
  "recommendations": [
    {
      "name": "...",
      "description": "...",
      "why_it_works": "...",
      "confidence_score": 87,
      "signal_interpretation": "...",
      "search_keywords": ["...", "...", "..."],
      "product_category": "...",
      "price_anchor": 45,
      "what_not_to_do": "..."
    },
    { ... },
    { ... }
  ],
  "occasion_insight": "...",
  "budget_assessment": "...",
  "cultural_note": "..."
}`;
}

function buildUserMessage(body: GiftRequest): string {
  const recipientName = sanitizeString(body.recipient?.name ?? "", 100);
  const relationship = sanitizeString(body.recipient?.relationship ?? "not specified", 50);
  const relationshipDepth = sanitizeString(body.recipient?.relationship_depth ?? "not specified", 50);
  const ageRange = sanitizeString(body.recipient?.age_range ?? "not specified", 50);
  const gender = sanitizeString(body.recipient?.gender ?? "not specified", 30);
  const interests = sanitizeArray(body.recipient?.interests ?? [], 15).join(", ") || "not specified";
  const culturalContext = sanitizeString(body.recipient?.cultural_context ?? "not specified", 100);
  const recipientCountry = sanitizeString(body.recipient_country ?? body.recipient?.country ?? "not specified", 30);
  const notes = sanitizeString(body.recipient?.notes ?? "none", 500);
  const specialContext = sanitizeString(body.special_context ?? "", 500);
  const contextTags = sanitizeArray(body.context_tags ?? [], 10);

  return `Find 3 perfect gifts for this person:

RECIPIENT:
- Name: ${recipientName}
- Relationship: ${relationship}
- Relationship depth: ${relationshipDepth}
- Age range: ${ageRange}
- Gender: ${gender}
- Interests: ${interests}
- Cultural context: ${culturalContext}
- Country: ${recipientCountry}
- Notes: ${notes || "none"}

OCCASION: ${sanitizeString(body.occasion, 60)}${body.occasion_date ? ` (${sanitizeString(body.occasion_date, 40)})` : ""}

BUDGET: ${sanitizeString(body.currency, 10)} ${body.budget_min} - ${body.budget_max}

${specialContext ? `SPECIAL CONTEXT: ${specialContext}` : ""}
${contextTags.length ? `TAGS: ${contextTags.join(", ")}` : ""}

Return JSON only.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let refundContext: {
    supabaseAdmin: ReturnType<typeof createClient>;
    userId: string;
    sessionId: string;
    amount: number;
    actionId: string;
  } | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase environment is not configured" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const parsedBody = await parseJsonBody<GiftRequest>(req, jsonResponse);
    if (parsedBody.response) return parsedBody.response;

    const body = parsedBody.data!;
    if (!body.recipient?.name) {
      return jsonResponse({ error: "Recipient name is required" }, 400);
    }
    if (!body.occasion || !validateOccasion(body.occasion)) {
      return jsonResponse({ error: "Occasion is required" }, 400);
    }
    if (body.budget_min === undefined || body.budget_min === null) {
      return jsonResponse({ error: "Budget is required" }, 400);
    }
    if (body.budget_max === undefined || body.budget_max === null) {
      return jsonResponse({ error: "Budget max is required" }, 400);
    }
    if (!validateBudget(body.budget_min, body.budget_max)) {
      return jsonResponse({ error: "Invalid budget range" }, 400);
    }
    if (!validateCurrency(body.currency)) {
      return jsonResponse({ error: "Invalid currency" }, 400);
    }
    if (!body.session_id) {
      return jsonResponse({ error: "Session id is required" }, 400);
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gift_sessions")
      .select("id, user_id, regeneration_count")
      .eq("id", body.session_id)
      .single();

    if (sessionError || !session) {
      return jsonResponse({ error: "Gift session not found" }, 404);
    }

    if (session.user_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recentCount, error: rateLimitError } = await supabaseAdmin
      .from("gift_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);

    if (rateLimitError) {
      console.error("Failed to enforce generate-gifts rate limit:", rateLimitError.message);
      return jsonResponse({ error: "Failed to validate request rate" }, 500);
    }

    if ((recentCount || 0) >= 10) {
      return jsonResponse(
        {
          error: "Too many gift sessions in the last hour. Please wait.",
          errorType: "RATE_LIMITED",
          retry_after: 3600,
        },
        429,
      );
    }

    const { data: initialUserData, error: userError } = await supabaseAdmin
      .from("users")
      .select("active_plan, credits_balance")
      .eq("id", user.id)
      .single();

    let userData = initialUserData;

    if (userError) {
      console.error("Failed to load user plan:", userError.message);
      return jsonResponse({ error: "Failed to load user plan" }, 500);
    }

    const plan = userData?.active_plan || body.user_plan || "spark";
    const creditSettings = await loadGiftGenerationUnits(supabaseAdmin);

    if (plan === "spark") {
      const { data: monthlyData, error: monthlyError } = await supabaseAdmin.rpc("issue_free_monthly_credits", {
        p_user_id: user.id,
      });

      if (monthlyError) {
        console.error("Failed to ensure monthly credits for generate-gifts:", monthlyError.message);
      } else {
        console.log(JSON.stringify({
          event: monthlyData?.issued ? "monthly_credits_issued" : "monthly_credits_already_exist",
          user_id: user.id,
          credit_month: monthlyData?.credit_month ?? null,
          units: monthlyData?.units ?? 0,
          operation: "gift_generation",
        }));
      }

      const refreshed = await supabaseAdmin
        .from("users")
        .select("active_plan, credits_balance")
        .eq("id", user.id)
        .single();

      if (!refreshed.error && refreshed.data) {
        userData = refreshed.data;
      }
    }
    if (body.is_regeneration) {
      const maxRegenerations = regenerationLimit(plan);
      const currentRegenerations = session.regeneration_count ?? 0;

      if (maxRegenerations !== -1 && currentRegenerations >= maxRegenerations) {
        return jsonResponse(
          {
            error: "REGENERATION_LIMIT_REACHED",
            message: `Your plan allows ${maxRegenerations} regeneration${maxRegenerations === 1 ? "" : "s"} per session.`,
            upgrade_to: "pro",
            upgrade_status: "coming_soon",
          },
          403,
        );
      }
    }

    const actionId = sanitizeString(body.action_id || "", 160);
    if (!actionId) {
      return jsonResponse({ error: "action_id is required" }, 400);
    }

    refundContext = {
      supabaseAdmin,
      userId: user.id,
      sessionId: body.session_id,
      amount: creditSettings.giftGenerationUnits,
      actionId,
    };

    if ((userData?.credits_balance || 0) < creditSettings.giftGenerationUnits) {
      console.log(JSON.stringify({
        event: "no_credits_gate_hit",
        user_id: user.id,
        action_type: "gift_generation",
        balance: userData?.credits_balance ?? 0,
        required_units: creditSettings.giftGenerationUnits,
      }));

      return jsonResponse(
        {
          error: "NO_CREDITS",
          message: "You're out of credits for this month.",
          errorType: "NO_CREDITS",
          next_reset: getNextResetIso(),
          show_upgrade: true,
          upgrade_to: "pro",
          upgrade_status: "coming_soon",
        },
        402,
      );
    }

    const { data: deductResult, error: deductError } = await supabaseAdmin.rpc("deduct_user_credit", {
      p_user_id: user.id,
      p_session_id: body.session_id,
      p_amount: creditSettings.giftGenerationUnits,
      p_action_id: actionId,
      p_action_type: "gift_generation",
    });

    if (deductError) {
      console.error("Gift generation credit deduction failed:", deductError.message);
      return jsonResponse({ error: "Failed to process credit deduction", errorType: "CREDIT_ERROR" }, 500);
    }

    if (!deductResult?.success) {
      return jsonResponse(
        {
          error: "NO_CREDITS",
          message: "You're out of credits for this month.",
          errorType: "NO_CREDITS",
          remaining: deductResult?.remaining_balance ?? 0,
          next_reset: getNextResetIso(),
          show_upgrade: true,
          upgrade_to: "pro",
          upgrade_status: "coming_soon",
        },
        402,
      );
    }

    console.log(JSON.stringify({
      event: "credit_deducted",
      user_id: user.id,
      units: creditSettings.giftGenerationUnits,
      action_type: "gift_generation",
      action_id: actionId,
      remaining_balance: deductResult?.remaining_balance ?? null,
    }));

    const providerChain = getProviderChain(plan, "gift-generation");
    console.log(JSON.stringify({
      event: "ai_provider_selected",
      provider: providerChain[0],
      plan,
      operation: "gift_generation",
      session_id: body.session_id,
    }));
    const aiResult = await callAIWithFallback(providerChain, {
      systemPrompt: buildSystemPrompt(),
      userMessage: buildUserMessage(body),
      maxTokens: 2500,
      temperature: 0.8,
      responseFormat: "json",
    });

    let parsed: unknown;
    try {
      parsed = parseAIJson(aiResult.text);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      console.error("AI response parse failed:", message);
      console.error("Raw text:", aiResult.text.substring(0, 500));

      return jsonResponse(
        {
          error: "AI response was invalid. Please try again.",
          errorType: "AI_PARSE_ERROR",
          technical: message.substring(0, 200),
          credits_refunded: (await refundGiftGenerationCredits({
            supabaseAdmin,
            userId: user.id,
            sessionId: body.session_id,
            amount: creditSettings.giftGenerationUnits,
            actionId,
          })).refunded,
        },
        502,
      );
    }

    if (!validateAIResponse(parsed)) {
      return jsonResponse(
        {
          error: "AI response missing valid recommendations.",
          errorType: "AI_PARSE_ERROR",
          credits_refunded: (await refundGiftGenerationCredits({
            supabaseAdmin,
            userId: user.id,
            sessionId: body.session_id,
            amount: creditSettings.giftGenerationUnits,
            actionId,
          })).refunded,
        },
        502,
      );
    }

    if (parsed.recommendations.length !== 3) {
      return jsonResponse(
        {
          error: "AI returned an unexpected number of recommendations.",
          errorType: "AI_PARSE_ERROR",
          count: parsed.recommendations.length,
          credits_refunded: (await refundGiftGenerationCredits({
            supabaseAdmin,
            userId: user.id,
            sessionId: body.session_id,
            amount: creditSettings.giftGenerationUnits,
            actionId,
          })).refunded,
        },
        502,
      );
    }

    const topConfidence = parsed.recommendations.reduce(
      (max, recommendation) => Math.max(max, recommendation.confidence_score ?? 0),
      0,
    );

    const { error: updateError } = await supabaseAdmin
      .from("gift_sessions")
      .update({
        ai_response: parsed,
        ai_model_used: aiResult.provider,
        confidence_score: topConfidence,
        ai_provider_used: aiResult.provider,
        ai_latency_ms: aiResult.latencyMs,
        ai_attempt_number: aiResult.attemptNumber,
        ai_tokens_input: aiResult.tokensInput,
        ai_tokens_output: aiResult.tokensOutput,
        ...(body.is_regeneration ? { regeneration_count: (session.regeneration_count ?? 0) + 1 } : {}),
        status: "active",
      })
      .eq("id", body.session_id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to update gift session:", updateError.message);
    }

    return jsonResponse({
      ...parsed,
      credits_remaining: deductResult?.remaining_balance ?? null,
      _meta: {
        provider: aiResult.provider,
        latency_ms: aiResult.latencyMs,
        attempt: aiResult.attemptNumber,
        credits_used: creditSettings.giftGenerationUnits,
      },
    });
  } catch (error) {
    console.error("Generate gifts error:", error);
    let refund = { refunded: false, newBalance: null as number | null };
    if (refundContext) {
      refund = await refundGiftGenerationCredits(refundContext);
      if (refund.refunded) {
        console.log(JSON.stringify({
          event: "credit_refunded",
          user_id: refundContext.userId,
          units: refundContext.amount,
          reason: "gift_generation_failure",
          action_id: refundContext.actionId,
          new_balance: refund.newBalance,
        }));
      }
    }

    const mapped = mapAIError(error);
    return jsonResponse(
      {
        ...mapped.body,
        message: refund.refunded
          ? `Gift generation failed. Your ${formatCreditUnits(refundContext?.amount ?? DEFAULT_GIFT_GENERATION_UNITS)} credits were refunded.`
          : mapped.body.message,
        credits_refunded: refund.refunded,
        credits_remaining: refund.newBalance,
      },
      mapped.status,
    );
  }
});
