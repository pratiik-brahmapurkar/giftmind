import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function authenticateUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: json({ error: "Missing Authorization header" }, 401) };
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { response: json({ error: "Unauthorized" }, 401) };
  }

  return { user };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await authenticateUser(req);
    if (auth.response) {
      return auth.response;
    }

    const userId = auth.user!.id;
    const userEmail = auth.user!.email;

    const { data: userProfile, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !userProfile) {
      return json({ error: "User profile not found" }, 404);
    }

    const userPlan = userProfile.active_plan ?? "spark";
    if (userPlan !== "gifting-pro") {
      return json({ error: "Data export is available on Gifting Pro plan" }, 403);
    }

    const [
      legacyProfileRes,
      recipientsRes,
      sessionsRes,
      transactionsRes,
      batchesRes,
      feedbackRes,
      signalChecksRes,
      referralsRes,
      clicksRes,
      postsRes,
      mediaRes,
      rolesRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("recipients").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("gift_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("credit_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("credit_batches").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("gift_feedback").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("signal_checks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin
        .from("referrals")
        .select("*")
        .or(
          [
            `referrer_id.eq.${userId}`,
            `referred_id.eq.${userId}`,
            ...(userEmail ? [`referred_email.eq.${userEmail}`] : []),
          ].join(","),
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("product_clicks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("blog_posts").select("*").eq("author_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("blog_media").select("*").eq("uploaded_by", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("*").eq("user_id", userId),
    ]);

    const responses = [
      legacyProfileRes,
      recipientsRes,
      sessionsRes,
      transactionsRes,
      batchesRes,
      feedbackRes,
      signalChecksRes,
      referralsRes,
      clicksRes,
      postsRes,
      mediaRes,
      rolesRes,
    ];

    const failed = responses.find((result) => result.error);
    if (failed?.error) {
      console.error("Failed to export user data:", failed.error);
      return json({ error: "Failed to export user data" }, 500);
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      profile: userProfile,
      legacy_profile: legacyProfileRes.data,
      recipients: recipientsRes.data ?? [],
      gift_sessions: sessionsRes.data ?? [],
      credit_transactions: transactionsRes.data ?? [],
      credit_batches: batchesRes.data ?? [],
      gift_feedback: feedbackRes.data ?? [],
      signal_checks: signalChecksRes.data ?? [],
      referrals: referralsRes.data ?? [],
      product_clicks: clicksRes.data ?? [],
      blog_posts: postsRes.data ?? [],
      blog_media: mediaRes.data ?? [],
      user_roles: rolesRes.data ?? [],
    };

    return json(exportPayload);
  } catch (error) {
    console.error("Unhandled error in export-user-data:", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
