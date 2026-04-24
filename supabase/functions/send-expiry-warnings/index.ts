import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatCreditUnits } from "../_shared/credits.ts";

// ── Environment ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// ── Supabase admin client ──────────────────────────────────────────────────────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ExpiringBatchRow = {
  id: string;
  user_id: string;
  credits_remaining: number;
  expires_at: string;
  warning_sent: boolean;
  users: {
    email: string | null;
    full_name: string | null;
  };
};

// TODO: Before production, change Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
// ── CORS + JSON helpers ────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

  // ── Cron secret guard (server-to-server only) ─────────────────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // ── 1. Find credit batches expiring within the next 3 days ───────────────
    const now = new Date();
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: expiringBatches, error: fetchError } = await supabaseAdmin
      .from("credit_batches")
      .select(`
        id, user_id, credits_remaining, expires_at, warning_sent,
        users!inner(email, full_name)
      `)
      .eq("is_expired", false)
      .eq("warning_sent", false)
      .gt("credits_remaining", 0)
      .lte("expires_at", threeDaysFromNow.toISOString())
      .gt("expires_at", now.toISOString());

    if (fetchError) {
      console.error("Failed to fetch expiring batches:", fetchError.message);
      return json({ error: "Failed to fetch expiring batches" }, 500);
    }

    // ── 2. Send warning email for each expiring batch ─────────────────────────
    let warningsSent = 0;

    for (const batch of (expiringBatches ?? []) as ExpiringBatchRow[]) {
      const user = batch.users;
      if (!user?.email) continue;

      const daysLeft = Math.max(
        1,
        Math.ceil(
          (new Date(batch.expires_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      const userName = user.full_name || "there";
      const creditsLabel = formatCreditUnits(batch.credits_remaining);
      const expiryDateFormatted = new Date(batch.expires_at).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" },
      );

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "GiftMind <noreply@giftmind.in>",
            to: [user.email],
            subject: `⏰ ${creditsLabel} GiftMind credit${creditsLabel === "1" ? "" : "s"} expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}!`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #6C5CE7;">Don't let your credits expire!</h2>
                <p>Hi ${userName},</p>
                <p>You have <strong>${creditsLabel} credit${creditsLabel === "1" ? "" : "s"}</strong>
                   expiring on <strong>${expiryDateFormatted}</strong>.</p>
                <p>Each credit is a chance to find the perfect gift with confidence.
                   Use them before they're gone!</p>
                <a href="https://giftmind.in/gift-flow"
                   style="display: inline-block; background: #6C5CE7; color: white;
                          padding: 12px 24px; border-radius: 8px; text-decoration: none;
                          font-weight: 600; margin: 16px 0;">
                  Use My Credits →
                </a>
                <p style="color: #888; font-size: 13px; margin-top: 24px;">
                  You're receiving this because you have active GiftMind credits.
                  <a href="https://giftmind.in/settings">Manage notification preferences</a>
                </p>
              </div>
            `,
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          throw new Error(`Resend API error: ${emailRes.status} — ${errText}`);
        }

        // Mark batch as warned so we don't re-send
        await supabaseAdmin
          .from("credit_batches")
          .update({ warning_sent: true })
          .eq("id", batch.id);

        warningsSent++;
      } catch (emailError) {
        // Non-fatal: log and continue with next batch
        console.error(
          `Failed to send expiry warning to ${user.email}:`,
          emailError,
        );
      }
    }

    // ── 3. Run daily credit expiry cleanup ────────────────────────────────────
    // Marks expired batches and recalculates user balances.
    const { error: rpcError } = await supabaseAdmin.rpc("run_credit_expiry");
    if (rpcError) {
      // Non-fatal — log but still report warnings sent
      console.error("run_credit_expiry RPC failed:", rpcError.message);
    }

    // ── 4. Return summary ─────────────────────────────────────────────────────
    console.log(
      `send-expiry-warnings: ${warningsSent} warnings sent, expiry cleanup ran.`,
    );
    return json({
      success: true,
      warnings_sent: warningsSent,
      expiry_cleanup_ran: !rpcError,
    });
  } catch (err) {
    console.error("Unhandled error in send-expiry-warnings:", err);
    return json({ error: "An unexpected error occurred." }, 500);
  }
});
