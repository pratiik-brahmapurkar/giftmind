import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString, validateRelationship } from "../_shared/validate.ts";

// ── Environment ────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Supabase admin client (service role — bypasses RLS) ────────────────────────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// TODO: Before production, change Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
// ── CORS headers ───────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helper: JSON response ──────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Plans that have Signal Check access ────────────────────────────────────────
const ALLOWED_PLANS = ["confident", "gifting-pro"];

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a relationship and gifting psychologist. Your job is to analyze what a specific gift communicates about the giver-recipient relationship.

Be specific, insightful, and honest. Don't just say "it shows you care" — explain the SPECIFIC signals this gift sends based on the relationship type, occasion, and gift choice.

Consider: What does the price point signal? What does the level of personalization signal? What effort level does it imply? Could it be misinterpreted? What would the recipient likely think about the giver after receiving this?

STRICT OUTPUT FORMAT (respond ONLY with this JSON):
{
  "positive_signals": [
    "Signal 1: specific positive message this gift sends",
    "Signal 2: another positive signal",
    "Signal 3: another (include 2-4 signals)"
  ],
  "potential_risks": [
    "Risk 1: any way this could be misinterpreted (include 0-2 risks)"
  ],
  "overall_message": "A 2-3 sentence summary of what this gift says about the relationship. Written in second person: 'This gift tells [recipient] that you...'",
  "confidence_note": "One sentence about how well this gift matches the occasion and relationship. Example: 'This is a strong choice for a 3rd anniversary — personal without being over-the-top.'",
  "adjustment_suggestions": [
    "Optional tuning idea 1 for steering the same gift differently",
    "Optional tuning idea 2",
    "Optional tuning idea 3 (include 0-3 ideas)"
  ]
}`;

// ── JSON extraction helper (strips markdown fences if Claude adds them) ────────
function extractJSON(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return text;
}

// ── Response validation ────────────────────────────────────────────────────────
function validateSignalCheckResult(parsed: unknown): parsed is SignalCheckResult {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.positive_signals) || obj.positive_signals.length === 0) return false;
  if (!Array.isArray(obj.potential_risks)) return false;
  if (typeof obj.overall_message !== "string" || !obj.overall_message) return false;
  if (typeof obj.confidence_note !== "string" || !obj.confidence_note) return false;
  if (!Array.isArray(obj.adjustment_suggestions)) return false;

  // Validate that all signal entries are strings
  for (const s of obj.positive_signals) {
    if (typeof s !== "string") return false;
  }
  for (const r of obj.potential_risks) {
    if (typeof r !== "string") return false;
  }
  for (const suggestion of obj.adjustment_suggestions) {
    if (typeof suggestion !== "string") return false;
  }

  return true;
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── 1. Authenticate the caller ───────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── 2. Check plan access ─────────────────────────────────────────────────
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("active_plan, credits_balance")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      console.error("Failed to fetch user data:", userError?.message);
      return json({ error: "Failed to retrieve user profile" }, 500);
    }

    const userPlan = userData.active_plan ?? "spark";

    if (!ALLOWED_PLANS.includes(userPlan)) {
      return json(
        {
          error: "PLAN_RESTRICTED",
          message: "Signal Check is available on Confident and Gifting Pro plans.",
          upgrade_to: "confident",
          preview: "This gift communicates that you...",
        },
        403,
      );
    }

    // ── 3. Parse + validate request body ─────────────────────────────────────
    const parsedBody = await parseJsonBody<SignalCheckRequest>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const cleanGiftName = sanitizeString(body.gift_name, 200);
    const cleanGiftDescription = sanitizeString(body.gift_description || "", 500);
    const cleanFollowUpPrompt = sanitizeString(body.follow_up_prompt || "", 240);

    if (!cleanGiftName) {
      return json({ error: "Missing required field: gift_name" }, 400);
    }
    if (!body.recipient_relationship) {
      return json({ error: "Missing required field: recipient_relationship" }, 400);
    }
    if (!validateRelationship(body.recipient_relationship)) {
      return json({ error: "Invalid recipient relationship" }, 400);
    }
    if (!body.session_id) {
      return json({ error: "Missing required field: session_id" }, 400);
    }
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return json({ error: "Configuration error" }, 500);
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

    const { data: existingChecks, error: signalChecksError } = await supabaseAdmin
      .from("signal_checks")
      .select("id, gift_name, revision_number, follow_up_prompt, result_payload")
      .eq("user_id", user.id)
      .eq("session_id", body.session_id)
      .eq("gift_name", cleanGiftName)
      .order("revision_number", { ascending: false });

    if (signalChecksError) {
      console.error("Failed to fetch existing signal checks:", signalChecksError.message);
      return json({ error: "Failed to load saved signal checks" }, 500);
    }

    const savedChecks = (existingChecks ?? []) as StoredSignalCheck[];
    const latestSavedCheck = savedChecks[0] ?? null;

    if (!cleanFollowUpPrompt && latestSavedCheck) {
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

    if ((rateLimitCount ?? 0) >= 30) {
      return json(
        { error: "RATE_LIMITED", message: "Too many requests. Please wait." },
        429,
      );
    }

    const { error: rateLimitInsertError } = await supabaseAdmin
      .from("rate_limit_events")
      .insert({
        action: "signal-check",
        identifier: user.id,
        metadata: {
          session_id: body.session_id,
          gift_name: cleanGiftName,
        },
      });

    if (rateLimitInsertError) {
      console.error("Failed to record signal-check rate limit event:", rateLimitInsertError.message);
      return json({ error: "Failed to validate request rate" }, 500);
    }

    // ── 4. Deduct 0.5 credits ────────────────────────────────────────────────
    const { data: deductResult, error: rpcError } = await supabaseAdmin.rpc(
      "deduct_user_credit",
      {
        p_user_id: user.id,
        p_session_id: body.session_id,
        p_amount: 0.5,
      },
    );

    if (rpcError) {
      console.error("RPC error:", rpcError.message);
      return json({ error: "Failed to process credit deduction" }, 500);
    }

    if (!deductResult?.success) {
      return json(
        {
          error: "NO_CREDITS",
          message: "Not enough credits for Signal Check",
          remaining: deductResult?.remaining_balance ?? 0,
        },
        402,
      );
    }

    // ── 5. Build user message for Claude ─────────────────────────────────────
    const parentContext =
      cleanFollowUpPrompt && parentSignalCheck && validateSignalCheckResult(parentSignalCheck.result_payload)
        ? `\nPREVIOUS SIGNAL CHECK:\n${JSON.stringify(parentSignalCheck.result_payload, null, 2)}\nFOLLOW-UP DIRECTION: ${cleanFollowUpPrompt}\nRevise the analysis to move in that direction if possible. If the direction clashes with the gift, explain that honestly and use adjustment_suggestions to suggest how to steer the signal.`
        : "";

    const userMessage = `Analyze what this gift communicates:

