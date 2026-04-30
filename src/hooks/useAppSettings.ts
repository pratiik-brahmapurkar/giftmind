import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_SETTING_KEYS, SETTINGS_SCHEMA_BY_KEY } from "@/lib/settings-schema";
import type { Json } from "@/integrations/supabase/types";

type PublicPlatformSettingsClient = {
  rpc: (
    fn: "get_public_platform_settings",
    params: { p_keys: string[] },
  ) => Promise<{ data: Json | null; error: Error | null }>;
};

const publicPlatformSettingsClient = supabase as unknown as PublicPlatformSettingsClient;

function isRecord(value: Json | null): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function useAppSettings(keys: string[] = PUBLIC_SETTING_KEYS) {
  const stableKeys = useMemo(() => [...new Set(keys)].sort(), [keys]);

  return useQuery({
    queryKey: ["app-settings-public", stableKeys],
    queryFn: async () => {
      const { data, error } = await publicPlatformSettingsClient.rpc("get_public_platform_settings", {
        p_keys: stableKeys,
      });
      if (error) throw error;
      return isRecord(data) ? data : {};
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useFlag(key: string, fallback?: boolean) {
  const { data } = useAppSettings([key]);
  const configured = data?.[key];
  if (typeof configured === "boolean") return configured;

  const schemaDefault = SETTINGS_SCHEMA_BY_KEY[key]?.default;
  if (typeof schemaDefault === "boolean") return schemaDefault;
  return fallback ?? true;
}
