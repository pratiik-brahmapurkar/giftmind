import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody } from "../_shared/validate.ts";

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

async function attemptDelete(
  label: string,
  run: () => Promise<{ error: { message?: string } | null }>,
  deletedTables: string[],
  failures: { step: string; message: string }[],
  options?: { critical?: boolean },
) {
  try {
    const { error } = await run();
    if (error) {
      console.error(`Failed to delete ${label}:`, error);
      failures.push({ step: label, message: error.message ?? "Unknown error" });
      return { ok: false, critical: !!options?.critical };
    }

    deletedTables.push(label);
    return { ok: true, critical: false };
  } catch (error) {
    console.error(`Failed to delete ${label}:`, error);
    failures.push({
      step: label,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { ok: false, critical: !!options?.critical };
  }
}

async function cleanupAvatars(userId: string, failures: { step: string; message: string }[]) {
  try {
    const { data: avatarFiles, error: listError } = await supabaseAdmin.storage
      .from("avatars")
      .list(userId);

    if (listError) {
      throw listError;
    }

    if (!avatarFiles?.length) {
      return false;
    }

    const paths = avatarFiles.map((file) => `${userId}/${file.name}`);
    const { error: removeError } = await supabaseAdmin.storage
      .from("avatars")
      .remove(paths);

    if (removeError) {
      throw removeError;
    }

    return true;
  } catch (error) {
    console.error("Avatar cleanup failed:", error);
    failures.push({
      step: "storage.avatars",
      message: error instanceof Error ? error.message : "Avatar cleanup failed",
    });
    return false;
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
    const auth = await authenticateUser(req);
    if (auth.response) {
      return auth.response;
    }

    const parsedBody = await parseJsonBody<{ confirmation?: string }>(req, json);
    if (parsedBody.response) {
      return parsedBody.response;
    }

    if (parsedBody.data?.confirmation !== "DELETE") {
      return json({ error: 'Invalid confirmation. Type "DELETE" to confirm.' }, 400);
    }

    const userId = auth.user!.id;
    const userEmail = auth.user!.email;
    const deletedTables: string[] = [];
    const failures: { step: string; message: string }[] = [];

    await attemptDelete(
      "signal_checks",
      () => supabaseAdmin.from("signal_checks").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "gift_feedback",
      () => supabaseAdmin.from("gift_feedback").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "product_clicks",
      () => supabaseAdmin.from("product_clicks").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "gift_sessions",
      () => supabaseAdmin.from("gift_sessions").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "credit_transactions",
      () => supabaseAdmin.from("credit_transactions").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "credit_batches",
      () => supabaseAdmin.from("credit_batches").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "referrals",
      () => {
        const filters = [`referrer_id.eq.${userId}`, `referred_id.eq.${userId}`];
        if (userEmail) {
          filters.push(`referred_email.eq.${userEmail}`);
        }
        return supabaseAdmin.from("referrals").delete().or(filters.join(","));
      },
      deletedTables,
      failures,
    );

    await attemptDelete(
      "recipients",
      () => supabaseAdmin.from("recipients").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "blog_posts",
      () => supabaseAdmin.from("blog_posts").delete().eq("author_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "blog_media",
      () => supabaseAdmin.from("blog_media").delete().eq("uploaded_by", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "profiles",
      () => supabaseAdmin.from("profiles").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "user_roles",
      () => supabaseAdmin.from("user_roles").delete().eq("user_id", userId),
      deletedTables,
      failures,
    );

    await attemptDelete(
      "rate_limit_events",
      () => supabaseAdmin.from("rate_limit_events").delete().eq("identifier", `user:${userId}`),
      deletedTables,
      failures,
    );

    const avatarDeleted = await cleanupAvatars(userId, failures);
    if (avatarDeleted) {
      deletedTables.push("storage.avatars");
    }

    const userDeleteResult = await attemptDelete(
      "users",
      () => supabaseAdmin.from("users").delete().eq("id", userId),
      deletedTables,
      failures,
      { critical: true },
    );

    try {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error("Failed to delete auth user:", authDeleteError);
        failures.push({
          step: "auth.users",
          message: authDeleteError.message,
        });
      } else {
        deletedTables.push("auth.users");
      }
    } catch (error) {
      console.error("Failed to delete auth user:", error);
      failures.push({
        step: "auth.users",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    if (!userDeleteResult.ok && userDeleteResult.critical) {
      return json(
        {
          error: "Failed to delete user profile",
          message: "We could not fully delete your account. Please contact support.",
          deleted_tables: deletedTables,
          failed_steps: failures,
        },
        500,
      );
    }

    return json({
      success: true,
      message: "Your account and all associated data have been permanently deleted.",
      deleted_tables: deletedTables,
      failed_steps: failures,
    });
  } catch (error) {
    console.error("Unhandled error in delete-account:", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
