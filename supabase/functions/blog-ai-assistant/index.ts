import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIFallbackError, callAIWithFallback, parseAIJson, type Provider } from "../_shared/ai-providers.ts";
import { logAiCall } from "../_shared/telemetry.ts";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

type BlogAIAction =
  | "generate_draft"
  | "improve_seo"
  | "generate_excerpt"
  | "generate_title_variants"
  | "rewrite_section";

interface BlogAIRequest {
  action: BlogAIAction;
  topic?: string;
  tone?: "informative" | "casual" | "listicle";
  target_word_count?: 800 | 1200 | 2000;
  existing_content?: string;
  focus_keyword?: string;
  section_text?: string;
  instruction?: string;
}

const VALID_ACTIONS: BlogAIAction[] = [
  "generate_draft",
  "improve_seo",
  "generate_excerpt",
  "generate_title_variants",
  "rewrite_section",
];
const VALID_TONES = ["informative", "casual", "listicle"] as const;
const VALID_WORD_COUNTS = [800, 1200, 2000] as const;

const ACTION_CONFIG: Record<BlogAIAction, { chain: Provider[]; maxTokens: number; timeoutMs: number; responseFormat: "json" | "text" }> = {
  generate_draft: { chain: ["claude-sonnet", "gemini-pro"], maxTokens: 4000, timeoutMs: 90_000, responseFormat: "json" },
  improve_seo: { chain: ["claude-haiku", "gemini-flash"], maxTokens: 1500, timeoutMs: 30_000, responseFormat: "json" },
  generate_excerpt: { chain: ["gemini-flash", "claude-haiku"], maxTokens: 100, timeoutMs: 15_000, responseFormat: "text" },
  generate_title_variants: { chain: ["gemini-flash", "claude-haiku"], maxTokens: 500, timeoutMs: 15_000, responseFormat: "json" },
  rewrite_section: { chain: ["claude-haiku", "gemini-flash"], maxTokens: 1000, timeoutMs: 20_000, responseFormat: "json" },
};

const GENERATE_DRAFT_SYSTEM = `You are a gifting expert content writer for GiftMind, an AI-powered gift recommendation platform that works globally.

Write warm, concrete, globally inclusive content. Use short paragraphs, practical examples, markdown H2 headings, natural SEO, and a soft GiftMind CTA.

OUTPUT FORMAT (strict JSON, no markdown outside):
{
  "title": "SEO-optimized title, 50-60 chars",
  "excerpt": "Meta description, 150-160 chars",
  "content": "Full blog post in Markdown format with ## headings",
  "suggested_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "meta_title": "Title for search engines",
  "meta_description": "Search description"
}`;

const IMPROVE_SEO_SYSTEM = `You are an SEO specialist reviewing a GiftMind blog post. Return strict JSON with specific fixes:
{
  "overall_score": 72,
  "improvements": [{"type": "...", "current": "...", "suggestion": "..."}],
  "missing_elements": ["..."],
  "rewritten_meta_description": "..."
}`;

const GENERATE_EXCERPT_SYSTEM = `Extract a compelling excerpt from this blog post. Must be 155-160 characters. Return ONLY the excerpt text, no JSON wrapping, no quotes.`;

const TITLE_VARIANTS_SYSTEM = `Create SEO-aware title variants for a GiftMind blog post.
Return strict JSON:
{
  "variants": [
    { "title": "...", "style": "seo", "chars": 54 },
    { "title": "...", "style": "clickbait", "chars": 49 },
    { "title": "...", "style": "question", "chars": 61 },
    { "title": "...", "style": "list", "chars": 58 },
    { "title": "...", "style": "emotional", "chars": 52 }
  ]
}`;

const REWRITE_SECTION_SYSTEM = `Rewrite a selected markdown section for a GiftMind blog post.
Preserve markdown formatting where useful and follow the user's instruction.
Return strict JSON: { "rewritten": "..." }`;

function validateDraftResult(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.title === "string" && typeof obj.excerpt === "string" && typeof obj.content === "string" && Array.isArray(obj.suggested_tags);
}

