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
  buildSignalCheckActionId,
  DEFAULT_SIGNAL_CHECK_UNITS,
  formatCreditUnits,
  getNextResetIso,
  parseNumberSetting,
} from "../_shared/credits.ts";
import { parseJsonBody, sanitizeString, validateRelationship } from "../_shared/validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SignalCheckRequest {
  gift_name: string;
  gift_description?: string;
  recipient_name: string;
  recipient_relationship: string;
  recipient_relationship_depth?: string;
  occasion: string;
  relationship_stage?: string | null;
  budget_spent?: number | null;
  currency: string;
  session_id: string;
  follow_up_prompt?: string | null;
  parent_signal_check_id?: string | null;
}

interface SignalCheckResult {
  positive_signals: string[];
  potential_risks: string[];
  overall_message: string;
  confidence_note: string;
  adjustment_suggestions: string[];
}

interface StoredSignalCheck {
  id: string;
  gift_name: string;
  revision_number: number;
  follow_up_prompt: string | null;
  result_payload: unknown;
}

const DEFAULT_SIGNAL_CHECKS_PER_DAY = 30;

const SIGNAL_CHECK_SYSTEM_PROMPT = `You are a relationship psychologist analyzing what a gift communicates.

For the given gift and recipient, analyze:
- overall_message: what the gift says about the relationship (1-2 sentences)
- positive_signals: 2-3 things the gift communicates positively
- potential_risks: 0-2 things to be careful about (can be empty array)
- confidence_note: how confident you are in this analysis
- adjustment_suggestions: 0-3 ways to steer the same gift more clearly if needed

RULES:
- Be honest, not just positive
- Consider relationship depth (new vs close)
- Consider cultural norms
- Return strict JSON only

FORMAT:
{
  "overall_message": "...",
  "positive_signals": ["...", "...", "..."],
  "potential_risks": ["..."],
  "confidence_note": "...",
  "adjustment_suggestions": ["..."]
}`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBooleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

async function loadSignalCheckSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["feature_signal_check", "signal_check_units", "signal_checks_per_day"]);

  if (error) {
    console.error("Failed to load Signal Check platform settings:", error.message);
    return {
      featureSignalCheck: true,
      signalCheckUnits: DEFAULT_SIGNAL_CHECK_UNITS,
      signalChecksPerDay: DEFAULT_SIGNAL_CHECKS_PER_DAY,
    };
  }

  const settings = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    featureSignalCheck: parseBooleanSetting(settings.get("feature_signal_check"), true),
    signalCheckUnits: Math.max(
      0,
      Math.floor(parseNumberSetting(settings.get("signal_check_units"), DEFAULT_SIGNAL_CHECK_UNITS)),
    ),
    signalChecksPerDay: Math.max(
      1,
      Math.floor(parseNumberSetting(settings.get("signal_checks_per_day"), DEFAULT_SIGNAL_CHECKS_PER_DAY)),
    ),
  };
}

function validateSignalCheckResult(parsed: unknown): parsed is SignalCheckResult {
  if (typeof parsed !== "object" || parsed === null) return false;

  const obj = parsed as Record<string, unknown>;
  return (
    Array.isArray(obj.positive_signals) &&
    Array.isArray(obj.potential_risks) &&
    Array.isArray(obj.adjustment_suggestions) &&
    typeof obj.overall_message === "string" &&
    typeof obj.confidence_note === "string" &&
    obj.positive_signals.every((value) => typeof value === "string") &&
    obj.potential_risks.every((value) => typeof value === "string") &&
    obj.adjustment_suggestions.every((value) => typeof value === "string")
  );
}

function buildSignalCheckMessage(body: SignalCheckRequest, parentContext: string): string {
  return `Analyze this gift:

GIFT: ${sanitizeString(body.gift_name, 200)}
${body.gift_description ? `Description: ${sanitizeString(body.gift_description, 500)}` : ""}
${body.budget_spent != null ? `Approximate value: ${sanitizeString(body.currency, 10)} ${body.budget_spent}` : ""}

RECIPIENT:
- Name: ${sanitizeString(body.recipient_name, 100)}
- Relationship: ${sanitizeString(body.recipient_relationship, 50)}
- Depth: ${sanitizeString(body.recipient_relationship_depth || "not specified", 50)}
- Occasion: ${sanitizeString(body.occasion, 60)}
${body.relationship_stage ? `- Relationship stage: ${sanitizeString(body.relationship_stage, 50)}` : ""}

${parentContext}

What does this gift say about the relationship? Return JSON only.`;
}

