import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, validateEmail } from "../_shared/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

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

type TemplateName = "expiry_warning" | "reminder_14" | "reminder_3" | "welcome";

interface SendTestEmailRequest {
  template: TemplateName;
  to: string;
}

interface EmailSettings {
  site_name: string;
  support_email: string;
  email_from_name: string;
  email_from_email: string;
  email_reply_to: string;
  email_subject_expiry_warning: string;
  email_subject_reminder_14: string;
  email_subject_reminder_3: string;
  email_subject_welcome: string;
  free_credits: number;
}

function applyEmailSetting(settings: EmailSettings, key: string, value: unknown) {
  if (
    [
      "site_name",
      "support_email",
      "email_from_name",
      "email_from_email",
      "email_reply_to",
      "email_subject_expiry_warning",
      "email_subject_reminder_14",
      "email_subject_reminder_3",
      "email_subject_welcome",
    ].includes(key)
  ) {
    if (typeof value === "string") {
      settings[key as keyof Omit<EmailSettings, "free_credits">] = value;
    }
    return;
  }

  if (key === "free_credits" && typeof value === "number") {
    settings.free_credits = value;
  }
}

async function getSettings() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "site_name",
      "support_email",
      "email_from_name",
      "email_from_email",
      "email_reply_to",
      "email_subject_expiry_warning",
      "email_subject_reminder_14",
      "email_subject_reminder_3",
      "email_subject_welcome",
      "free_credits",
    ]);

  const settings: EmailSettings = {
    site_name: "GiftMind",
    support_email: "support@giftmind.in",
    email_from_name: "GiftMind",
    email_from_email: "noreply@giftmind.in",
    email_reply_to: "support@giftmind.in",
    email_subject_expiry_warning: "⏰ [X] credits expiring in [Y] days!",
    email_subject_reminder_14: "🎂 [Name]'s [Occasion] is in 2 weeks",
    email_subject_reminder_3: "⏰ [Name]'s [Occasion] is in 3 days!",
    email_subject_welcome: "Welcome to GiftMind! 🎁",
    free_credits: 3,
  };

  (data ?? []).forEach((row: { key: string; value: unknown }) => {
    applyEmailSetting(settings, row.key, row.value);
  });

  return settings;
}

function renderTemplate(template: TemplateName, settings: EmailSettings) {
  const siteName = settings.site_name;
  const supportEmail = settings.support_email;

  switch (template) {
    case "expiry_warning":
      return {
        subject: settings.email_subject_expiry_warning,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="color:#6C5CE7;">Your GiftMind credits are expiring soon</h2>
            <p>Hi Admin,</p>
            <p>This is a test of the expiry warning template.</p>
            <p>You have <strong>3 credits</strong> expiring in <strong>2 days</strong>.</p>
            <p style="font-size:13px; color:#6B7280;">Support: ${supportEmail}</p>
          </div>`,
      };
    case "reminder_14":
      return {
        subject: settings.email_subject_reminder_14,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="color:#6C5CE7;">Upcoming occasion reminder</h2>
            <p>Hi Admin,</p>
            <p>Aarav's birthday is in 2 weeks.</p>
            <p>${siteName} can help them choose a great gift early.</p>
          </div>`,
      };
    case "reminder_3":
      return {
        subject: settings.email_subject_reminder_3,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="color:#DC2626;">Last-minute reminder</h2>
            <p>Hi Admin,</p>
            <p>Aarav's birthday is in 3 days.</p>
            <p>Use ${siteName} to get region-aware recommendations fast.</p>
          </div>`,
      };
    case "welcome":
    default:
      return {
        subject: settings.email_subject_welcome,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="color:#6C5CE7;">Welcome to ${siteName}</h2>
            <p>Hi Admin,</p>
            <p>This is a test of the welcome email template.</p>
            <p>New users receive <strong>${settings.free_credits} free credits on Spark ✨ — no card needed</strong>.</p>
          </div>`,
      };
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .maybeSingle();

    if (roleError || !roleRow) {
      return json({ error: "Forbidden" }, 403);
    }

    const parsed = await parseJsonBody<SendTestEmailRequest>(req, json);
    if (parsed.response) return parsed.response;
    const body = parsed.data!;

    if (!body.template || !["expiry_warning", "reminder_14", "reminder_3", "welcome"].includes(body.template)) {
      return json({ error: "Invalid template" }, 400);
    }

    if (!validateEmail(body.to)) {
      return json({ error: "Invalid recipient email" }, 400);
    }

    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not configured" }, 500);
    }

    const settings = await getSettings();
    const rendered = renderTemplate(body.template, settings);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${settings.email_from_name} <${settings.email_from_email}>`,
        to: [body.to],
        reply_to: settings.email_reply_to,
        subject: rendered.subject,
        html: rendered.html,
      }),
    });

    if (!emailRes.ok) {
      const errorText = await emailRes.text();
      return json({ error: `Resend API error: ${errorText}` }, 502);
    }

    return json({ success: true, template: body.template, to: body.to });
  } catch (error) {
    console.error("Unhandled error in send-test-email:", error);
    return json({ error: "An unexpected error occurred." }, 500);
  }
});
