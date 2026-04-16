import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody } from "../_shared/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// TODO: Before production, change Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userError || userRow?.role !== "superadmin") {
      return json({ error: "Forbidden" }, 403);
    }

    const parsed = await parseJsonBody<Record<string, never>>(req, json);
    if (parsed.response) return parsed.response;

    return json({
      anthropic: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
      google_ai: Boolean(Deno.env.get("GOOGLE_AI_API_KEY")),
      groq: Boolean(Deno.env.get("GROQ_API_KEY")),
      resend: Boolean(Deno.env.get("RESEND_API_KEY")),
      cron: Boolean(Deno.env.get("CRON_SECRET")),
      paypal: Boolean(
        Deno.env.get("PAYPAL_CLIENT_ID") &&
          (Deno.env.get("PAYPAL_CLIENT_SECRET") || Deno.env.get("PAYPAL_SECRET")),
      ),
      razorpay: Boolean(Deno.env.get("RAZORPAY_KEY_ID") || Deno.env.get("RAZORPAY_KEY_SECRET")),
      posthog: Boolean(Deno.env.get("POSTHOG_API_KEY")),
      sentry: Boolean(Deno.env.get("SENTRY_DSN")),
    });
  } catch (error) {
    console.error("Unhandled error in check-secrets:", error);
    return json({ error: "An unexpected error occurred." }, 500);
  }
});
