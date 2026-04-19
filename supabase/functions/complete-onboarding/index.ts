import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

type OnboardingProfile = {
  credits_balance: number | null;
  onboarding_bonus_granted: boolean | null;
  onboarding_state: Record<string, unknown> | null;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("credits_balance, onboarding_bonus_granted, onboarding_state")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return json({ error: "USER_NOT_FOUND" }, 404);
  }

  const typedProfile = profile as OnboardingProfile;
  const bonusEnabled = Deno.env.get("ONBOARDING_BONUS_ENABLED") === "true";
  const now = new Date().toISOString();
  const currentState = typedProfile.onboarding_state ?? {};
  let creditsGranted = 0;

  if (bonusEnabled && !typedProfile.onboarding_bonus_granted) {
    const bonus = 3;
    const { error: txError } = await supabaseAdmin.from("credit_transactions").insert({
      user_id: user.id,
      type: "onboarding_bonus",
      amount: bonus,
      description: "Onboarding completion bonus",
    });

    if (txError) {
      console.error("Failed to insert onboarding bonus transaction:", txError.message);
      return json({ error: "INTERNAL_ERROR" }, 500);
    }

    creditsGranted = bonus;
  }

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      credits_balance: (typedProfile.credits_balance ?? 0) + creditsGranted,
      onboarding_bonus_granted: typedProfile.onboarding_bonus_granted || bonusEnabled ? true : false,
      has_completed_onboarding: true,
      onboarding_state: {
        ...currentState,
        status: "completed",
        completed_at: now,
      },
      updated_at: now,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to update onboarding completion:", updateError.message);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }

  return json({
    success: true,
    credits_granted: creditsGranted,
    new_balance: (typedProfile.credits_balance ?? 0) + creditsGranted,
    onboarding_status: "completed",
  });
});
