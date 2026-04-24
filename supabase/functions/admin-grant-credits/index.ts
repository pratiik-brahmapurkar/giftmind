import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";
import { UNITS_PER_CREDIT } from "../_shared/credits.ts";

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

async function hasAdminAccess(userId: string) {
  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (userRow?.role === "admin" || userRow?.role === "superadmin") {
    return true;
  }

  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "superadmin"])
    .limit(1)
    .maybeSingle();

  return !!roleRow;
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
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!(await hasAdminAccess(user.id))) {
      return json({ error: "Forbidden" }, 403);
    }

    let body: {
      target_user_id?: string;
      amount?: number;
      reason?: string;
      notes?: string;
    };

    try {
      const parsedBody = await parseJsonBody<{
        target_user_id?: string;
        amount?: number;
        reason?: string;
        notes?: string;
      }>(req, json);
      if (parsedBody.response) {
        return parsedBody.response;
      }
      body = parsedBody.data ?? {};
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const targetUserId = sanitizeString(body.target_user_id?.trim() || "", 64);
    const amount = Number(body.amount);
    const reason = sanitizeString(body.reason?.trim() || "Manual", 100);
    const notes = sanitizeString(body.notes?.trim() || "", 500);

    if (!targetUserId) {
      return json({ error: "Missing required field: target_user_id" }, 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Amount must be a positive number" }, 400);
    }

    const units = Math.floor(amount * UNITS_PER_CREDIT);

    const { data: targetUser, error: targetUserError } = await supabaseAdmin
      .from("users")
      .select("id, credits_balance")
      .eq("id", targetUserId)
      .single();

    if (targetUserError || !targetUser) {
      return json({ error: "Target user not found" }, 404);
    }

    const newBalance = (targetUser.credits_balance ?? 0) + units;
    const expiresAt = new Date(
      Date.now() + 3650 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("credit_batches")
      .insert({
        user_id: targetUserId,
        package_name: "admin_grant",
        credits_purchased: units,
        credits_remaining: units,
        price_paid: 0,
        currency: "USD",
        payment_provider: "admin",
        expires_at: expiresAt,
        batch_type: "admin_grant",
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      console.error("Failed to create credit batch:", batchError?.message);
      return json({ error: "Failed to grant credits" }, 500);
    }

    const { error: txError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: targetUserId,
        batch_id: batch.id,
        type: "admin_grant",
        amount: units,
        payment_provider: "admin",
        metadata: {
          granted_by: user.id,
          reason,
          notes,
          balance_after: newBalance,
          credits_granted: amount,
        },
      });

    if (txError) {
      console.error("Failed to create credit transaction:", txError.message);
      return json({ error: "Failed to grant credits" }, 500);
    }

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ credits_balance: newBalance })
      .eq("id", targetUserId);

    if (updateError) {
      console.error("Failed to update user balance:", updateError.message);
      return json({ error: "Failed to grant credits" }, 500);
    }

    return json({
      success: true,
      credits_balance: newBalance,
    });
  } catch (err) {
    console.error("Unhandled error in admin-grant-credits:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
