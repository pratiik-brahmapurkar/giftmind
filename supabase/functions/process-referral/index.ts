import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString, validateReferralCode } from "../_shared/validate.ts";

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

function getClientIdentifier(req: Request, userId: string) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfIp = req.headers.get("cf-connecting-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || cfIp;
  return ip ? `ip:${ip}` : `user:${userId}`;
}

// ── Referral signup bonus (credits on top of the trigger's default 3) ─────────
const SIGNUP_CREDIT_UNITS = 6;       // 3 credits
const REFERRAL_SIGNUP_BONUS_UNITS = 4; // 2 credits
const REFERRAL_BONUS_DAYS = 14;      // bonus credits expire in 14 days
const MAX_REFERRALS_PER_USER = 10;   // cap to prevent abuse

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── 1. Authenticate the new user (the one who just signed up) ────────────
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
    const parsedBody = await parseJsonBody<{ referral_code?: string }>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }
    const body = parsedBody.data!;

    const rawReferralCode = (body.referral_code || "").trim();
    if (!rawReferralCode) {
      return json({ error: "Missing required field: referral_code" }, 400);
    }
    if (!validateReferralCode(rawReferralCode)) {
      return json({ error: "Invalid referral code" }, 400);
    }
    const referralCode = sanitizeString(rawReferralCode, 12);

    const identifier = getClientIdentifier(req, user.id);
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const { count: rateLimitCount, error: rateLimitError } = await supabaseAdmin
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("action", "process-referral")
      .eq("identifier", identifier)
      .gte("created_at", oneHourAgo);

    if (rateLimitError) {
      console.error("Failed to enforce referral rate limit:", rateLimitError.message);
      return json({ error: "Failed to validate request rate" }, 500);
    }

    if ((rateLimitCount ?? 0) >= 3) {
      return json(
        { error: "RATE_LIMITED", message: "Too many requests. Please wait." },
        429,
      );
    }

    const { error: rateLimitInsertError } = await supabaseAdmin
      .from("rate_limit_events")
      .insert({
        action: "process-referral",
        identifier,
        metadata: {
          referred_id: user.id,
          referral_code: referralCode,
        },
      });

    if (rateLimitInsertError) {
      console.error("Failed to record referral rate limit event:", rateLimitInsertError.message);
      return json({ error: "Failed to validate request rate" }, 500);
    }

    // ── 3. Find the referrer by their referral code ───────────────────────────
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from("users")
      .select("id, email, referral_code")
      .eq("referral_code", referralCode)
      .single();

    if (referrerError || !referrer) {
      return json(
        { error: "INVALID_CODE", message: "Referral code not found" },
        404,
      );
    }

    // ── 4. Prevent self-referral ──────────────────────────────────────────────
    if (referrer.id === user.id) {
      return json(
        { error: "SELF_REFERRAL", message: "Cannot refer yourself" },
        400,
      );
    }

    // ── 5. Check max referrals cap ────────────────────────────────────────────
    const { count: referralCount, error: countError } = await supabaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", referrer.id);

    if (countError) {
      console.error("Failed to count referrals:", countError.message);
      return json({ error: "Failed to validate referral" }, 500);
    }

    if ((referralCount ?? 0) >= MAX_REFERRALS_PER_USER) {
      return json(
        {
          error: "MAX_REFERRALS",
          message: "Referrer has reached maximum referrals",
        },
        400,
      );
    }

    // ── 6. Check for duplicate referral (same referred user) ─────────────────
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", user.id)
      .single();

    if (existing) {
      return json(
        {
          error: "ALREADY_REFERRED",
          message: "This account has already been referred",
        },
        400,
      );
    }

    // ── 7. Create the referral record ─────────────────────────────────────────
    const { error: insertError } = await supabaseAdmin
      .from("referrals")
      .insert({
        referrer_id: referrer.id,
        referred_id: user.id,
        referral_code: referralCode,
        status: "pending",       // becomes 'completed' after first gift session
        credits_awarded: false,
      });

    if (insertError) {
      console.error("Failed to create referral record:", insertError.message);
      return json({ error: "Failed to process referral" }, 500);
    }

    // ── 8. Award bonus credits to the new user ────────────────────────────────
    // The signup DB trigger already gives 3 credits.
    // We add 2 more to make it 5 total.
    const expiresAt = new Date(
      Date.now() + REFERRAL_BONUS_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Create a bonus credit batch
    const { error: batchError } = await supabaseAdmin
      .from("credit_batches")
      .insert({
        user_id: user.id,
        package_name: "referral_signup_bonus",
        credits_purchased: REFERRAL_SIGNUP_BONUS_UNITS,
        credits_remaining: REFERRAL_SIGNUP_BONUS_UNITS,
        price_paid: 0,
        currency: "USD",
        payment_provider: "referral",
        expires_at: expiresAt,
        batch_type: "referral_bonus",
      });

    if (batchError) {
      // Non-fatal: log but don't fail — referral record exists, can reconcile later
      console.error("Failed to create credit batch:", batchError.message);
    }

    // Log the credit transaction
    const { error: txError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        type: "referral",
        amount: REFERRAL_SIGNUP_BONUS_UNITS,
        payment_provider: "referral",
        metadata: {
          referrer_id: referrer.id,
          reason: "signup_bonus",
          referral_code: referralCode,
        },
      });

    if (txError) {
      console.error("Failed to log credit transaction:", txError.message);
    }

    // Update the user's referred_by and bump their cached balance to 5
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        credits_balance: SIGNUP_CREDIT_UNITS + REFERRAL_SIGNUP_BONUS_UNITS,
        referred_by: referrer.id,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update user credits:", updateError.message);
    }

    // ── 9. Return success ─────────────────────────────────────────────────────
    const referrerName = referrer.email?.split("@")[0] ?? "a friend";

    return json({
      success: true,
      message: "Referral processed! You received 2 bonus credits.",
      total_credits: 5,
      referrer_name: referrerName,
    });
  } catch (err) {
    // ── Catch-all ─────────────────────────────────────────────────────────────
    console.error("Unhandled error in process-referral:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
