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

type FeedbackReminderRow = {
  id: string;
  user_id: string;
  session_id: string;
  recipient_id: string | null;
  occasion: string;
  occasion_date: string | null;
  remind_at: string;
  status: string;
  gift_sessions: {
    selected_gift_name: string | null;
  } | null;
  recipients: {
    id: string;
    name: string | null;
  } | null;
  users: {
    email: string | null;
    full_name: string | null;
    notification_prefs: { feedback_reminders?: boolean } | null;
  } | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function feedbackAlreadyLoggedToday(sessionId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("reminder_logs")
    .select("id")
    .eq("kind", "feedback")
    .eq("session_id", sessionId)
    .eq("sent_day", today)
    .limit(1);

  if (error) {
    console.error("Failed to read feedback reminder logs:", error.message);
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function logFeedbackReminder(params: {
  userId: string;
  sessionId: string;
  recipientId: string | null;
  occasion: string;
}) {
  const { error } = await supabaseAdmin
    .from("reminder_logs")
    .insert({
      kind: "feedback",
      user_id: params.userId,
      session_id: params.sessionId,
      recipient_id: params.recipientId,
      date_label: params.occasion,
      date_value: params.sessionId,
      days_before: 0,
    });

  if (error) {
    console.error("Failed to insert feedback reminder log:", error.message);
  }
}

function extractOverallSignalMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const message = (payload as Record<string, unknown>).overall_message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

async function getLatestSignalMessage(sessionId: string, selectedGiftName: string | null) {
  if (!selectedGiftName) return null;

  const { data, error } = await supabaseAdmin
    .from("signal_checks")
    .select("result_payload")
    .eq("session_id", sessionId)
    .eq("gift_name", selectedGiftName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch signal check for feedback reminder:", error.message);
    return null;
  }

  return extractOverallSignalMessage(data?.result_payload);
}

async function sendFeedbackReminderEmail(reminder: FeedbackReminderRow, signalMessage: string | null) {
  const userName = reminder.users?.full_name?.split(" ")[0] || "there";
  const recipientName = reminder.recipients?.name || "them";
  const giftName = reminder.gift_sessions?.selected_gift_name || "your gift";
  const occasion = reminder.occasion.replace(/_/g, " ");
  const feedbackUrl = new URL("https://giftmind.in/gift-history");
  feedbackUrl.searchParams.set("session", reminder.session_id);
  feedbackUrl.searchParams.set("feedback", "true");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GiftMind <noreply@giftmind.in>",
      to: [reminder.users?.email],
      subject: `How did ${giftName} land for ${recipientName}'s ${occasion}? 🎁`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; color: #2C2A28; line-height: 1.6;">
          <div style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #946E32; margin-bottom: 20px;">
            GiftMind
          </div>
          <p style="margin: 0 0 12px;">Hey ${userName},</p>
          <p style="margin: 0 0 16px;">
            A few days ago you chose <strong>${giftName}</strong> for ${recipientName}'s ${occasion}.
            Now that the moment has passed, did it hit the mark?
          </p>
          <a href="${feedbackUrl.toString()}"
             style="display: inline-block; background: #946E32; color: white; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-bottom: 20px;">
            Share how it went →
          </a>
          ${
            signalMessage
              ? `
                <div style="border: 1px solid #EED9A4; background: linear-gradient(135deg, #FAF5E8 0%, #F5E9C9 100%); border-radius: 16px; padding: 18px; margin-bottom: 18px;">
                  <p style="margin: 0 0 8px; font-weight: 600; color: #6F5326;">Signal Check's read</p>
                  <p style="margin: 0; color: #433E39;">"${signalMessage}"</p>
                </div>
              `
              : ""
          }
          <p style="margin: 0; font-size: 14px; color: #5F5A54;">
            Open GiftMind to record the reaction and compare it with what Signal Check predicted.
          </p>
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
    const { data, error } = await supabaseAdmin
      .from("feedback_reminders")
      .select(`
        id,
        user_id,
        session_id,
        recipient_id,
        occasion,
        occasion_date,
        remind_at,
        status,
        gift_sessions(selected_gift_name),
        recipients(id, name),
        users(email, full_name, notification_prefs)
      `)
      .eq("status", "pending")
      .lte("remind_at", new Date().toISOString());

    if (error) {
      console.error("Failed to fetch feedback reminders:", error.message);
      return json({ error: "Failed to fetch feedback reminders" }, 500);
    }

    let sent = 0;
    let skipped = 0;

    for (const reminder of (data ?? []) as FeedbackReminderRow[]) {
      if (!reminder.users?.email) {
        skipped += 1;
        continue;
      }

      if (reminder.users.notification_prefs?.feedback_reminders === false) {
        skipped += 1;
        continue;
      }

      const { data: existingFeedback } = await supabaseAdmin
        .from("gift_feedback")
        .select("id")
        .eq("session_id", reminder.session_id)
        .maybeSingle();

      if (existingFeedback?.id) {
        await supabaseAdmin
          .from("feedback_reminders")
          .update({ status: "dismissed" })
          .eq("id", reminder.id);
        skipped += 1;
        continue;
      }

      if (await feedbackAlreadyLoggedToday(reminder.session_id)) {
        skipped += 1;
        continue;
      }

      try {
        const signalMessage = await getLatestSignalMessage(
          reminder.session_id,
          reminder.gift_sessions?.selected_gift_name ?? null,
        );
        await sendFeedbackReminderEmail(reminder, signalMessage);
        await supabaseAdmin
          .from("feedback_reminders")
          .update({ status: "sent" })
          .eq("id", reminder.id);
        await logFeedbackReminder({
          userId: reminder.user_id,
          sessionId: reminder.session_id,
          recipientId: reminder.recipient_id,
          occasion: reminder.occasion,
        });
        sent += 1;
        console.log("feedback_reminder_sent", {
          session_id: reminder.session_id,
          occasion: reminder.occasion,
        });
      } catch (sendError) {
        console.error("Failed to send feedback reminder:", {
          reminder_id: reminder.id,
          error: sendError,
        });
      }
    }

    return json({ success: true, reminders_sent: sent, reminders_skipped: skipped });
  } catch (error) {
    console.error("Unhandled error in send-feedback-reminders:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
