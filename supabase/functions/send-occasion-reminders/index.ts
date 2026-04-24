import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLANS_WITH_REMINDERS = new Set(["confident", "gifting-pro"]);
const REMINDER_WINDOWS = [14, 3, 1] as const;

type ReminderWindow = typeof REMINDER_WINDOWS[number];

type ReminderRecipientRow = {
  id: string;
  name: string;
  gift_count_cached: number | null;
  interests: string[] | null;
  important_dates: Array<{ label?: string; date?: string }> | null;
  user_id: string;
  users: {
    email: string | null;
    full_name: string | null;
    active_plan: string | null;
    notification_prefs: { reminders?: boolean } | null;
  };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getLabelEmoji(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("birthday")) return "🎂";
  if (normalized.includes("anniversary")) return "💍";
  if (normalized.includes("graduation")) return "🎓";
  if (normalized.includes("housewarming")) return "🏠";
  if (normalized.includes("work")) return "💼";
  return "📅";
}

function getOccasionSlug(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "birthday") return "birthday";
  if (normalized === "anniversary") return "anniversary";
  if (normalized === "graduation") return "graduation";
  if (normalized === "work anniversary") return "work_anniversary";
  if (normalized === "housewarming") return "housewarming";
  if (normalized === "valentine's day") return "valentines";
  if (normalized === "eid") return "eid";
  if (normalized === "diwali") return "diwali";
  if (normalized === "christmas") return "christmas";
  if (normalized === "hanukkah") return "hanukkah";

  return null;
}

function getTargetDate(daysBefore: ReminderWindow) {
  const target = new Date();
  target.setDate(target.getDate() + daysBefore);
  return {
    month: target.getMonth() + 1,
    day: target.getDate(),
  };
}

function getSubject(recipientName: string, occasion: string, daysUntil: ReminderWindow) {
  if (daysUntil === 14) {
    return `🎂 ${recipientName}'s ${occasion} is in 2 weeks — find the perfect gift`;
  }

  if (daysUntil === 3) {
    return `⏰ ${recipientName}'s ${occasion} is in 3 days! Don't wait.`;
  }

  return `🚨 Last chance — ${recipientName}'s ${occasion} is tomorrow`;
}

function getLeadText(daysUntil: ReminderWindow) {
  if (daysUntil === 14) return "is in 2 weeks";
  if (daysUntil === 3) return "is in 3 days";
  return "is tomorrow";
}

function buildGiftFlowUrl(recipientId: string, label: string, daysUntil: ReminderWindow) {
  const url = new URL("https://giftmind.in/gift-flow");
  url.searchParams.set("recipient", recipientId);

  const occasionSlug = getOccasionSlug(label);
  if (occasionSlug) {
    url.searchParams.set("occasion", occasionSlug);
  }

  url.searchParams.set("source", `reminder_${daysUntil}d`);
  return url.toString();
}

async function loadOccasionReminderEnabled() {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "feature_occasion_reminders")
    .maybeSingle();

  if (error) {
    console.error("Failed to load occasion reminder feature flag:", error.message);
    return true;
  }

  const value = data?.value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return true;
}

