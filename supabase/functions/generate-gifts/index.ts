import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeArray, sanitizeString, validateBudget, validateCurrency, validateOccasion } from "../_shared/validate.ts";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────
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
  relationship_stage?: string | null;
  special_context?: string | null;
  context_tags?: string[];
  recipient_country?: string | null;
  user_plan: string;
  session_id: string;
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

// ── System prompt ──────────────────────────────────────────────────────────────
const systemPrompt = `You are GiftMind, an expert gift recommendation engine. 
You combine behavioral psychology, cultural intelligence, and relationship dynamics 
to suggest gifts that make givers feel CONFIDENT about their choice.

YOUR TASK: Generate exactly 3 gift recommendations based on the user's inputs.

CONFIDENCE SCORE CALCULATION (0-100):
- Interest match (30%): How well the gift matches the recipient's stated interests
- Occasion fit (25%): How appropriate the gift is for this specific occasion
- Budget alignment (20%): How well the gift fits within the stated budget range
- Relationship appropriateness (15%): How suitable the gift is for this relationship type and depth
- Cultural sensitivity (10%): Whether the gift respects cultural norms and avoids taboos

RELATIONSHIP CALIBRATION:
- Partner/Spouse: Personal, romantic, can be intimate. Shared memories beat luxury.
- Parent: Respectful, thoughtful. Experiences and personalized items beat generic.
- Close Friend: Fun, personal, shows you "get" them. Inside jokes welcome.
- Colleague/Boss: Professional, safe, not too personal. Universal appeal matters.
- New Relationship (< 6 months): SUBTLE. Don't overcommit. ₹500-2000/$15-30 range. 
  Experiences > objects. A great playlist > an expensive watch.
- Acquaintance: Safe, universally appreciated, consumable (food, candles, plants).

CULTURAL RULES (apply when relevant):
INDIA:
- Diwali: Gifts symbolizing prosperity. NO leather for Hindu recipients. 
  Shagun amounts should end in 1 (₹501, ₹1001). Avoid black/white wrapping.
- Raksha Bandhan: Rakhi + gift combo for brothers/sisters.
- Holi: Colors, sweets, playful items.
- General: "Soan papdi syndrome" — avoid generic sweet boxes. Be specific.

ISLAMIC CONTEXTS (UAE, Eid):
- No alcohol or pork-related items
- Eid: Generous gifting expected. Eidi (cash) for children is traditional.
- Ramadan: Dates, prayer items, luxury food items

WESTERN (US/UK/EU):
- Christmas: Stockings, Secret Santa budgets are typically $20-50
- Valentine's: Romantic, personal. Experiences highly valued.
- Avoid overly personal items for professional relationships

FRANCE SPECIFIC: Quality over quantity. Artisan products valued. Wine is safe.
GERMANY SPECIFIC: Practical gifts appreciated. Punctuality in delivery matters.
JAPAN SPECIFIC: Presentation matters as much as the gift. Always wrap beautifully.

CROSS-BORDER GIFTING:
When the giver and recipient are in different countries, recommend gifts that:
1. Are available for purchase and delivery in the RECIPIENT's country
2. Respect the RECIPIENT's cultural norms, not the giver's
3. Are calibrated to the RECIPIENT's local price levels
4. Include a note about international delivery if relevant

STRICT OUTPUT FORMAT (respond ONLY with this JSON, no markdown, no explanation):
{
  "recommendations": [
    {
      "name": "Gift name (specific, not generic)",
      "description": "2-3 sentence description of the gift",
      "why_it_works": "Personalized reasoning referencing the recipient's specific interests, relationship, and occasion. This should feel like advice from a thoughtful friend, not a generic product description.",
      "confidence_score": 85,
      "signal_interpretation": "What this gift communicates about the giver-recipient relationship. Example: 'This says: I pay attention to your hobbies and value our friendship enough to choose something specific to you.'",
      "search_keywords": ["keyword phrase 1 for ecommerce search", "keyword phrase 2", "keyword phrase 3"],
      "product_category": "one of: electronics, fashion, accessories, beauty, home_decor, kitchen, books, experience, personalized, flowers_cakes, jewelry, wellness, toys_kids, sports, art, subscription, handmade, traditional, luxury",
      "price_anchor": 2500,
      "what_not_to_do": "One line about what to avoid. Example: 'Don't add a generic greeting card — write a personal note about a shared memory instead.'"
    }
  ],
  "occasion_insight": "One line about this occasion's gifting dynamics. Example: 'Anniversary gifts carry double weight — they signal both romantic attentiveness AND relationship investment.'",
  "budget_assessment": "Whether their budget is appropriate. Example: 'Your budget of ₹2,000-5,000 is generous for a close friend's birthday — you have room for something truly personal.'",
  "cultural_note": "Any cultural consideration, or null if not applicable. Example: 'For Diwali, this gift avoids leather and features gold tones — both culturally appropriate choices.'"
}

CRITICAL RULES:
- Return EXACTLY 3 recommendations, no more, no less
- Confidence scores should be realistic: 90+ only when multiple signals strongly align
- NEVER suggest "gift card" unless the user's context explicitly says "they want to choose"
- NEVER suggest generic items (chocolate box, generic flowers) for close relationships
- search_keywords must be optimized for e-commerce search — specific enough to find real products
- price_anchor must be a number within the user's budget range in their currency
- Respond ONLY with valid JSON. No markdown backticks, no explanatory text before/after.`;

