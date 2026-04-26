import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";

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

// ── Helper: strip markdown fences Claude sometimes wraps JSON in ──────────────
function extractJSON(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return text;
}

// ── Helper: call Anthropic API ────────────────────────────────────────────────
async function callClaude(opts: {
  model: string;
  maxTokens: number;
  system: string;
  userMessage: string;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.userMessage }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    console.error(`Anthropic API error: ${status}`);
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status === 401 || status === 403) throw new Error("AUTH_ERROR");
    if (status >= 500) throw new Error("UPSTREAM_ERROR");
    throw new Error(`ANTHROPIC_${status}`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? "";
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

// ── Request body type ─────────────────────────────────────────────────────────
interface BlogAIRequest {
  action: "generate_draft" | "improve_seo" | "generate_excerpt";
  topic?: string;
  tone?: "informative" | "casual" | "listicle";
  target_word_count?: 800 | 1200 | 2000;
  existing_content?: string;
  focus_keyword?: string;
}

const VALID_ACTIONS = ["generate_draft", "improve_seo", "generate_excerpt"] as const;
const VALID_TONES = ["informative", "casual", "listicle"] as const;
const VALID_WORD_COUNTS = [800, 1200, 2000] as const;

// ── System prompts ────────────────────────────────────────────────────────────
const GENERATE_DRAFT_SYSTEM = `You are a gifting expert content writer for GiftMind, an AI-powered gift recommendation platform that works globally.

YOUR WRITING STYLE:
- Warm, conversational, relatable — like talking to a friend
- Use real examples and scenarios from multiple cultures (Indian, Western, Middle Eastern, Asian — be inclusive)
- Include specific product suggestions with price ranges
- Reference gift psychology and research naturally (not academically)
- Naturally mention GiftMind as a solution (helpful, not salesy)
- Use "you" and "your" — second person, direct address
- Short paragraphs (3-4 sentences max)
- Use subheadings (##) every 200-300 words
- Include one personal anecdote or relatable scenario per section

SEO REQUIREMENTS:
- Use the focus keyword naturally 3-5 times
- First paragraph must include the keyword
- Use at least 3 ## subheadings with keyword variations
- Include a meta description (150-160 chars) that compels clicks
- End with a soft CTA mentioning GiftMind's free credits

DO NOT:
- Be generic ("finding the perfect gift is hard" — too overused)
- Sound like a product advertisement
- Use AI-detectable patterns (no "In today's world...", "It's no secret that...")
- Mention only Indian or only American contexts — be GLOBAL

OUTPUT FORMAT (strict JSON, no markdown outside):
{
  "title": "SEO-optimized title, 50-60 chars, compelling",
  "excerpt": "Meta description, 150-160 chars, includes keyword",
  "content": "Full blog post in Markdown format with ## headings",
  "suggested_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "meta_title": "Title for search engines (can differ from display title)",
  "meta_description": "Same as excerpt or slightly different for search"
}`;

const IMPROVE_SEO_SYSTEM = `You are an SEO specialist reviewing a blog post for GiftMind.

Analyze the content against the focus keyword and provide specific, actionable improvements. Don't be generic — reference specific sentences and suggest exact rewrites.

OUTPUT FORMAT (strict JSON):
{
  "overall_score": 72,
  "improvements": [
    {
      "type": "keyword_density",
      "current": "Keyword appears 1 time",
      "suggestion": "Add keyword to these locations: [specific places]"
    },
    {
      "type": "heading_optimization",
      "current": "H2 'Gift Ideas' doesn't include keyword",
      "suggestion": "Change to 'Best [Keyword] Gift Ideas for 2026'"
    }
  ],
  "missing_elements": ["internal link to /gift-flow", "image alt text suggestion"],
  "rewritten_meta_description": "Improved 160-char meta description"
}`;

const GENERATE_EXCERPT_SYSTEM = `Extract a compelling excerpt from this blog post. Must be 155-160 characters. Must include the main topic. Must make readers want to click. Return ONLY the excerpt text, no JSON wrapping, no quotes.`;

// ── Validators ────────────────────────────────────────────────────────────────
function validateDraftResult(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return (
    typeof obj.title === "string" && obj.title.length > 0 &&
    typeof obj.excerpt === "string" &&
    typeof obj.content === "string" && obj.content.length > 0 &&
    Array.isArray(obj.suggested_tags) &&
    typeof obj.meta_title === "string" &&
    typeof obj.meta_description === "string"
  );
}

function validateSEOResult(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return (
    typeof obj.overall_score === "number" &&
    Array.isArray(obj.improvements)
  );
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
    // ── 1. Authenticate the caller ─────────────────────────────────────────────
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

    // ── 2. Verify admin role ───────────────────────────────────────────────────
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "superadmin"])
      .limit(1)
      .maybeSingle();

    if (roleError) {
      console.error("Failed to fetch user role:", roleError.message);
      return json({ error: "Failed to retrieve user role" }, 500);
    }

    if (!roleData) {
      return json({ error: "Forbidden" }, 403);
    }

    // ── 3. Check API key ───────────────────────────────────────────────────────
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return json({ error: "Configuration error" }, 500);
    }

    // ── 4. Parse request body ──────────────────────────────────────────────────
    const parsedBody = await parseJsonBody<BlogAIRequest>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    if (!body.action) {
      return json({ error: "Missing required field: action" }, 400);
    }
    if (!VALID_ACTIONS.includes(body.action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const cleanTopic = sanitizeString(body.topic || "", 200);
    const cleanFocusKeyword = sanitizeString(body.focus_keyword || "", 100);
    const cleanExistingContent = sanitizeString(body.existing_content || "", 10_000);
    const tone = body.tone ?? "informative";
    const wordCount = body.target_word_count ?? 1200;

    if (body.tone && !VALID_TONES.includes(body.tone)) {
      return json({ error: "Invalid tone" }, 400);
    }
    if (body.target_word_count && !VALID_WORD_COUNTS.includes(body.target_word_count)) {
      return json({ error: "Invalid target_word_count" }, 400);
    }

    // ── 5. Route to appropriate action ────────────────────────────────────────

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: generate_draft
    // ────────────────────────────────────────────────────────────────────────
    if (body.action === "generate_draft") {
      if (!cleanTopic) {
        return json({ error: "Missing required field: topic" }, 400);
      }

      const userMessage = `Write a ${wordCount}-word blog post about: "${cleanTopic}"

Tone: ${tone}
Target word count: ${wordCount}

The blog is for GiftMind (giftmind.in) — an AI gift recommendation platform that helps users find confident gift choices with buy links to local stores in their country.

Return ONLY valid JSON.`;

      let rawText: string;
      try {
        rawText = await callClaude({
          model: "claude-sonnet-4-20250514",
          maxTokens: 4000,
          system: GENERATE_DRAFT_SYSTEM,
          userMessage,
          timeoutMs: 90_000, // blog drafts can be slow
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "RATE_LIMITED") return json({ error: "Please try again in a moment" }, 429);
        if (msg === "AUTH_ERROR") return json({ error: "Configuration error" }, 500);
        if (msg === "AbortError" || msg === "UPSTREAM_ERROR") return json({ error: "AI service temporarily unavailable. Please try again." }, 502);
        throw err;
      }

      let parsed: unknown;
      try {
        const extracted = extractJSON(rawText);
        parsed = JSON.parse(extracted);
      } catch {
        console.error("Failed to parse draft JSON. Raw:", rawText.substring(0, 500));
        return json({ error: "Could not parse AI response. Please try again." }, 500);
      }

      if (!validateDraftResult(parsed)) {
        console.error("Draft result failed validation:", JSON.stringify(parsed).substring(0, 500));
        return json({ error: "AI returned an incomplete draft. Please try again." }, 500);
      }

      return json({ success: true, action: "generate_draft", result: parsed });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: improve_seo
    // ────────────────────────────────────────────────────────────────────────
    if (body.action === "improve_seo") {
      if (!cleanExistingContent) {
        return json({ error: "Missing required field: existing_content" }, 400);
      }
      if (!cleanFocusKeyword) {
        return json({ error: "Missing required field: focus_keyword" }, 400);
      }

      const userMessage = `Review this blog post for SEO. Focus keyword: "${cleanFocusKeyword}"

Content:
${cleanExistingContent}

Return specific improvements as JSON.`;

      let rawText: string;
      try {
        rawText = await callClaude({
          model: "claude-haiku-4-5-20251001",
          maxTokens: 1500,
          system: IMPROVE_SEO_SYSTEM,
          userMessage,
          timeoutMs: 30_000,
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "RATE_LIMITED") return json({ error: "Please try again in a moment" }, 429);
        if (msg === "AUTH_ERROR") return json({ error: "Configuration error" }, 500);
        throw err;
      }

      let parsed: unknown;
      try {
        const extracted = extractJSON(rawText);
        parsed = JSON.parse(extracted);
      } catch {
        console.error("Failed to parse SEO JSON. Raw:", rawText.substring(0, 500));
        return json({ error: "Could not parse SEO analysis. Please try again." }, 500);
      }

      if (!validateSEOResult(parsed)) {
        console.error("SEO result failed validation:", JSON.stringify(parsed).substring(0, 500));
        return json({ error: "AI returned an invalid SEO analysis. Please try again." }, 500);
      }

      return json({ success: true, action: "improve_seo", result: parsed });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: generate_excerpt
    // ────────────────────────────────────────────────────────────────────────
    if (body.action === "generate_excerpt") {
      if (!cleanExistingContent) {
        return json({ error: "Missing required field: existing_content" }, 400);
      }

      // Trim to 2000 chars to keep cost low for Haiku
      const contentSnippet = cleanExistingContent.slice(0, 2000);

      let rawText: string;
      try {
        rawText = await callClaude({
          model: "claude-haiku-4-5-20251001",
          maxTokens: 100,
          system: GENERATE_EXCERPT_SYSTEM,
          userMessage: contentSnippet,
          timeoutMs: 15_000,
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "RATE_LIMITED") return json({ error: "Please try again in a moment" }, 429);
        if (msg === "AUTH_ERROR") return json({ error: "Configuration error" }, 500);
        throw err;
      }

      // Strip any stray quotes or markdown the model might add
      const excerpt = rawText.trim().replace(/^"+|"+$/g, "").trim();

      return json({ success: true, action: "generate_excerpt", result: excerpt });
    }

    // ── Invalid action ─────────────────────────────────────────────────────────
    return json(
      { error: `Invalid action: "${body.action}". Must be one of: generate_draft, improve_seo, generate_excerpt` },
      400,
    );

  } catch (err) {
    // ── Catch-all error handler ────────────────────────────────────────────────
    console.error("Unhandled error in blog-ai-assistant:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
