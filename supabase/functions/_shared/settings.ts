import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RuntimeSettings = Record<string, unknown>;

let cachedSettings: RuntimeSettings | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export async function loadSettings(client: SupabaseClient): Promise<RuntimeSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiry) return cachedSettings;

  const { data, error } = await client
    .from("platform_settings")
    .select("key, value");

  if (error) {
    console.error("Failed to load platform settings:", error.message);
    return cachedSettings ?? {};
  }

  const settings: RuntimeSettings = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  cachedSettings = settings;
  cacheExpiry = now + CACHE_TTL_MS;
  return settings;
}

export function getFlag(settings: RuntimeSettings, key: string, fallback = true) {
  const value = settings[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

export function getNumber(settings: RuntimeSettings, key: string, fallback: number) {
  const value = settings[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function maintenanceResponse(settings: RuntimeSettings, json: (body: unknown, status?: number) => Response) {
  if (!getFlag(settings, "maintenance_mode", false)) return null;
  return json(
    {
      error: "GiftMind is under maintenance. Please try again shortly.",
      maintenance: true,
    },
    503,
  );
}