function mapAIError(error: unknown) {
  if (error instanceof AIFallbackError || error instanceof AIProviderError) {
    const type = error instanceof AIFallbackError ? error.finalType : error.type;

    if (type === "rate_limit") {
      return {
        status: 429,
        body: {
          error: "AI_BUSY",
          message: "Signal Check is busy right now. Please wait a minute and try again.",
        },
      };
    }

    if (type === "invalid_response") {
      return {
        status: 502,
        body: {
          error: "AI_INVALID_RESPONSE",
          message: "Signal Check returned an invalid analysis. Please try again.",
        },
      };
    }

    return {
      status: type === "timeout" ? 504 : 502,
      body: {
        error: type === "timeout" ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
        message: "Signal Check temporarily unavailable. Please try again.",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "AI_UNAVAILABLE",
      message: "Signal Check temporarily unavailable. Please try again.",
    },
  };
}

async function refundSignalCheckCredits(params: {
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
    p_reason: "signal_check_ai_failure",
    p_action_id: params.actionId,
  });

  if (error) {
    console.error("Signal Check refund failed:", error.message);
    return { refunded: false, newBalance: null as number | null };
  }

  const payload = data && typeof data === "object" ? data as Record<string, unknown> : null;

  return {
    refunded: typeof payload?.refunded === "number" ? payload.refunded > 0 : Boolean(payload?.already_refunded),
    newBalance: typeof payload?.new_balance === "number" ? payload.new_balance : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase environment is not configured" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: initialUserData, error: userError } = await supabaseAdmin
      .from("users")
      .select("active_plan, credits_balance")
      .eq("id", user.id)
      .single();

    let userData = initialUserData;

    if (userError || !userData) {
      console.error("Failed to fetch user data:", userError?.message);
      return json({ error: "Failed to retrieve user profile" }, 500);
    }

    const plan = userData.active_plan || "spark";

    const signalSettings = await loadSignalCheckSettings(supabaseAdmin);
    if (!signalSettings.featureSignalCheck) {
      return json(
        {
          error: "FEATURE_DISABLED",
          message: "Signal Check is temporarily unavailable.",
        },
        503,
      );
    }

    if (plan === "spark") {
      const { data: monthlyData, error: monthlyError } = await supabaseAdmin.rpc("issue_free_monthly_credits", {
        p_user_id: user.id,
      });

      if (monthlyError) {
        console.error("Failed to ensure monthly credits for signal-check:", monthlyError.message);
      } else {
        console.log(JSON.stringify({
          event: monthlyData?.issued ? "monthly_credits_issued" : "monthly_credits_already_exist",
          user_id: user.id,
          credit_month: monthlyData?.credit_month ?? null,
          units: monthlyData?.units ?? 0,
          operation: "signal_check",
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

    const parsedBody = await parseJsonBody<SignalCheckRequest>(req, json);
    if (parsedBody.response) return parsedBody.response;
    const body = parsedBody.data!;

    if (!body.gift_name) {
      return json({ error: "gift_name is required" }, 400);
    }
    if (!body.recipient_relationship || !validateRelationship(body.recipient_relationship)) {
      return json({ error: "recipient_relationship is required" }, 400);
    }
    if (!body.session_id) {
      return json({ error: "session_id is required" }, 400);
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gift_sessions")
      .select("id, user_id, ai_response")
      .eq("id", body.session_id)
      .single();

    if (sessionError || !session) {
      return json({ error: "Gift session not found" }, 404);
    }

    if (session.user_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const giftName = sanitizeString(body.gift_name, 200);
    const { data: existingChecks, error: signalChecksError } = await supabaseAdmin
      .from("signal_checks")
      .select("id, gift_name, revision_number, follow_up_prompt, result_payload")
      .eq("user_id", user.id)
      .eq("session_id", body.session_id)
      .eq("gift_name", giftName)
      .order("revision_number", { ascending: false });

    if (signalChecksError) {
      console.error("Failed to fetch existing signal checks:", signalChecksError.message);
      return json({ error: "Failed to load saved signal checks" }, 500);
    }

    const savedChecks = (existingChecks ?? []) as StoredSignalCheck[];
    const latestSavedCheck = savedChecks[0] ?? null;

    if (!sanitizeString(body.follow_up_prompt || "", 240) && latestSavedCheck) {
      const storedResult = latestSavedCheck.result_payload;
      if (validateSignalCheckResult(storedResult)) {
        return json({
          success: true,
          signal: storedResult,
          signal_check_id: latestSavedCheck.id,
          revision_number: latestSavedCheck.revision_number,
          credits_remaining: userData.credits_balance ?? 0,
          reused_saved_result: true,
        });
      }
    }

    let parentSignalCheck = latestSavedCheck;
    if (body.parent_signal_check_id) {
      const explicitParent = savedChecks.find((check) => check.id === body.parent_signal_check_id);
      if (!explicitParent) {
        return json({ error: "Signal Check revision not found" }, 404);
      }
      parentSignalCheck = explicitParent;
    }

    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count: rateLimitCount, error: rateLimitError } = await supabaseAdmin
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("action", "signal-check")
      .eq("identifier", user.id)
      .gte("created_at", oneDayAgo);

    if (rateLimitError) {
      console.error("Failed to enforce signal-check rate limit:", rateLimitError.message);
      return json({ error: "Failed to validate request rate" }, 500);
    }

    if ((rateLimitCount ?? 0) >= signalSettings.signalChecksPerDay) {
      return json(
        {
          error: "RATE_LIMITED",
          message: `You've run ${signalSettings.signalChecksPerDay} analyses today. Check back tomorrow.`,
        },
        429,
      );
    }

    const cleanFollowUpPrompt = sanitizeString(body.follow_up_prompt || "", 240);
    const actionId = buildSignalCheckActionId({
      sessionId: body.session_id,
      giftName,
      parentSignalCheckId: body.parent_signal_check_id ?? latestSavedCheck?.id ?? null,
      followUpPrompt: cleanFollowUpPrompt,
    });

    if ((userData.credits_balance || 0) < signalSettings.signalCheckUnits) {
      console.log(JSON.stringify({
        event: "no_credits_gate_hit",
        user_id: user.id,
        action_type: "signal_check",
        balance: userData.credits_balance ?? 0,
        required_units: signalSettings.signalCheckUnits,
      }));

      return json(
        {
          error: "NO_CREDITS",
          message: "You're out of credits for this month.",
          next_reset: getNextResetIso(),
          show_upgrade: true,
          upgrade_to: "pro",
          upgrade_status: "coming_soon",
          required_units: signalSettings.signalCheckUnits,
        },
        402,
      );
    }

    const { data: deductResult, error: rpcError } = await supabaseAdmin.rpc("deduct_user_credit", {
      p_user_id: user.id,
      p_session_id: body.session_id,
      p_amount: signalSettings.signalCheckUnits,
      p_action_id: actionId,
      p_action_type: "signal_check",
    });

    if (rpcError) {
      console.error("Signal Check credit deduction failed:", rpcError.message);
      return json({ error: "Failed to process credit deduction" }, 500);
    }

    if (!deductResult?.success) {
      return json(
        {
          error: "NO_CREDITS",
          message: "You're out of credits for this month.",
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
      units: signalSettings.signalCheckUnits,
      action_type: "signal_check",
      action_id: actionId,
      remaining_balance: deductResult?.remaining_balance ?? null,
    }));

    const { error: rateLimitInsertError } = await supabaseAdmin
      .from("rate_limit_events")
      .insert({
        action: "signal-check",
        identifier: user.id,
        metadata: {
          session_id: body.session_id,
          gift_name: giftName,
          cost_units: signalSettings.signalCheckUnits,
          action_id: actionId,
        },
      });

    if (rateLimitInsertError) {
      console.error("Failed to record signal-check rate limit event:", rateLimitInsertError.message);
      const refund = await refundSignalCheckCredits({
        supabaseAdmin,
        userId: user.id,
        sessionId: body.session_id,
        amount: signalSettings.signalCheckUnits,
        actionId,
      });

      return json(
        {
          error: "SIGNAL_CHECK_UNAVAILABLE",
          message: refund.refunded
            ? `Signal Check couldn't start. Your ${formatCreditUnits(signalSettings.signalCheckUnits)} credits were refunded.`
            : "Signal Check couldn't start. Please try again.",
          credits_refunded: refund.refunded,
          credits_remaining: refund.newBalance,
        },
        500,
      );
    }

    const parentContext =
      cleanFollowUpPrompt && parentSignalCheck && validateSignalCheckResult(parentSignalCheck.result_payload)
        ? `PREVIOUS SIGNAL CHECK:\n${JSON.stringify(parentSignalCheck.result_payload, null, 2)}\nFOLLOW-UP DIRECTION: ${cleanFollowUpPrompt}\nRevise the analysis in that direction if it fits. If it does not fit, explain why and use adjustment_suggestions.`
        : "";

    const chain = getProviderChain(plan, "signal-check");
    let parsed: unknown;
    let result;
    try {
      result = await callAIWithFallback(chain, {
        systemPrompt: SIGNAL_CHECK_SYSTEM_PROMPT,
        userMessage: buildSignalCheckMessage(body, parentContext),
        maxTokens: 1000,
        temperature: 0.6,
        responseFormat: "json",
      });

      try {
        parsed = parseAIJson(result.text);
      } catch (parseError) {
        throw new AIProviderError(
          result.provider,
          "invalid_response",
          parseError instanceof Error ? parseError.message : String(parseError),
        );
      }

      if (!validateSignalCheckResult(parsed)) {
        throw new AIProviderError(
          result.provider,
          "invalid_response",
          "Signal Check returned an invalid analysis.",
        );
      }
    } catch (error) {
      console.error("Signal Check AI failure:", error);
      const refund = await refundSignalCheckCredits({
        supabaseAdmin,
        userId: user.id,
        sessionId: body.session_id,
        amount: signalSettings.signalCheckUnits,
        actionId,
      });
      const mapped = mapAIError(error);

      return json(
        {
          ...mapped.body,
          message: refund.refunded
            ? `Signal analysis failed. Your ${formatCreditUnits(signalSettings.signalCheckUnits)} credits were refunded.`
            : mapped.body.message,
          credits_refunded: refund.refunded,
          credits_remaining: refund.newBalance,
        },
        mapped.status,
      );
    }

    let storedSignalCheckId: string | null = null;
    const nextRevisionNumber = (latestSavedCheck?.revision_number ?? 0) + 1;

    try {
      const { data: insertedSignalCheck, error: insertSignalCheckError } = await supabaseAdmin
        .from("signal_checks")
        .insert({
          user_id: user.id,
          session_id: body.session_id,
          gift_name: giftName,
          parent_signal_check_id: cleanFollowUpPrompt ? (parentSignalCheck?.id ?? null) : null,
          revision_number: nextRevisionNumber,
          follow_up_prompt: cleanFollowUpPrompt || null,
          result_payload: parsed,
          credits_used: signalSettings.signalCheckUnits,
        })
        .select("id")
        .single();

      if (insertSignalCheckError) {
        throw insertSignalCheckError;
      }

      storedSignalCheckId = insertedSignalCheck.id;

      const currentAiResponse =
        session.ai_response && typeof session.ai_response === "object" && !Array.isArray(session.ai_response)
          ? session.ai_response as Record<string, unknown>
          : {};
      const existingSignalChecks =
        currentAiResponse.signal_checks &&
        typeof currentAiResponse.signal_checks === "object" &&
        !Array.isArray(currentAiResponse.signal_checks)
          ? currentAiResponse.signal_checks as Record<string, unknown>
          : {};

      const updatedResponse = {
        ...currentAiResponse,
        signal_checks: {
          ...existingSignalChecks,
          // Deprecated compatibility mirror. `signal_checks` table is the source of truth.
          [giftName]: {
            latest_signal_check_id: storedSignalCheckId,
            revision_number: nextRevisionNumber,
            follow_up_prompt: cleanFollowUpPrompt || null,
            result: parsed,
            meta: {
              provider: result.provider,
              latency_ms: result.latencyMs,
              attempt: result.attemptNumber,
            },
          },
        },
      };

      const { error: updateError } = await supabaseAdmin
        .from("gift_sessions")
        .update({ ai_response: updatedResponse })
        .eq("id", body.session_id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Failed to update gift_session with signal check:", updateError.message);
      }
    } catch (storeError) {
      console.error("Error storing signal check:", storeError);
      const refund = await refundSignalCheckCredits({
        supabaseAdmin,
        userId: user.id,
        sessionId: body.session_id,
        amount: signalSettings.signalCheckUnits,
        actionId,
      });

      return json(
        {
          error: "SIGNAL_CHECK_SAVE_FAILED",
          message: refund.refunded
            ? `Signal Check couldn't be saved. Your ${formatCreditUnits(signalSettings.signalCheckUnits)} credits were refunded.`
            : "Signal Check couldn't be saved. Please try again.",
          credits_refunded: refund.refunded,
          credits_remaining: refund.newBalance,
        },
        500,
      );
    }

    return json({
      success: true,
      signal: parsed,
      signal_check_id: storedSignalCheckId,
      revision_number: nextRevisionNumber,
      credits_remaining: deductResult.remaining_balance,
      _meta: {
        provider: result.provider,
        credits_used: signalSettings.signalCheckUnits,
        latency_ms: result.latencyMs,
        attempt: result.attemptNumber,
      },
    });
  } catch (error) {
    console.error("Signal check error:", error);
    const mapped = mapAIError(error);
    return json(mapped.body, mapped.status);
  }
});