async function reminderAlreadySentToday(params: {
  recipientId: string;
  dateValue: string;
  daysBefore: ReminderWindow;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("reminder_logs")
    .select("id")
    .eq("kind", "occasion")
    .eq("recipient_id", params.recipientId)
    .eq("date_value", params.dateValue)
    .eq("days_before", params.daysBefore)
    .eq("sent_day", today)
    .limit(1);

  if (error) {
    console.error("Failed to read reminder_logs:", error.message);
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function logOccasionReminder(params: {
  userId: string;
  recipientId: string;
  dateLabel: string;
  dateValue: string;
  daysBefore: ReminderWindow;
}) {
  const { error } = await supabaseAdmin
    .from("reminder_logs")
    .insert({
      kind: "occasion",
      user_id: params.userId,
      recipient_id: params.recipientId,
      date_label: params.dateLabel,
      date_value: params.dateValue,
      days_before: params.daysBefore,
    });

  if (error) {
    console.error("Failed to insert reminder log:", error.message);
  }
}

async function sendReminderEmail(recipient: ReminderRecipientRow, dateEntry: { label: string; date: string }, daysUntil: ReminderWindow) {
  const userName = recipient.users.full_name?.split(" ")[0] || "there";
  const recipientName = recipient.name;
  const occasion = dateEntry.label;
  const leadText = getLeadText(daysUntil);
  const ctaUrl = buildGiftFlowUrl(recipient.id, occasion, daysUntil);
  const giftsInHistory = recipient.gift_count_cached ?? 0;
  const interestCount = recipient.interests?.length ?? 0;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GiftMind <noreply@giftmind.in>",
      to: [recipient.users.email],
      subject: getSubject(recipientName, occasion, daysUntil),
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; color: #2C2A28; line-height: 1.6;">
          <div style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #946E32; margin-bottom: 20px;">
            GiftMind
          </div>
          <p style="margin: 0 0 12px;">Hey ${userName},</p>
          <p style="margin: 0 0 18px;">
            ${getLabelEmoji(occasion)} <strong>${recipientName}'s ${occasion}</strong> ${leadText}.
          </p>
          <div style="border: 1px solid #EED9A4; background: linear-gradient(135deg, #FAF5E8 0%, #F5E9C9 100%); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px; font-weight: 600; color: #6F5326;">GiftMind remembers what you've gifted ${recipientName} before.</p>
            <p style="margin: 0 0 6px;">• ${giftsInHistory} gift${giftsInHistory === 1 ? "" : "s"} in history — AI will avoid repeats</p>
            <p style="margin: 0;">• ${interestCount} interest${interestCount === 1 ? "" : "s"} saved — recommendations get better over time</p>
          </div>
          <a href="${ctaUrl}"
             style="display: inline-block; background: #946E32; color: white; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-bottom: 24px;">
            🎁 Find a Gift for ${recipientName} →
          </a>
          <div style="border-top: 1px solid #E7E0D6; margin-top: 4px; padding-top: 18px; font-size: 14px; color: #5F5A54;">
            <p style="margin: 0 0 8px;"><strong>About your reminder:</strong></p>
            <p style="margin: 0 0 10px;">You saved ${recipientName}'s ${occasion} (every ${dateEntry.date}) in GiftMind.</p>
            <p style="margin: 0;">
              <a href="https://giftmind.in/settings#notifications" style="color: #946E32;">Manage reminders</a>
              &nbsp;·&nbsp;
              <a href="https://giftmind.in/settings#notifications" style="color: #946E32;">Unsubscribe from reminders</a>
            </p>
          </div>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${text}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cronSecret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const enabled = await loadOccasionReminderEnabled();
    if (!enabled) {
      return json({ success: true, skipped: true, reason: "feature_disabled" });
    }

    const { data, error } = await supabaseAdmin
      .from("recipients")
      .select(`
        id,
        name,
        gift_count_cached,
        interests,
        important_dates,
        user_id,
        users!inner(email, full_name, active_plan, notification_prefs)
      `)
      .not("important_dates", "is", null);

    if (error) {
      console.error("Failed to fetch recipients for reminders:", error.message);
      return json({ error: "Failed to fetch recipients" }, 500);
    }

    const targets = new Map<ReminderWindow, { month: number; day: number }>();
    for (const window of REMINDER_WINDOWS) {
      targets.set(window, getTargetDate(window));
    }

    let remindersSent = 0;
    let deduped = 0;

    for (const recipient of (data ?? []) as ReminderRecipientRow[]) {
      const user = recipient.users;
      if (!user?.email || !PLANS_WITH_REMINDERS.has(user.active_plan || "")) continue;
      if (user.notification_prefs && user.notification_prefs.reminders === false) continue;

      for (const entry of recipient.important_dates ?? []) {
        const label = typeof entry?.label === "string" && entry.label.trim() ? entry.label.trim() : "Special day";
        const dateValue = typeof entry?.date === "string" ? entry.date.trim() : "";
        const [month, day] = dateValue.split("-").map(Number);

        if (!month || !day) continue;

        for (const window of REMINDER_WINDOWS) {
          const target = targets.get(window);
          if (!target || month !== target.month || day !== target.day) continue;

          const alreadySent = await reminderAlreadySentToday({
            recipientId: recipient.id,
            dateValue,
            daysBefore: window,
          });

          if (alreadySent) {
            deduped += 1;
            console.log("occasion_reminder_deduped", {
              recipient_id: recipient.id,
              date_value: dateValue,
              days_before: window,
            });
            continue;
          }

          try {
            await sendReminderEmail(recipient, { label, date: dateValue }, window);
            await logOccasionReminder({
              userId: recipient.user_id,
              recipientId: recipient.id,
              dateLabel: label,
              dateValue,
              daysBefore: window,
            });
            remindersSent += 1;
            console.log("occasion_reminder_sent", {
              user_id: recipient.user_id,
              recipient_id: recipient.id,
              date_label: label,
              days_before: window,
            });
          } catch (sendError) {
            console.error("Failed to send occasion reminder:", {
              recipient_id: recipient.id,
              email: user.email,
              error: sendError,
            });
          }
        }
      }
    }

    return json({
      success: true,
      reminders_sent: remindersSent,
      reminders_deduped: deduped,
    });
  } catch (error) {
    console.error("Unhandled error in send-occasion-reminders:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
