import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, initPosthog, resetUser, trackEvent } from "@/lib/posthog";
import { getExperimentVariant as readExperimentVariant } from "@/lib/experiments";
import { normalizePlan } from "@/lib/plans";
import { useFlag } from "@/hooks/useAppSettings";
import type { AnalyticsEventName, AnalyticsProperties, GlobalEventProperties } from "@/lib/analytics-types";
import type { Json } from "@/integrations/supabase/types";

interface AnalyticsContextValue {
  track: (event: AnalyticsEventName, properties?: AnalyticsProperties) => void;
  identify: (userId: string, traits?: AnalyticsProperties) => void;
  reset: () => void;
  getExperimentVariant: (key: string) => string | undefined;
  globalProperties: GlobalEventProperties;
}

const DEFAULT_GLOBAL_PROPERTIES: GlobalEventProperties = {
  user_plan: null,
  user_country: null,
  credits_balance: 0,
  onboarding_completed: false,
  session_count: 0,
  recipient_count: 0,
  days_since_signup: 0,
  app_version: import.meta.env.VITE_APP_VERSION || "0.0.0",
  experiment_assignments: {},
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  track: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  getExperimentVariant: () => undefined,
  globalProperties: DEFAULT_GLOBAL_PROPERTIES,
});

function daysSince(value: string | null | undefined) {
  if (!value) return 0;
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

function toJsonRecord(value: AnalyticsProperties): Record<string, Json> {
  return value as Record<string, Json>;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const posthogEnabled = useFlag("feature_posthog_enabled", true);
  const cookieConsentRequired = useFlag("feature_cookie_consent_required", true);
  const [globalProperties, setGlobalProperties] = useState<GlobalEventProperties>(DEFAULT_GLOBAL_PROPERTIES);

  useEffect(() => {
    initPosthog({ enabled: posthogEnabled, requireConsent: cookieConsentRequired });
  }, [cookieConsentRequired, posthogEnabled]);

  useEffect(() => {
    let active = true;

    async function loadGlobalProperties() {
      if (!user) {
        setGlobalProperties(DEFAULT_GLOBAL_PROPERTIES);
        return;
      }

      const [{ data: profile }, { count: sessionCount }, { count: recipientCount }] = await Promise.all([
        supabase
          .from("users")
          .select("active_plan, country, credits_balance, created_at, has_completed_onboarding")
          .eq("id", user.id)
          .single(),
        supabase
          .from("gift_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("recipients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (!active) return;

      const nextProperties: GlobalEventProperties = {
        user_plan: normalizePlan(profile?.active_plan),
        user_country: profile?.country ?? null,
        credits_balance: profile?.credits_balance ?? 0,
        onboarding_completed: Boolean(profile?.has_completed_onboarding),
        session_count: sessionCount ?? 0,
        recipient_count: recipientCount ?? 0,
        days_since_signup: daysSince(profile?.created_at),
        app_version: DEFAULT_GLOBAL_PROPERTIES.app_version,
        experiment_assignments: {},
      };

      setGlobalProperties(nextProperties);
      identifyUser(user.id, {
        plan: nextProperties.user_plan,
        country: nextProperties.user_country,
        signup_age_days: nextProperties.days_since_signup,
        onboarding_completed: nextProperties.onboarding_completed,
      });
    }

    void loadGlobalProperties();
    return () => {
      active = false;
    };
  }, [user]);

  const identify = useCallback((userId: string, traits: AnalyticsProperties = {}) => {
    identifyUser(userId, toJsonRecord(traits));
  }, []);

  const reset = useCallback(() => {
    resetUser();
    setGlobalProperties(DEFAULT_GLOBAL_PROPERTIES);
  }, []);

  const track = useCallback(
    (event: AnalyticsEventName, properties: AnalyticsProperties = {}) => {
      trackEvent(event, toJsonRecord({ ...globalProperties, ...properties }));
    },
    [globalProperties],
  );

  const getExperimentVariant = useCallback((key: string) => readExperimentVariant(key), []);

  const value = useMemo(
    () => ({ track, identify, reset, getExperimentVariant, globalProperties }),
    [getExperimentVariant, globalProperties, identify, reset, track],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalyticsContext() {
  return useContext(AnalyticsContext);
}
