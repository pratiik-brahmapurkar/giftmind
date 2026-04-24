import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const sessionId = body.session_id;
    const amount = body.amount || 1;
    const actionId = typeof body.action_id === "string" ? body.action_id : undefined;
    const actionType = typeof body.action_type === "string" ? body.action_type : undefined;

    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: "session_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("deduct_user_credit", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_amount: amount,
      p_action_id: actionId,
      p_action_type: actionType,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "NO_CREDITS", message: error.message }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (data && data.success === false) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "NO_CREDITS",
          message: data.error,
          remaining: data.remaining_balance,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        remaining: data?.remaining_balance,
        deducted: data?.deducted ?? amount,
        action_id: data?.action_id ?? actionId ?? null,
        already_processed: Boolean(data?.already_processed),
        ledger_status: data?.ledger_status ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Deduct credit error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "INTERNAL_ERROR", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
