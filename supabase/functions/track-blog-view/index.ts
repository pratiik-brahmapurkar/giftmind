import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getUserId(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const parsedBody = await parseJsonBody<{ slug?: string; action?: "view" | "cta_click" }>(req, json);
    if (parsedBody.response) return parsedBody.response;

    const slug = sanitizeString(parsedBody.data?.slug || "", 120);
    const action = parsedBody.data?.action || "view";

    if (!slug) return json({ error: "Missing slug" }, 400);
    if (action !== "view" && action !== "cta_click") return json({ error: "Invalid action" }, 400);

    const { data: post, error: postError } = await supabaseAdmin
      .from("blog_posts")
      .select("id, slug, status")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (postError) throw postError;
    if (!post) return json({ error: "Post not found" }, 404);

    if (action === "cta_click") {
      const { error: incrementError } = await supabaseAdmin.rpc("increment_blog_cta_click", { post_id: post.id });
      if (incrementError) {
        const { data: current } = await supabaseAdmin
          .from("blog_posts")
          .select("cta_click_count")
          .eq("id", post.id)
          .single();

        await supabaseAdmin
          .from("blog_posts")
          .update({ cta_click_count: (current?.cta_click_count || 0) + 1 })
          .eq("id", post.id);
      }

      return json({ counted: true, action });
    }

    const userId = await getUserId(req);
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ipAddress = forwardedFor || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ipHash = await sha256Hex(`${ipAddress}:${userAgent}`);
    const viewedAt = new Date().toISOString().slice(0, 10);

    const { error: insertError } = await supabaseAdmin
      .from("blog_view_events")
      .insert({
        post_id: post.id,
        ip_hash: ipHash,
        user_id: userId,
        viewed_at: viewedAt,
      });

    if (insertError?.code === "23505") {
      return json({ counted: false, action });
    }
    if (insertError) throw insertError;

    const { error: incrementError } = await supabaseAdmin.rpc("increment_blog_view", { post_id: post.id });
    if (incrementError) {
      const { data: current } = await supabaseAdmin
        .from("blog_posts")
        .select("view_count")
        .eq("id", post.id)
        .single();

      await supabaseAdmin
        .from("blog_posts")
        .update({ view_count: (current?.view_count || 0) + 1 })
        .eq("id", post.id);
    }

    return json({ counted: true, action });
  } catch (error) {
    console.error("track-blog-view failed:", error);
    return json({ error: "Failed to track blog event" }, 500);
  }
});
