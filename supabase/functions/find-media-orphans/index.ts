import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonBody, sanitizeArray } from "../_shared/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "blog-media";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrphanBody = {
  action?: "find" | "delete";
  paths?: string[];
};

type StorageEntry = {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireSuperadmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: json({ error: "Missing Authorization header" }, 401) };

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return { error: json({ error: "Unauthorized" }, 401) };

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "superadmin")
    .maybeSingle();

  if (error || !data) return { error: json({ error: "Forbidden" }, 403) };
  return { user };
}

function pathFromPublicUrl(fileUrl: string) {
  return decodeURIComponent(fileUrl.split(`/${BUCKET}/`)[1] || "");
}

async function listFiles(path = ""): Promise<Orphan[]> {
  const files: Orphan[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(path, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw error;
    if (!data?.length) break;

    for (const entry of data as StorageEntry[]) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.id || entry.metadata?.size) {
        files.push({
          path: entryPath,
          size: Number(entry.metadata?.size || 0),
          last_modified: entry.updated_at || entry.created_at || new Date().toISOString(),
        });
      } else {
        files.push(...await listFiles(entryPath));
      }
    }

    if (data.length < 1000) break;
    offset += 1000;
  }

  return files;
}

async function listOrphans() {
  const { data: mediaRows, error: mediaError } = await supabaseAdmin
    .from("blog_media")
    .select("file_url");

  if (mediaError) throw mediaError;

  const tracked = new Set((mediaRows || []).map((row) => pathFromPublicUrl(row.file_url)).filter(Boolean));
  const objects = await listFiles();

  return objects.filter((object) => object.path && !tracked.has(object.path));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireSuperadmin(req);
    if (auth.error) return auth.error;

    const parsed = await parseJsonBody<OrphanBody>(req, json);
    if (parsed.response) return parsed.response;
    const body = parsed.data || {};
    const action = body.action || "find";

    if (action === "delete") {
      const paths = sanitizeArray(body.paths || [], 200);
      if (!paths.length) return json({ error: "No orphan paths provided" }, 400);

      const existingOrphans = await listOrphans();
      const orphanPaths = new Set(existingOrphans.map((item) => item.path));
      const deletable = paths.filter((path) => orphanPaths.has(path));
      if (!deletable.length) return json({ deleted_count: 0, bytes_recovered: 0, orphans: existingOrphans });

      const bytesByPath = new Map(existingOrphans.map((item) => [item.path, item.size]));
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove(deletable);
      if (error) throw error;

      for (const path of deletable) {
        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: auth.user.id,
          actor_email: auth.user.email || "unknown",
          actor_role: "superadmin",
          action: "media_orphan_deleted",
          target_type: "storage.objects",
          target_id: path,
          target_label: path,
          payload: { bucket: BUCKET, size: bytesByPath.get(path) || 0 },
        });
      }

      const remaining = await listOrphans();
      return json({
        deleted_count: deletable.length,
        bytes_recovered: deletable.reduce((sum, path) => sum + (bytesByPath.get(path) || 0), 0),
        orphans: remaining,
      });
    }

    const orphans = await listOrphans();
    return json({ orphans });
  } catch (error) {
    console.error("Unhandled error in find-media-orphans:", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
