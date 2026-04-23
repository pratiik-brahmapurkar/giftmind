import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AFFILIATE_WEBHOOK_SECRET = Deno.env.get("AFFILIATE_WEBHOOK_SECRET") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!AFFILIATE_WEBHOOK_SECRET) {
    return json({ error: "Affiliate webhook secret is not configured" }, 500);
  }

  const secret = req.headers.get("x-affiliate-webhook-secret");
  if (secret !== AFFILIATE_WEBHOOK_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const network = String((payload as Record<string, unknown>).network ?? "").trim();
  const orderId = String((payload as Record<string, unknown>).order_id ?? "").trim();
  if (!network || !orderId) {
    return json({ error: "Missing required fields: network and order_id" }, 400);
  }

  const commissionValue = (payload as Record<string, unknown>).commission;
  const commission =
    typeof commissionValue === "number" && Number.isFinite(commissionValue)
      ? commissionValue
      : typeof commissionValue === "string" && commissionValue.trim()
        ? Number(commissionValue)
        : null;

  const record = {
    network,
    order_id: orderId,
    product_url: typeof (payload as Record<string, unknown>).product_url === "string"
      ? String((payload as Record<string, unknown>).product_url)
      : null,
    commission: Number.isFinite(commission as number) ? commission : null,
    currency: typeof (payload as Record<string, unknown>).currency === "string"
      ? String((payload as Record<string, unknown>).currency)
      : null,
    click_id: typeof (payload as Record<string, unknown>).click_id === "string"
      ? String((payload as Record<string, unknown>).click_id)
      : null,
    session_id: typeof (payload as Record<string, unknown>).session_id === "string"
      ? String((payload as Record<string, unknown>).session_id)
      : null,
    user_id: typeof (payload as Record<string, unknown>).user_id === "string"
      ? String((payload as Record<string, unknown>).user_id)
      : null,
    converted_at: typeof (payload as Record<string, unknown>).converted_at === "string"
      ? String((payload as Record<string, unknown>).converted_at)
      : new Date().toISOString(),
    reported_at: new Date().toISOString(),
    metadata: payload,
  };

  const { error } = await supabaseAdmin
    .from("affiliate_conversions")
    .upsert(record, { onConflict: "network,order_id" });

  if (error) {
    console.error("Failed to persist affiliate conversion", error);
    return json({ error: "Failed to persist webhook event" }, 500);
  }

  return json({ success: true });
});