GIFT: ${cleanGiftName}
DESCRIPTION: ${cleanGiftDescription || "Not provided"}
APPROXIMATE VALUE: ${body.currency} ${body.budget_spent ?? "Not specified"}

RECIPIENT: ${sanitizeString(body.recipient_name, 100)}
RELATIONSHIP: ${sanitizeString(body.recipient_relationship, 50)} (${sanitizeString(body.recipient_relationship_depth || "not specified", 50)})
OCCASION: ${sanitizeString(body.occasion, 50)}
${body.relationship_stage ? `RELATIONSHIP STAGE: ${sanitizeString(body.relationship_stage, 50)}` : ""}

What does giving this specific gift, for this occasion, to this person communicate?${parentContext}`;

    // ── 6. Call Claude Sonnet API (ALWAYS Sonnet — premium differentiator) ────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let anthropicResponse: Response;
    try {
      anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error)?.name === "AbortError") {
        return json(
          { error: "Signal Check timed out, please try again" },
          504,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // ── 7. Handle Anthropic error responses ──────────────────────────────────
    if (!anthropicResponse.ok) {
      const status = anthropicResponse.status;
      console.error(`Anthropic API error: ${status}`);

      if (status === 429) {
        return json({ error: "Please try again in a moment" }, 429);
      }
      if (status === 401 || status === 403) {
        return json({ error: "Configuration error" }, 500);
      }
      if (status >= 500) {
        return json({ error: "AI service temporarily unavailable" }, 502);
      }

      return json({ error: "AI service error" }, 502);
    }

    // ── 8. Parse Anthropic response ──────────────────────────────────────────
    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";

    if (!rawText) {
      console.error("Empty response from Anthropic:", JSON.stringify(anthropicData));
      return json({ error: "AI response format error" }, 500);
    }

    // ── 9. Extract, parse, and validate JSON ─────────────────────────────────
    let parsedResult: SignalCheckResult;
    try {
      const extracted = extractJSON(rawText);
      const parsed = JSON.parse(extracted);

      if (!validateSignalCheckResult(parsed)) {
        console.error(
          "Signal check response failed validation. Parsed:",
          JSON.stringify(parsed).substring(0, 500),
        );
        return json({ error: "Could not parse signal analysis" }, 500);
      }

      parsedResult = parsed;
    } catch {
      console.error("Failed to parse signal check JSON. Raw:", rawText.substring(0, 500));
      return json({ error: "Could not parse signal analysis" }, 500);
    }

    // ── 10. Store signal check result in the gift session ────────────────────
    let storedSignalCheckId: string | null = null;
    const nextRevisionNumber = (latestSavedCheck?.revision_number ?? 0) + 1;
    if (body.session_id) {
      try {
        const { data: insertedSignalCheck, error: insertSignalCheckError } = await supabaseAdmin
          .from("signal_checks")
          .insert({
            user_id: user.id,
            session_id: body.session_id,
            gift_name: cleanGiftName,
            parent_signal_check_id: cleanFollowUpPrompt ? (parentSignalCheck?.id ?? null) : null,
            revision_number: nextRevisionNumber,
            follow_up_prompt: cleanFollowUpPrompt || null,
            result_payload: parsedResult,
            credits_used: 0.5,
          })
          .select("id")
          .single();

        if (insertSignalCheckError) {
          console.error("Failed to store signal check row:", insertSignalCheckError.message);
        } else {
          storedSignalCheckId = insertedSignalCheck.id;
        }

        const currentAiResponse =
          session?.ai_response && typeof session.ai_response === "object" && !Array.isArray(session.ai_response)
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
            [cleanGiftName]: {
              latest_signal_check_id: storedSignalCheckId,
              revision_number: nextRevisionNumber,
              follow_up_prompt: cleanFollowUpPrompt || null,
              result: parsedResult,
            },
          },
        };

        const { error: updateError } = await supabaseAdmin
          .from("gift_sessions")
          .update({ ai_response: updatedResponse })
          .eq("id", body.session_id)
          .eq("user_id", user.id);

        if (updateError) {
          // Non-fatal — log and continue. The client still gets their signal check.
          console.error("Failed to update gift_session with signal check:", updateError.message);
        }
      } catch (storeErr) {
        // Non-fatal — log and continue
        console.error("Error storing signal check:", storeErr);
      }
    }

    // ── 11. Return success ───────────────────────────────────────────────────
    return json({
      success: true,
      signal: {
        positive_signals: parsedResult.positive_signals,
        potential_risks: parsedResult.potential_risks,
        overall_message: parsedResult.overall_message,
        confidence_note: parsedResult.confidence_note,
        adjustment_suggestions: parsedResult.adjustment_suggestions,
      },
      signal_check_id: storedSignalCheckId,
      revision_number: nextRevisionNumber,
      credits_remaining: deductResult.remaining_balance,
    });
  } catch (err) {
    // ── 12. Catch-all error handler ──────────────────────────────────────────
    console.error("Unhandled error in signal-check:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
