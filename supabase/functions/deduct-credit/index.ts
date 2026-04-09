import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";

// ── Environment ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Service-role client (bypasses RLS) ────────────────────────────────────────
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

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── 2. Parse + validate request body ──────────────────────────────────────
    const parsedBody = await parseJsonBody<{ session_id?: string; amount?: number }>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const session_id = sanitizeString(body.session_id || "", 64);
    const amount = body.amount ?? 1;

    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400);
    }

    if (typeof amount !== "number" || amount <= 0 || amount > 10) {
      return json({ error: "Invalid amount — must be a positive number ≤ 10" }, 400);
    }

    // ── 3. Call the database RPC (atomic, locked against race conditions) ──────
    const { data, error: rpcError } = await supabaseAdmin.rpc("deduct_user_credit", {
      p_user_id: user.id,
      p_session_id: session_id,
      p_amount: amount,
    });

    if (rpcError) {
      console.error("RPC error:", rpcError.message);
      return json({ error: "Failed to process credit deduction" }, 500);
    }

    // ── 4. Interpret the RPC result ────────────────────────────────────────────
    // The DB function returns: { success, deducted, remaining_balance } or { success: false, error, remaining_balance }
    if (!data?.success) {
      return json(
        {
          error: "NO_CREDITS",
          message: data?.error || "Insufficient credits",
          remaining: data?.remaining_balance ?? 0,
        },
        402,
      );
    }

    return json({
      success: true,
      deducted: data.deducted,
      remaining: data.remaining_balance,
    });
  } catch (err) {
    console.error("Unhandled error in deduct-credit:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
