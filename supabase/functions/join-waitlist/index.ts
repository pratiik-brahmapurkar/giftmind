import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_SOURCES = new Set([
  "upgrade_modal",
  "plans_page",
  "soft_paywall",
  "feature_lock",
  "dashboard_nudge",
  "settings",
]);

const VALID_PRICE_FEEDBACK = new Set(["yes_599", "maybe_different_price", "no"]);

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

  if (authError || !user?.email) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    source?: string;
    price_feedback?: string;
    preferred_price?: number;
  };

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const source = VALID_SOURCES.has(body.source ?? "") ? body.source! : "upgrade_modal";
  const priceFeedback = VALID_PRICE_FEEDBACK.has(body.price_feedback ?? "")
    ? body.price_feedback
    : null;
  const preferredPrice =
    priceFeedback === "maybe_different_price" && Number.isFinite(Number(body.preferred_price))
      ? Number(body.preferred_price)
      : null;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("plan_waitlist")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("plan_slug", "pro")
    .maybeSingle();

  if (existingError) {
    console.error("Failed to read waitlist entry:", existingError.message);
    return json({ error: "Failed to join waitlist" }, 500);
  }

  let createdAt = existing?.created_at as string | undefined;
  let alreadyJoined = Boolean(existing);

  if (!existing) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("plan_waitlist")
      .insert({
        user_id: user.id,
        email: user.email,
        plan_slug: "pro",
        source,
        price_feedback: priceFeedback,
        preferred_price: preferredPrice,
      })
      .select("created_at")
      .single();

    if (insertError) {
      console.error("Failed to insert waitlist entry:", insertError.message);
      return json({ error: "Failed to join waitlist" }, 500);
    }

    createdAt = inserted.created_at;
    alreadyJoined = false;
  }

  const { count, error: countError } = await supabaseAdmin
    .from("plan_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("plan_slug", "pro")
    .lte("created_at", createdAt ?? new Date().toISOString());

  if (countError) {
    console.error("Failed to count waitlist position:", countError.message);
    return json({ error: "Failed to join waitlist" }, 500);
  }

  console.log(JSON.stringify({
    event: alreadyJoined ? "pro_waitlist_already_joined" : "pro_waitlist_joined",
    user_id: user.id,
    source,
    price_feedback: priceFeedback,
    position: count ?? 1,
  }));

  return json({
    success: true,
    position: count ?? 1,
    already_joined: alreadyJoined,
    email: user.email,
  });
});
