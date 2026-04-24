import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

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

    const { data, error } = await supabaseAdmin.rpc("issue_free_monthly_credits", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("ensure-monthly-credits rpc failed:", error.message);
      return json({ error: "MONTHLY_CREDITS_FAILED", message: error.message }, 500);
    }

    console.log(JSON.stringify({
      event: data?.issued ? "monthly_credits_issued" : "monthly_credits_already_exist",
      user_id: user.id,
      credit_month: data?.credit_month ?? null,
      units: data?.units ?? 0,
      expires_at: data?.expires_at ?? null,
    }));

    return json({
      success: true,
      issued: Boolean(data?.issued),
      eligible: data?.eligible ?? true,
      units: data?.units ?? 0,
      batch_id: data?.batch_id ?? null,
      credit_month: data?.credit_month ?? null,
      expires_at: data?.expires_at ?? null,
      new_balance: data?.new_balance ?? null,
    });
  } catch (error) {
    console.error("ensure-monthly-credits error:", error);
    return json({ error: "INTERNAL_ERROR", message: String(error) }, 500);
  }
});
