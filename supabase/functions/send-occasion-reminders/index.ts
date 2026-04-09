import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// ── Supabase admin client ──────────────────────────────────────────────────────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// TODO: Before production, change Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
// ── CORS helpers ───────────────────────────────────────────────────────────────
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

// ── Plan gate: only popular and pro get occasion reminders ────────────────────
const PLANS_WITH_REMINDERS = new Set(["popular", "pro"]);

// ── Send a single reminder email via Resend ───────────────────────────────────
async function sendReminderEmail(
  recipient: {
    id: string;
    name: string;
    users: { email: string; full_name: string | null };
  },
  dateEntry: { label?: string; date: string },
  daysUntil: number,
): Promise<void> {
  const userName = recipient.users.full_name || "there";
  const recipientName = recipient.name;
  const occasion = dateEntry.label || "special day";
  const urgencyText = daysUntil === 14 ? "is in 2 weeks" : "is in just 3 days!";

  const subject =
    daysUntil === 14
      ? `🎂 ${recipientName}'s ${occasion} ${urgencyText}`
      : `⏰ ${recipientName}'s ${occasion} ${urgencyText}`;

  const bodyText =
    daysUntil === 14
      ? `${recipientName}'s ${occasion} is coming up on ${dateEntry.date}. Start planning the perfect gift now — your GiftMind session takes just 60 seconds.`
      : `${recipientName}'s ${occasion} is almost here! Don't miss the chance to find something they'll love.`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GiftMind <noreply@giftmind.in>",
      to: [recipient.users.email],
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #6C5CE7;">
            ${daysUntil === 3 ? "⏰" : "🎂"} ${recipientName}'s ${occasion} ${urgencyText}
          </h2>
          <p>Hi ${userName},</p>
          <p>${bodyText}</p>
          <a href="https://giftmind.in/gift-flow?recipient=${encodeURIComponent(recipient.id)}"
             style="display: inline-block; background: #6C5CE7; color: white;
                    padding: 12px 24px; border-radius: 8px; text-decoration: none;
                    font-weight: 600; margin: 16px 0;">
            Find a Gift for ${recipientName} →
          </a>
          <p style="color: #888; font-size: 13px; margin-top: 24px;">
            You saved ${recipientName}'s ${occasion} in GiftMind.
            <a href="https://giftmind.in/settings">Manage reminders</a>
          </p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    throw new Error(`Resend API error: ${emailRes.status} — ${errText}`);
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Cron secret guard ─────────────────────────────────────────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // ── 1. Calculate target dates ─────────────────────────────────────────────
    const today = new Date();

    const fourteenDaysTarget = new Date(today);
    fourteenDaysTarget.setDate(fourteenDaysTarget.getDate() + 14);
    const fourteenMonth = fourteenDaysTarget.getMonth() + 1; // 1-12
    const fourteenDay = fourteenDaysTarget.getDate();

    const threeDaysTarget = new Date(today);
    threeDaysTarget.setDate(threeDaysTarget.getDate() + 3);
    const threeMonth = threeDaysTarget.getMonth() + 1;
    const threeDay = threeDaysTarget.getDate();

    // ── 2. Fetch recipients with important_dates ───────────────────────────────
    const { data: recipients, error: fetchError } = await supabaseAdmin
      .from("recipients")
      .select(`
        id, name, important_dates, user_id,
        users!inner(email, full_name, active_plan, notification_prefs)
      `)
      .not("important_dates", "is", null);

    if (fetchError) {
      console.error("Failed to fetch recipients:", fetchError.message);
      return json({ error: "Failed to fetch recipients" }, 500);
    }

    // ── 3. Process each recipient ─────────────────────────────────────────────
    let remindersSent = 0;

    for (const recipient of recipients ?? []) {
      const user = (recipient as any).users;
      if (!user?.email) continue;

      // Plan gate: free and starter don't get reminders
      if (!PLANS_WITH_REMINDERS.has(user.active_plan)) continue;

      // Respect user notification preferences
      const notifPrefs = user.notification_prefs;
      if (notifPrefs && notifPrefs.reminders === false) continue;

      const dates: Array<{ label?: string; date?: string; recurring?: boolean }> =
        recipient.important_dates ?? [];

      for (const dateEntry of dates) {
        if (!dateEntry?.date) continue;

        // Parse "MM-DD" format
        const parts = dateEntry.date.split("-").map(Number);
        if (parts.length < 2) continue;
        const [month, day] = parts;
        if (!month || !day) continue;

        try {
          // ── 14-day reminder ───────────────────────────────────────────────
          if (month === fourteenMonth && day === fourteenDay) {
            await sendReminderEmail(
              {
                id: recipient.id,
                name: recipient.name,
                users: { email: user.email, full_name: user.full_name },
              },
              { label: dateEntry.label, date: dateEntry.date },
              14,
            );
            remindersSent++;
            console.log(
              `Sent 14-day reminder for ${recipient.name}'s ${dateEntry.label ?? "date"} to ${user.email}`,
            );
          }

          // ── 3-day reminder ────────────────────────────────────────────────
          if (month === threeMonth && day === threeDay) {
            await sendReminderEmail(
              {
                id: recipient.id,
                name: recipient.name,
                users: { email: user.email, full_name: user.full_name },
              },
              { label: dateEntry.label, date: dateEntry.date },
              3,
            );
            remindersSent++;
            console.log(
              `Sent 3-day reminder for ${recipient.name}'s ${dateEntry.label ?? "date"} to ${user.email}`,
            );
          }
        } catch (emailError) {
          // Non-fatal: log and continue
          console.error(
            `Failed to send reminder to ${user.email} for ${recipient.name}:`,
            emailError,
          );
        }
      }
    }

    // ── 4. Return summary ─────────────────────────────────────────────────────
    console.log(`send-occasion-reminders: ${remindersSent} reminders sent.`);
    return json({
      success: true,
      reminders_sent: remindersSent,
    });
  } catch (err) {
    console.error("Unhandled error in send-occasion-reminders:", err);
    return json({ error: "An unexpected error occurred." }, 500);
  }
});
