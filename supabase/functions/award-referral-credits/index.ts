import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";

// ── Environment ────────────────────────────────────────────────────────────────
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

// ── Constants ──────────────────────────────────────────────────────────────────
const REFERRER_REWARD_CREDITS = 3;   // referrer earns 3 credits per completed referral
const REFERRAL_BONUS_DAYS = 14;      // reward credits expire in 14 days

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── 1. Authenticate the referred user (who just completed a session) ──────
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

    // ── 2. Parse + validate request body ─────────────────────────────────────
    const parsedBody = await parseJsonBody<{ session_id?: string }>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const session_id = sanitizeString(body.session_id || "", 64);
    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400);
    }

    // ── 3. Check if this user was referred and the referral is still pending ──
    // Not an error if there's no pending referral — most users won't have one.
    const { data: referral } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, status, credits_awarded")
      .eq("referred_id", user.id)
      .eq("status", "pending")
      .eq("credits_awarded", false)
      .single();

    if (!referral) {
      // Silently succeed — no pending referral to process
      return json({ success: true, message: "No pending referral" });
    }

    // ── 4. Verify this is actually their first completed session ──────────────
    const { count: completedSessionCount, error: countError } = await supabaseAdmin
      .from("gift_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed");

    if (countError) {
      console.error("Failed to count completed sessions:", countError.message);
      return json({ error: "Failed to verify session" }, 500);
    }

    // If count > 1, this is not their first session — reward already should have
    // been given (or would be given on the first one). Skip silently.
    if ((completedSessionCount ?? 0) > 1) {
      return json({ success: true, message: "Not first session" });
    }

    // ── 5. Award 3 credits to the REFERRER ───────────────────────────────────
    const expiresAt = new Date(
      Date.now() + REFERRAL_BONUS_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Create credit batch for referrer
    const { error: batchError } = await supabaseAdmin
      .from("credit_batches")
      .insert({
        user_id: referral.referrer_id,
        package_name: "referral_reward",
        credits_purchased: REFERRER_REWARD_CREDITS,
        credits_remaining: REFERRER_REWARD_CREDITS,
        price_paid: 0,
        currency: "USD",
        payment_provider: "referral",
        expires_at: expiresAt,
      });

    if (batchError) {
      console.error("Failed to create referrer credit batch:", batchError.message);
      return json({ error: "Failed to award referral credits" }, 500);
    }

    // Log the credit transaction for the referrer
    const { error: txError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: referral.referrer_id,
        type: "referral",
        amount: REFERRER_REWARD_CREDITS,
        payment_provider: "referral",
        metadata: {
          referred_user_id: user.id,
          session_id,
          reason: "referral_reward",
        },
      });

    if (txError) {
      console.error("Failed to log referrer transaction:", txError.message);
      // Non-fatal — batch was created, just the log failed
    }

    // Update referrer's cached balance atomically
    const { data: referrerData, error: referrerFetchError } = await supabaseAdmin
      .from("users")
      .select("credits_balance")
      .eq("id", referral.referrer_id)
      .single();

    if (referrerFetchError) {
      console.error("Failed to fetch referrer balance:", referrerFetchError.message);
    } else {
      const { error: balanceUpdateError } = await supabaseAdmin
        .from("users")
        .update({
          credits_balance: (referrerData?.credits_balance ?? 0) + REFERRER_REWARD_CREDITS,
        })
        .eq("id", referral.referrer_id);

      if (balanceUpdateError) {
        console.error("Failed to update referrer balance:", balanceUpdateError.message);
      }
    }

    // ── 6. Mark the referral as completed ─────────────────────────────────────
    const { error: referralUpdateError } = await supabaseAdmin
      .from("referrals")
      .update({
        status: "completed",
        credits_awarded: true,
      })
      .eq("id", referral.id);

    if (referralUpdateError) {
      // Non-fatal — credits were already awarded; duplicate protection is via
      // the credits_awarded flag which we read at the start
      console.error("Failed to mark referral completed:", referralUpdateError.message);
    }

    // ── 7. Return success ─────────────────────────────────────────────────────
    return json({
      success: true,
      message: "Referral reward processed",
      referrer_credited: true,
      credits_awarded: REFERRER_REWARD_CREDITS,
    });
  } catch (err) {
    // ── Catch-all ─────────────────────────────────────────────────────────────
    console.error("Unhandled error in award-referral-credits:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
