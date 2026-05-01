import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "blog-media";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type StorageEntry = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function listFiles(path = ""): Promise<Array<{ path: string; size: number }>> {
  const files: Array<{ path: string; size: number }> = [];
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
        files.push({ path: entryPath, size: Number(entry.metadata?.size || 0) });
      } else {
        files.push(...await listFiles(entryPath));
      }
    }

    if (data.length < 1000) break;
    offset += 1000;
  }

  return files;
}

async function requireRole(req: Request, allowedRoles: string[]) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: json({ error: "Missing Authorization header" }, 401) };

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return { error: json({ error: "Unauthorized" }, 401) };

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", allowedRoles);

  if (error || !data?.length) return { error: json({ error: "Forbidden" }, 403) };
  return { user };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireRole(req, ["admin", "superadmin"]);
    if (auth.error) return auth.error;

    const files = await listFiles();
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    return json({ file_count: files.length, total_bytes: totalBytes });
  } catch (error) {
    console.error("Unhandled error in get-storage-stats:", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
