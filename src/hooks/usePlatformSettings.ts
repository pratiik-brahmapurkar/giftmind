import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformSettings {
  [key: string]: any;
}

export function usePlatformSettings(enabled = true) {
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return { data: null, error: null };
    }

    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("platform_settings")
      .select("key, value, description");

    if (!error && data) {
      const mapped: PlatformSettings = {};
      data.forEach((row: { key: string; value: any }) => {
        mapped[row.key] = row.value;
      });
      setSettings(mapped);
    }

    setIsLoading(false);
    return { data, error };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    void fetchSettings();
  }, [enabled, fetchSettings]);

  const updateSetting = useCallback(async (key: string, value: any) => {
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await (supabase as any)
      .from("platform_settings")
      .upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: "key" },
      );

    if (!error) {
      setSettings((prev) => ({ ...prev, [key]: value }));
    }

    setIsSaving(false);
    return { error };
  }, []);

  const updateMultipleSettings = useCallback(async (updates: Record<string, any>) => {
    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rows = Object.entries(updates).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }));

    const { error } = await (supabase as any)
      .from("platform_settings")
      .upsert(rows, { onConflict: "key" });

    if (!error) {
      setSettings((prev) => ({ ...prev, ...updates }));
    }

    setIsSaving(false);
    return { error };
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    updateSetting,
    updateMultipleSettings,
    refresh: fetchSettings,
  };
}