// ── Model selection based on user plan ────────────────────────────────────────
function selectModel(plan: string): string {
  if (plan === "pro") {
    return "claude-sonnet-4-20250514";
  }
  return "claude-haiku-4-5-20251001";
}

// ── JSON extraction helper (strips markdown fences if Claude adds them) ────────
function extractJSON(raw: string): string {
  let text = raw.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return text;
}

// ── Response validation ────────────────────────────────────────────────────────
function validateAIResponse(parsed: unknown): parsed is AIResponse {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.recommendations)) return false;
  if (obj.recommendations.length !== 3) return false;

  for (const rec of obj.recommendations as unknown[]) {
    if (typeof rec !== "object" || rec === null) return false;
    const r = rec as Record<string, unknown>;
    const requiredFields = [
      "name", "description", "why_it_works", "confidence_score",
      "signal_interpretation", "search_keywords", "product_category",
      "price_anchor", "what_not_to_do",
    ];
    for (const field of requiredFields) {
      if (!(field in r)) return false;
    }
    if (!Array.isArray(r.search_keywords)) return false;
    if (typeof r.confidence_score !== "number") return false;
    if (typeof r.price_anchor !== "number") return false;
  }

  if (typeof obj.occasion_insight !== "string") return false;
  if (typeof obj.budget_assessment !== "string") return false;
  // cultural_note can be string or null
  if (obj.cultural_note !== null && typeof obj.cultural_note !== "string") return false;

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
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ── 1. Authenticate caller ───────────────────────────────────────────────
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

    // ── 2. Parse request body ────────────────────────────────────────────────
    const parsedBody = await parseJsonBody<GiftRequest>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const {
      recipient,
      occasion,
      occasion_date,
      budget_min,
      budget_max,
      currency,
      relationship_stage,
      special_context,
      context_tags,
      recipient_country,
      session_id,
    } = body;

    // ── 3. Validate required fields ──────────────────────────────────────────
    if (!recipient?.name) {
      return json({ error: "Missing required field: recipient.name" }, 400);
    }
    if (sanitizeString(recipient.name, 100).length < 1) {
      return json({ error: "recipient.name must be between 1 and 100 characters" }, 400);
    }
    if (!occasion) {
      return json({ error: "Missing required field: occasion" }, 400);
    }
    if (!validateOccasion(occasion)) {
      return json({ error: "Invalid occasion" }, 400);
    }
    if (budget_min === undefined || budget_min === null) {
      return json({ error: "Missing required field: budget_min" }, 400);
    }
    if (budget_max === undefined || budget_max === null) {
      return json({ error: "Missing required field: budget_max" }, 400);
    }
    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400);
    }
    if (!validateBudget(budget_min, budget_max)) {
      return json({ error: "Invalid budget range" }, 400);
    }
    if (!validateCurrency(currency)) {
      return json({ error: "Invalid currency" }, 400);
    }
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return json({ error: "Configuration error" }, 500);
    }

    const cleanRecipientName = sanitizeString(recipient.name, 100);
    const cleanRelationship = sanitizeString(recipient.relationship, 50);
    const cleanRecipientNotes = sanitizeString(recipient.notes ?? "", 500);
    const cleanSpecialContext = sanitizeString(special_context ?? "", 500);
    const cleanContextTags = sanitizeArray(context_tags ?? [], 10);
    const cleanRecipientCountry = sanitizeString(recipient.country ?? "", 20).toUpperCase();

    // ── 4. Enforce session ownership and server-side rate limit ──────────────
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gift_sessions")
      .select("id, user_id")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return json({ error: "Gift session not found" }, 404);
    }

    if (session.user_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error: rateLimitError } = await supabaseAdmin
      .from("gift_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);

    if (rateLimitError) {
      console.error("Failed to enforce generate-gifts rate limit:", rateLimitError.message);
      return json({ error: "Failed to validate request rate" }, 500);
    }

    if ((count ?? 0) >= 10) {
      return json(
        { error: "RATE_LIMITED", message: "Too many requests. Please wait." },
        429,
      );
    }

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from("users")
      .select("active_plan")
      .eq("id", user.id)
      .single();

    if (userDataError || !userData) {
      console.error("Failed to fetch user plan:", userDataError?.message);
      return json({ error: "Failed to retrieve user profile" }, 500);
    }

    // ── 5. Select AI model based on the server-side plan ─────────────────────
    const selectedModel = selectModel(userData.active_plan ?? "free");

    // ── 6. Determine country context ─────────────────────────────────────────
    const recipientCountry = sanitizeString(recipient_country ?? cleanRecipientCountry ?? "", 20).toUpperCase() || null;
    const userCountry: string | null = null; // Could be extended from user profile if needed

    // ── 7. Build user message ────────────────────────────────────────────────
    const userMessage = `Find 3 gift recommendations for this situation:

RECIPIENT:
- Name: ${cleanRecipientName}
- Relationship: ${cleanRelationship} (${sanitizeString(recipient.relationship_depth ?? "not specified", 50)})
- Age range: ${recipient.age_range ?? "not specified"}
- Gender: ${recipient.gender ?? "not specified"}
- Interests: ${sanitizeArray(recipient.interests ?? [], 15).join(", ") || "none specified"}
- Cultural context: ${sanitizeString(recipient.cultural_context ?? "not specified", 100)}
- Lives in: ${recipientCountry ?? "same country as giver"}
- Additional notes: ${cleanRecipientNotes || "none"}

OCCASION: ${occasion}
${occasion_date ? `Date: ${occasion_date}` : ""}

BUDGET: ${currency} ${budget_min} - ${budget_max}

${relationship_stage ? `RELATIONSHIP STAGE: ${relationship_stage}` : ""}
${cleanSpecialContext ? `ADDITIONAL CONTEXT: ${cleanSpecialContext}` : ""}
${cleanContextTags.length ? `CONTEXT TAGS: ${cleanContextTags.join(", ")}` : ""}

${
  recipientCountry && userCountry && recipientCountry !== userCountry
    ? `CROSS-BORDER NOTE: The giver is in ${userCountry} but the recipient is in ${recipientCountry}. Show gifts available in ${recipientCountry}.`
    : recipientCountry
    ? `DELIVERY COUNTRY: ${recipientCountry}. Recommend gifts available there.`
    : ""
}

Return your response as valid JSON matching the specified format.`;

    // ── 8. Call Anthropic API with 30s timeout ───────────────────────────────
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
          model: selectedModel,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error)?.name === "AbortError") {
        return json({ error: "AI request timed out. Please try again." }, 504);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // ── 9. Handle Anthropic error responses ──────────────────────────────────
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

    // ── 10. Parse Anthropic response ────────────────────────────────────────
    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";

    if (!rawText) {
      console.error("Empty response from Anthropic:", JSON.stringify(anthropicData));
      return json({ error: "AI response format error" }, 500);
    }

    // ── 11. Extract and validate JSON ────────────────────────────────────────
    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(extractJSON(rawText));
    } catch {
      console.error("Failed to parse AI JSON. Raw text:", rawText.substring(0, 500));
      return json({ error: "AI response format error" }, 500);
    }

    if (!validateAIResponse(parsedResponse)) {
      console.error(
        "AI response failed validation. Parsed:",
        JSON.stringify(parsedResponse).substring(0, 500),
      );
      return json({ error: "AI response format error" }, 500);
    }

    const recommendations = parsedResponse.recommendations;
    const topConfidence = recommendations.reduce(
      (max, recommendation) => Math.max(max, recommendation.confidence_score ?? 0),
      0,
    );

    // ── 12. Persist result to the caller's gift session ──────────────────────
    if (session_id) {
      const { error: dbError } = await supabaseAdmin
        .from("gift_sessions")
        .update({
          ai_response: parsedResponse,
          confidence_score: topConfidence,
          status: "active",
        })
        .eq("id", session_id)
        .eq("user_id", user.id);

      if (dbError) {
        // Non-fatal — log and continue. The client still gets their recommendations.
        console.error("Failed to update gift_session:", dbError.message);
      }
    }

    // ── 13. Return success ────────────────────────────────────────────────────
    return json({
      success: true,
      recommendations: parsedResponse.recommendations,
      occasion_insight: parsedResponse.occasion_insight,
      budget_assessment: parsedResponse.budget_assessment,
      cultural_note: parsedResponse.cultural_note,
      model_used: selectedModel,
    });
  } catch (err) {
    // ── 14. Catch-all error handler ───────────────────────────────────────────
    console.error("Unhandled error in generate-gifts:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
