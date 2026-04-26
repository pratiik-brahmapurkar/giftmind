import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

function cleanPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
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
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["viewer", "admin", "superadmin"]);

    if (roleError) {
      console.error("Failed to read actor role:", roleError.message);
      return json({ error: "Forbidden" }, 403);
    }

    const priority: Record<string, number> = { superadmin: 3, admin: 2, viewer: 1 };
    const actorRole = (roleRows || [])
      .map((row) => row.role as string)
      .sort((a, b) => (priority[b] || 0) - (priority[a] || 0))[0];

    if (!actorRole) {
      return json({ error: "Forbidden" }, 403);
    }

    const parsed = await parseJsonBody<{
      action?: string;
      targetType?: string;
      targetId?: string;
      targetLabel?: string;
      payload?: unknown;
    }>(req, json);

    if (parsed.response) {
      return parsed.response;
    }

    const body = parsed.data ?? {};
    const action = sanitizeString(body.action || "", 100);
    if (!action) {
      return json({ error: "Missing required field: action" }, 400);
    }

    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ipAddress = sanitizeString(forwardedFor || "", 80) || null;
    const userAgent = sanitizeString(req.headers.get("user-agent") || "", 500) || null;

    const { error: insertError } = await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: user.id,
      actor_email: user.email || "unknown",
      actor_role: actorRole,
      action,
      target_type: sanitizeString(body.targetType || "", 80) || null,
      target_id: sanitizeString(body.targetId || "", 120) || null,
      target_label: sanitizeString(body.targetLabel || "", 240) || null,
      payload: cleanPayload(body.payload),
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (insertError) {
      console.error("Failed to insert audit log:", insertError.message);
      return json({ error: "Failed to log admin action" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Unhandled error in log-admin-action:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
