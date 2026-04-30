export type SettingType = "string" | "number" | "boolean" | "string[]" | "provider_chain";
export type SettingCategory = "general" | "ai" | "credits" | "email" | "flags" | "security" | "analytics";

export const VALID_AI_PROVIDERS = [
  "claude-sonnet",
  "claude-haiku",
  "gemini-flash",
  "gemini-pro",
  "groq-llama",
] as const;

export type AiProviderKey = (typeof VALID_AI_PROVIDERS)[number];

export interface SettingDef {
  key: string;
  type: SettingType;
  category: SettingCategory;
  default: unknown;
  description: string;
  adminOnly: boolean;
  superadminOnly: boolean;
}

function providerChain(key: string, fallback: AiProviderKey[], description: string): SettingDef {
  return {
    key,
    type: "provider_chain",
    category: "ai",
    default: fallback,
    description,
    adminOnly: true,
    superadminOnly: true,
  };
}

export const SETTINGS_SCHEMA: SettingDef[] = [
  { key: "site_name", type: "string", category: "general", default: "GiftMind", description: "Display name of the platform", adminOnly: false, superadminOnly: true },
  { key: "site_tagline", type: "string", category: "general", default: "AI-Powered Gift Recommendations", description: "Public site tagline", adminOnly: false, superadminOnly: true },
  { key: "support_email", type: "string", category: "general", default: "support@giftmind.in", description: "Public support email", adminOnly: true, superadminOnly: true },
  { key: "free_credits", type: "number", category: "credits", default: 3, description: "Credits given to new signups", adminOnly: false, superadminOnly: true },
  { key: "feature_signup_enabled", type: "boolean", category: "flags", default: true, description: "Allow new user signups", adminOnly: false, superadminOnly: true },
  { key: "feature_google_oauth", type: "boolean", category: "flags", default: true, description: "Allow Google OAuth login", adminOnly: false, superadminOnly: true },
  { key: "feature_blog_enabled", type: "boolean", category: "flags", default: true, description: "Enable public blog", adminOnly: false, superadminOnly: true },
  { key: "feature_signal_check", type: "boolean", category: "flags", default: true, description: "Enable Signal Check", adminOnly: false, superadminOnly: true },
  { key: "feature_cross_border_gifting", type: "boolean", category: "flags", default: true, description: "Enable cross-border gifting controls", adminOnly: false, superadminOnly: true },
  { key: "feature_occasion_reminders", type: "boolean", category: "flags", default: true, description: "Enable occasion reminder emails", adminOnly: true, superadminOnly: true },
  { key: "feature_credit_expiry_warnings", type: "boolean", category: "flags", default: true, description: "Enable credit expiry warnings", adminOnly: true, superadminOnly: true },
  { key: "feature_posthog_enabled", type: "boolean", category: "flags", default: true, description: "Enable PostHog analytics", adminOnly: false, superadminOnly: true },
  { key: "feature_cookie_consent_required", type: "boolean", category: "flags", default: true, description: "Require analytics cookie consent", adminOnly: false, superadminOnly: true },
  { key: "maintenance_mode", type: "boolean", category: "flags", default: false, description: "Global maintenance kill switch", adminOnly: false, superadminOnly: true },
  providerChain("provider_chain_spark_gifts", ["groq-llama", "gemini-flash", "claude-haiku"], "Provider fallback chain for Spark gift generation"),
  providerChain("provider_chain_pro_gifts", ["claude-sonnet", "claude-haiku", "gemini-pro"], "Provider fallback chain for Pro gift generation"),
  providerChain("provider_chain_signal_free", ["groq-llama", "gemini-flash", "claude-haiku"], "Provider chain for Signal Check on Spark"),
  providerChain("provider_chain_signal_pro", ["claude-sonnet", "claude-haiku", "gemini-flash"], "Provider chain for Signal Check on Pro"),
  providerChain("provider_chain_relationship", ["groq-llama", "gemini-flash", "claude-haiku"], "Provider chain for relationship insight generation"),
  { key: "ai_timeout_ms_primary", type: "number", category: "ai", default: 45000, description: "Timeout for primary AI provider in milliseconds", adminOnly: true, superadminOnly: true },
  { key: "ai_timeout_ms_fallback", type: "number", category: "ai", default: 30000, description: "Timeout for fallback AI providers in milliseconds", adminOnly: true, superadminOnly: true },
  { key: "ai_max_attempts", type: "number", category: "ai", default: 3, description: "Maximum providers to try before failing", adminOnly: true, superadminOnly: true },
  { key: "posthog_server_api_key", type: "string", category: "analytics", default: "", description: "PostHog server-side API key", adminOnly: true, superadminOnly: true },
  { key: "telemetry_enabled", type: "boolean", category: "analytics", default: true, description: "Enable AI telemetry logging", adminOnly: true, superadminOnly: true },
  { key: "telemetry_retention_days", type: "number", category: "analytics", default: 90, description: "Days to retain AI telemetry logs", adminOnly: true, superadminOnly: true },
];

export const PUBLIC_SETTING_KEYS = SETTINGS_SCHEMA
  .filter((setting) => !setting.adminOnly)
  .map((setting) => setting.key);

export const SETTINGS_SCHEMA_BY_KEY = Object.fromEntries(
  SETTINGS_SCHEMA.map((setting) => [setting.key, setting]),
);

export function validateSettingValue(key: string, value: unknown) {
  const def = SETTINGS_SCHEMA_BY_KEY[key];
  if (!def) return true;

  if (def.type === "string") return typeof value === "string";
  if (def.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (def.type === "boolean") return typeof value === "boolean";
  if (def.type === "string[]") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (def.type === "provider_chain") {
    return Array.isArray(value)
      && value.length >= 1
      && value.length <= VALID_AI_PROVIDERS.length
      && value.every((item) => VALID_AI_PROVIDERS.includes(item as AiProviderKey));
  }

  return false;
}