function validateSEOResult(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.overall_score === "number" && Array.isArray(obj.improvements);
}

function validateTitleVariants(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const variants = (parsed as { variants?: unknown }).variants;
  return Array.isArray(variants) && variants.length > 0 && variants.every((item) => {
    const variant = item as Record<string, unknown>;
    return typeof variant.title === "string" && typeof variant.style === "string" && typeof variant.chars === "number";
  });
}

function validateRewrite(parsed: unknown): boolean {
  return typeof parsed === "object" && parsed !== null && typeof (parsed as { rewritten?: unknown }).rewritten === "string";
}

async function loadBlogSettings() {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["blog_ai_generations_per_day", "maintenance_mode", "ai_timeout_ms_primary", "ai_timeout_ms_fallback", "ai_max_attempts"]);

  if (error) {
    console.error("Failed to load blog AI settings:", error.message);
    return {};
  }

  return Object.fromEntries((data || []).map((row) => [row.key, row.value])) as Record<string, unknown>;
}

async function enforceDailyLimit(limit: number) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("ai_telemetry_log")
    .select("id", { count: "exact", head: true })
    .eq("function_name", "blog-ai-assistant")
    .gte("created_at", todayStart.toISOString());

  if (error) {
    console.error("Failed to enforce blog AI limit:", error.message);
    return;
  }

  if ((count || 0) >= limit) {
    throw new Response(
      JSON.stringify({ error: `Daily AI generation limit (${limit}) reached. Resets at midnight.` }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

function getLimit(settings: Record<string, unknown>) {
  const raw = settings.blog_ai_generations_per_day;
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 50;
}

function mapAIError(error: unknown) {
  if (error instanceof AIFallbackError) {
    if (error.finalType === "rate_limit") return { status: 429, message: "Please try again in a moment" };
    if (error.finalType === "timeout") return { status: 504, message: "AI request timed out. Please try again." };
    if (error.finalType === "config") return { status: 500, message: "Configuration error" };
    return { status: 502, message: "AI service temporarily unavailable. Please try again." };
  }

  return { status: 500, message: "An unexpected error occurred. Please try again." };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "superadmin"])
      .limit(1)
      .maybeSingle();

    if (roleError) return json({ error: "Failed to retrieve user role" }, 500);
    if (!roleData) return json({ error: "Forbidden" }, 403);

    const parsedBody = await parseJsonBody<BlogAIRequest>(req, json);
    if (parsedBody.response) return parsedBody.response;
    const body = parsedBody.data!;

    if (!VALID_ACTIONS.includes(body.action)) return json({ error: "Invalid action" }, 400);
    if (body.tone && !VALID_TONES.includes(body.tone)) return json({ error: "Invalid tone" }, 400);
    if (body.target_word_count && !VALID_WORD_COUNTS.includes(body.target_word_count)) return json({ error: "Invalid target_word_count" }, 400);

    const settings = await loadBlogSettings();
    if (settings.maintenance_mode === true) return json({ error: "Maintenance mode is active" }, 503);
    await enforceDailyLimit(getLimit(settings));

    const action = body.action;
    const config = ACTION_CONFIG[action];
    const cleanTopic = sanitizeString(body.topic || "", 200);
    const cleanFocusKeyword = sanitizeString(body.focus_keyword || "", 100);
    const cleanExistingContent = sanitizeString(body.existing_content || "", 12_000);
    const cleanSectionText = sanitizeString(body.section_text || "", 6_000);
    const cleanInstruction = sanitizeString(body.instruction || "", 500);
    const tone = body.tone ?? "informative";
    const wordCount = body.target_word_count ?? 1200;

    let systemPrompt = "";
    let userMessage = "";

    if (action === "generate_draft") {
      if (!cleanTopic) return json({ error: "Missing required field: topic" }, 400);
      systemPrompt = GENERATE_DRAFT_SYSTEM;
      userMessage = `Write a ${wordCount}-word blog post about: "${cleanTopic}"

Tone: ${tone}
Target word count: ${wordCount}
Focus keyword: ${cleanFocusKeyword || cleanTopic}

Return ONLY valid JSON.`;
    }

    if (action === "improve_seo") {
      if (!cleanExistingContent) return json({ error: "Missing required field: existing_content" }, 400);
      if (!cleanFocusKeyword) return json({ error: "Missing required field: focus_keyword" }, 400);
      systemPrompt = IMPROVE_SEO_SYSTEM;
      userMessage = `Review this blog post for SEO. Focus keyword: "${cleanFocusKeyword}"

Content:
${cleanExistingContent}

Return specific improvements as JSON.`;
    }

    if (action === "generate_excerpt") {
      if (!cleanExistingContent) return json({ error: "Missing required field: existing_content" }, 400);
      systemPrompt = GENERATE_EXCERPT_SYSTEM;
      userMessage = cleanExistingContent.slice(0, 2500);
    }

    if (action === "generate_title_variants") {
      if (!cleanExistingContent && !cleanFocusKeyword) return json({ error: "Add content or a focus keyword first" }, 400);
      systemPrompt = TITLE_VARIANTS_SYSTEM;
      userMessage = `Focus keyword: ${cleanFocusKeyword || "not specified"}

Existing content:
${cleanExistingContent.slice(0, 5000)}

Return 5 title variants as JSON.`;
    }

    if (action === "rewrite_section") {
      if (!cleanSectionText) return json({ error: "Missing required field: section_text" }, 400);
      if (!cleanInstruction) return json({ error: "Missing required field: instruction" }, 400);
      systemPrompt = REWRITE_SECTION_SYSTEM;
      userMessage = `Instruction: ${cleanInstruction}
Focus keyword: ${cleanFocusKeyword || "not specified"}

Section:
${cleanSectionText}`;
    }

    const aiResult = await callAIWithFallback(
      config.chain,
      {
        systemPrompt,
        userMessage,
        maxTokens: config.maxTokens,
        responseFormat: config.responseFormat,
        timeoutMs: config.timeoutMs,
      },
      { ...settings, ai_max_attempts: config.chain.length },
    );

    await logAiCall(supabaseAdmin, {
      function_name: "blog-ai-assistant",
      provider: aiResult.provider,
      attempt_number: aiResult.attemptNumber,
      status: "success",
      latency_ms: aiResult.latencyMs,
      tokens_input: aiResult.tokensInput,
      tokens_output: aiResult.tokensOutput,
    });

    if (action === "generate_excerpt") {
      return json({ success: true, action, result: aiResult.text.trim().replace(/^"+|"+$/g, "").trim().slice(0, 160) });
    }

    let parsed: unknown;
    try {
      parsed = parseAIJson(aiResult.text);
    } catch {
      return json({ error: "Could not parse AI response. Please try again." }, 500);
    }

    if (action === "generate_draft" && !validateDraftResult(parsed)) return json({ error: "AI returned an incomplete draft. Please try again." }, 500);
    if (action === "improve_seo" && !validateSEOResult(parsed)) return json({ error: "AI returned an invalid SEO analysis. Please try again." }, 500);
    if (action === "generate_title_variants" && !validateTitleVariants(parsed)) return json({ error: "AI returned invalid title variants. Please try again." }, 500);
    if (action === "rewrite_section" && !validateRewrite(parsed)) return json({ error: "AI returned an invalid rewrite. Please try again." }, 500);

    return json({ success: true, action, result: parsed });
  } catch (error) {
    if (error instanceof Response) return error;

    const mapped = mapAIError(error);
    if (error instanceof AIFallbackError) {
      const last = error.errors[error.errors.length - 1];
      await logAiCall(supabaseAdmin, {
        function_name: "blog-ai-assistant",
        provider: last?.provider || "unknown",
        attempt_number: error.errors.length,
        status: error.finalType === "rate_limit" ? "rate_limited" : error.finalType === "timeout" ? "timeout" : "error",
        error_type: error.finalType,
        error_message: error.message,
      });
    }

    console.error("Unhandled error in blog-ai-assistant:", error);
    return json({ error: mapped.message }, mapped.status);
  }
});
