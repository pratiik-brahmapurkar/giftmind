import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";
import { UNITS_PER_CREDIT } from "../_shared/credits.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_CLIENT_SECRET =
  Deno.env.get("PAYPAL_CLIENT_SECRET") ?? Deno.env.get("PAYPAL_SECRET") ?? "";
const PAYPAL_ENV = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
const PAYPAL_API_BASE =
  Deno.env.get("PAYPAL_API_BASE") ??
  (PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CheckoutBody = {
  action?: "create_order" | "capture_order";
  package_id?: string;
  currency?: string;
  order_id?: string;
};

type CreditPackage = {
  id: string;
  slug: string | null;
  name: string;
  credits: number;
  validity_days: number;
  price_usd: number | null;
  is_active: boolean | null;
};

type CreditBatch = {
  id: string;
  user_id: string;
  package_name: string;
  credits_purchased: number;
  credits_remaining: number;
  expires_at: string;
  price_paid: number | null;
  currency: string | null;
  payment_id: string | null;
  payment_provider: string | null;
};

type PayPalAmount = {
  currency_code?: string;
  value?: string;
};

type PayPalPurchaseUnit = {
  reference_id?: string;
  custom_id?: string;
  description?: string;
  amount?: PayPalAmount;
  payments?: {
    captures?: Array<{
      id?: string;
      status?: string;
      amount?: PayPalAmount;
    }>;
  };
};

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: PayPalPurchaseUnit[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatUsdAmount(value: number) {
  return value.toFixed(2);
}

function normalizePlanSlug(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

function pickHigherPlan(current?: string | null, purchased?: string | null) {
  const rank: Record<string, number> = {
    spark: 0,
    thoughtful: 1,
    confident: 2,
    "gifting-pro": 3,
  };
  const currentPlan = normalizePlanSlug(current || "spark");
  const purchasedPlan = normalizePlanSlug(purchased);

  if (!(purchasedPlan in rank)) return currentPlan in rank ? currentPlan : "spark";
  if (!(currentPlan in rank)) return purchasedPlan;
  return rank[purchasedPlan] > rank[currentPlan] ? purchasedPlan : currentPlan;
}

async function paypalRequest<T>(
  path: string,
  options: RequestInit,
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal API error ${response.status}: ${details}`);
  }

  return (await response.json()) as T;
}

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }

  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal auth failed ${response.status}: ${details}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("PayPal auth did not return an access token");
  }

  return payload.access_token;
}

async function getAuthenticatedUser(req: Request) {
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

async function getCreditPackage(packageId: string) {
  const { data, error } = await supabaseAdmin
    .from("credit_packages")
    .select("id, slug, name, credits, validity_days, price_usd, is_active")
    .eq("id", packageId)
    .single();

  if (error || !data || !data.is_active) {
    throw new Error("Credit package is unavailable");
  }

  const creditPackage = data as CreditPackage;
  const priceUsd = Number(creditPackage.price_usd ?? 0);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error("Credit package does not have a valid USD price");
  }

  return { creditPackage, priceUsd };
}

async function recalculateUserBalance(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("credit_batches")
    .select("credits_remaining")
    .eq("user_id", userId)
    .eq("is_expired", false)
    .gt("credits_remaining", 0)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(`Failed to recalculate balance: ${error.message}`);
  }

  return (data ?? []).reduce((sum, batch) => sum + Number(batch.credits_remaining ?? 0), 0);
}

async function ensurePurchaseTransaction(batch: CreditBatch, paypalCaptureId?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("batch_id", batch.id)
    .eq("type", "purchase")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const { error } = await supabaseAdmin.from("credit_transactions").insert({
    user_id: batch.user_id,
    batch_id: batch.id,
    type: "purchase",
    amount: batch.credits_purchased,
    payment_id: batch.payment_id,
    payment_provider: "paypal",
    metadata: {
      package_name: batch.package_name,
      price_paid: batch.price_paid,
      currency: batch.currency,
      paypal_order_id: batch.payment_id,
      paypal_capture_id: paypalCaptureId ?? null,
      batch_expires_at: batch.expires_at,
    },
  });

  if (error) {
    throw new Error(`Failed to record purchase transaction: ${error.message}`);
  }
}

async function finalizeCredits(params: {
  userId: string;
  orderId: string;
  creditPackage: CreditPackage;
  priceUsd: number;
  paypalCaptureId?: string | null;
}) {
  const { data: existingBatch } = await supabaseAdmin
    .from("credit_batches")
    .select("*")
    .eq("payment_provider", "paypal")
    .eq("payment_id", params.orderId)
    .maybeSingle();

  let batch = existingBatch as CreditBatch | null;

  if (!batch) {
    const expiresAt = new Date(
      Date.now() + params.creditPackage.validity_days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const packageName =
      normalizePlanSlug(params.creditPackage.slug) || normalizePlanSlug(params.creditPackage.name);

    const { data, error } = await supabaseAdmin
      .from("credit_batches")
      .insert({
        user_id: params.userId,
        package_name: packageName,
        credits_purchased: params.creditPackage.credits * UNITS_PER_CREDIT,
        credits_remaining: params.creditPackage.credits * UNITS_PER_CREDIT,
        price_paid: params.priceUsd,
        currency: "USD",
        payment_provider: "paypal",
        payment_id: params.orderId,
        purchased_at: new Date().toISOString(),
        expires_at: expiresAt,
        batch_type: "paid",
      })
      .select("*")
      .single();

    if (error) {
      const { data: duplicateBatch } = await supabaseAdmin
        .from("credit_batches")
        .select("*")
        .eq("payment_provider", "paypal")
        .eq("payment_id", params.orderId)
        .maybeSingle();

      if (!duplicateBatch) {
        throw new Error(`Failed to create credit batch: ${error.message}`);
      }

      batch = duplicateBatch as CreditBatch;
    } else {
      batch = data as CreditBatch;
    }
  }

  if (batch.user_id !== params.userId) {
    throw new Error("PayPal order has already been processed for another account");
  }

  await ensurePurchaseTransaction(batch, params.paypalCaptureId);

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("active_plan")
    .eq("id", params.userId)
    .single();

  const balance = await recalculateUserBalance(params.userId);
  const nextPlan = pickHigherPlan(userRow?.active_plan, batch.package_name);

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      credits_balance: balance,
      active_plan: nextPlan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.userId);

  if (updateError) {
    throw new Error(`Failed to update user credits: ${updateError.message}`);
  }

  return {
    batch,
    credits_balance: balance,
    active_plan: nextPlan,
  };
}

async function createOrder(body: CheckoutBody, userId: string) {
  const packageId = sanitizeString(body.package_id ?? "", 80);
  const currency = sanitizeString(body.currency ?? "USD", 8).toUpperCase();

  if (!packageId) {
    return json({ error: "Missing package_id" }, 400);
  }

  if (currency !== "USD") {
    return json({ error: "PayPal checkout is currently available for USD packages only" }, 400);
  }

  const { creditPackage, priceUsd } = await getCreditPackage(packageId);
  const accessToken = await getPayPalAccessToken();

  const order = await paypalRequest<{ id?: string; status?: string }>(
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: creditPackage.id,
            custom_id: userId,
            description: `GiftMind ${creditPackage.name} credits`,
            amount: {
              currency_code: "USD",
              value: formatUsdAmount(priceUsd),
            },
          },
        ],
      }),
    },
    accessToken,
  );

  if (!order.id) {
    return json({ error: "PayPal did not return an order id" }, 502);
  }

  return json({
    order_id: order.id,
    status: order.status,
  });
}

function getOrderPurchaseUnit(order: PayPalOrder) {
  return Array.isArray(order?.purchase_units) ? order.purchase_units[0] : null;
}

function getCaptureId(capture: PayPalOrder) {
  return capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}

async function captureOrder(body: CheckoutBody, userId: string) {
  const orderId = sanitizeString(body.order_id ?? "", 80);
  if (!orderId) {
    return json({ error: "Missing order_id" }, 400);
  }

  const { data: existingBatch } = await supabaseAdmin
    .from("credit_batches")
    .select("*")
    .eq("payment_provider", "paypal")
    .eq("payment_id", orderId)
    .maybeSingle();

  if (existingBatch) {
    const batch = existingBatch as CreditBatch;
    if (batch.user_id !== userId) {
      return json({ error: "PayPal order has already been processed for another account" }, 403);
    }

    await ensurePurchaseTransaction(batch);

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("active_plan")
      .eq("id", userId)
      .single();

    const balance = await recalculateUserBalance(userId);
    const nextPlan = pickHigherPlan(userRow?.active_plan, batch.package_name);

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        credits_balance: balance,
        active_plan: nextPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      throw new Error(`Failed to update user credits: ${updateError.message}`);
    }

    return json({
      success: true,
      already_processed: true,
      credits_added: batch.credits_purchased,
      credits_balance: balance,
      active_plan: nextPlan,
    });
  }

  const accessToken = await getPayPalAccessToken();
  const order = await paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" },
    accessToken,
  );

  const purchaseUnit = getOrderPurchaseUnit(order);
  const packageId = sanitizeString(purchaseUnit?.reference_id ?? "", 80);

  if (!purchaseUnit || purchaseUnit.custom_id !== userId) {
    return json({ error: "PayPal order does not belong to this account" }, 403);
  }

  const { creditPackage, priceUsd } = await getCreditPackage(packageId);
  const amount = purchaseUnit.amount;

  if (
    amount?.currency_code !== "USD" ||
    Number(amount?.value) !== Number(formatUsdAmount(priceUsd))
  ) {
    return json({ error: "PayPal order amount does not match the selected package" }, 400);
  }

  if (!["APPROVED", "COMPLETED"].includes(order.status)) {
    return json({ error: "PayPal order has not been approved" }, 400);
  }

  let capturePayload: PayPalOrder = order;
  if (order.status !== "COMPLETED") {
    capturePayload = await paypalRequest<PayPalOrder>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: "{}" },
      accessToken,
    );
  }

  if (capturePayload.status !== "COMPLETED") {
    return json({ error: "PayPal capture was not completed" }, 402);
  }

  const finalized = await finalizeCredits({
    userId,
    orderId,
    creditPackage,
    priceUsd,
    paypalCaptureId: getCaptureId(capturePayload),
  });

  return json({
    success: true,
    credits_added: creditPackage.credits,
    credits_balance: finalized.credits_balance,
    active_plan: finalized.active_plan,
    batch_id: finalized.batch.id,
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (auth.response) return auth.response;

    const parsed = await parseJsonBody<CheckoutBody>(req, json);
    if (parsed.response) return parsed.response;

    const body = parsed.data ?? {};
    if (body.action === "create_order") {
      return await createOrder(body, auth.user.id);
    }

    if (body.action === "capture_order") {
      return await captureOrder(body, auth.user.id);
    }

    return json({ error: "Invalid checkout action" }, 400);
  } catch (error) {
    console.error("Unhandled error in paypal-checkout:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      500,
    );
  }
});
