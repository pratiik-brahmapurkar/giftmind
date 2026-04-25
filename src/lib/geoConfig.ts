// src/lib/geoConfig.ts
// Universal USD pricing — zero localization

import { PLAN_CONFIG, getPlanConfig, type PlanKey } from "@/lib/plans";

// ─── Plan Configuration ───

export const PLANS = PLAN_CONFIG;
export type PlanSlug = PlanKey;
export { getPlanConfig };

// ─── Budget Chips (USD only, no alternatives) ───

export const BUDGET_CHIPS = [
  { label: 'Under $15', min: 0, max: 15 },
  { label: '$15 – 30', min: 15, max: 30 },
  { label: '$30 – 50', min: 30, max: 50 },
  { label: '$50 – 100', min: 50, max: 100 },
  { label: '$100 – 200', min: 100, max: 200 },
  { label: '$200+', min: 200, max: 1000 },
];

// ─── Upgrade Helpers ───

export function getUpgradePlan(_currentPlan: string, _feature: string): PlanSlug {
  return "pro";
}

export function getUpgradeText(currentPlan: string, feature: string): string {
  const labels: Record<string, string> = {
    batch_mode: "Batch mode is a Pro feature. Join the waitlist to unlock it when Pro launches.",
    history_export: "History export is a Pro feature. Join the waitlist to unlock it when Pro launches.",
    more_recipients: "Spark includes 5 saved people. Join the Pro waitlist for unlimited profiles.",
    more_regenerations: "Spark includes 2 redos per gift. Join the Pro waitlist for unlimited redos.",
    reminders: "Spark includes 2 active reminders. Join the Pro waitlist for unlimited reminders.",
    signal_check: "Signal Check is available on Spark and costs 0.5 credits.",
  };
  return labels[feature] ?? `Pro is coming soon for ${getPlanConfig(currentPlan).name} users.`;
}

// ─── Countries (for store geo-targeting only, NOT for currency) ───

export const SUPPORTED_COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'OTHER', name: 'Other Country', flag: '🌍' },
] as const;

export const UNIVERSAL_OCCASIONS = [
  { id: "birthday", emoji: "🎂", label: "Birthday" },
  { id: "anniversary", emoji: "💍", label: "Anniversary" },
  { id: "valentines", emoji: "❤️", label: "Valentine's Day" },
  { id: "wedding", emoji: "💒", label: "Wedding" },
  { id: "baby_shower", emoji: "🍼", label: "Baby Shower" },
  { id: "housewarming", emoji: "🏠", label: "Housewarming" },
  { id: "graduation", emoji: "🎓", label: "Graduation" },
  { id: "thank_you", emoji: "🙏", label: "Thank You" },
  { id: "just_because", emoji: "💝", label: "Just Because" },
  { id: "christmas", emoji: "🎄", label: "Christmas" },
  { id: "corporate", emoji: "👔", label: "Corporate Gift" },
  { id: "secret_santa", emoji: "🎅", label: "Secret Santa" },
] as const;

export const REGIONAL_OCCASIONS: Record<string, Array<{ id: string; emoji: string; label: string }>> = {
  IN: [
    { id: "diwali", emoji: "🪔", label: "Diwali" },
    { id: "holi", emoji: "🎨", label: "Holi" },
    { id: "raksha_bandhan", emoji: "🪢", label: "Raksha Bandhan" },
    { id: "karwa_chauth", emoji: "🌙", label: "Karwa Chauth" },
    { id: "ganesh_chaturthi", emoji: "🙏", label: "Ganesh Chaturthi" },
  ],
  US: [
    { id: "thanksgiving", emoji: "🦃", label: "Thanksgiving" },
    { id: "halloween", emoji: "🎃", label: "Halloween" },
    { id: "hanukkah", emoji: "🕎", label: "Hanukkah" },
    { id: "mothers_day", emoji: "💐", label: "Mother's Day" },
    { id: "fathers_day", emoji: "👔", label: "Father's Day" },
  ],
  GB: [
    { id: "boxing_day", emoji: "🎁", label: "Boxing Day" },
    { id: "mothers_day", emoji: "💐", label: "Mother's Day" },
    { id: "eid", emoji: "🌙", label: "Eid" },
    { id: "diwali", emoji: "🪔", label: "Diwali" },
  ],
  AE: [
    { id: "eid_al_fitr", emoji: "🌙", label: "Eid al-Fitr" },
    { id: "eid_al_adha", emoji: "🐑", label: "Eid al-Adha" },
    { id: "ramadan", emoji: "☪️", label: "Ramadan" },
    { id: "national_day", emoji: "🇦🇪", label: "UAE National Day" },
  ],
  FR: [
    { id: "fete_nationale", emoji: "🇫🇷", label: "Bastille Day" },
    { id: "mothers_day", emoji: "💐", label: "Fête des Mères" },
    { id: "fathers_day", emoji: "👔", label: "Fête des Pères" },
  ],
  DE: [
    { id: "nikolaus", emoji: "🎅", label: "Nikolaus" },
    { id: "oktoberfest", emoji: "🍺", label: "Oktoberfest" },
    { id: "mothers_day", emoji: "💐", label: "Muttertag" },
  ],
  NL: [
    { id: "sinterklaas", emoji: "🎅", label: "Sinterklaas" },
    { id: "kings_day", emoji: "👑", label: "King's Day" },
  ],
  SG: [
    { id: "chinese_new_year", emoji: "🧧", label: "Chinese New Year" },
    { id: "hari_raya", emoji: "🌙", label: "Hari Raya" },
    { id: "deepavali", emoji: "🪔", label: "Deepavali" },
  ],
  CA: [
    { id: "thanksgiving_ca", emoji: "🦃", label: "Thanksgiving" },
    { id: "canada_day", emoji: "🇨🇦", label: "Canada Day" },
  ],
  AU: [
    { id: "australia_day", emoji: "🇦🇺", label: "Australia Day" },
    { id: "anzac_day", emoji: "🌺", label: "ANZAC Day" },
  ],
};

export const CONTEXT_TAGS = [
  { id: "first_time", emoji: "🆕", label: "First time gifting them" },
  { id: "milestone", emoji: "🏆", label: "Milestone year" },
  { id: "long_distance", emoji: "📍", label: "Long distance" },
  { id: "has_everything", emoji: "🤷", label: "They have everything" },
  { id: "impress", emoji: "✨", label: "Want to impress" },
  { id: "simple", emoji: "🙂", label: "Keep it simple" },
  { id: "eco", emoji: "🌿", label: "Eco-friendly preferred" },
  { id: "handmade", emoji: "🎨", label: "Handmade/artisan preferred" },
  { id: "experience", emoji: "🎭", label: "Prefer experiences over things" },
  { id: "practical", emoji: "🔧", label: "They prefer practical gifts" },
] as const;

export const RELATIONSHIP_COLORS: Record<string, string> = {
  partner: "#C25450",
  spouse: "#C25450",
  parent: "#D4A04A",
  sibling: "#9D7ED3",
  close_friend: "#3E8E7E",
  friend: "#3E8E7E",
  colleague: "#B8893E",
  boss: "#4C2A85",
  child: "#E4C663",
  in_law: "#D4A04A",
  acquaintance: "#A69D8F",
  new_relationship: "#E4C663",
  mentor: "#4C2A85",
};

export const STORE_COLORS: Record<string, string> = {
  amazon: "#FF9900",
  flipkart: "#2874F0",
  myntra: "#FF3F6C",
  ajio: "#3B3B3B",
  etsy: "#F1641E",
  john_lewis: "#2D2D2D",
  noths: "#E8178A",
  fnac: "#E1A400",
  uncommon: "#2D8653",
  nordstrom: "#000000",
  argos: "#D42114",
  marks_spencer: "#007A4D",
  noon: "#FEEE00",
  bol: "#0000C8",
  target: "#CC0000",
  "1800flowers": "#7B2D8E",
};

export function detectUserCountry(): string {
  const lang = navigator.language || "";
  if (lang.startsWith("hi") || lang === "en-IN") return "IN";
  if (lang === "en-GB") return "GB";
  if (lang === "en-AU") return "AU";
  if (lang === "en-CA") return "CA";
  if (lang.startsWith("fr")) return "FR";
  if (lang.startsWith("de")) return "DE";
  if (lang.startsWith("it")) return "IT";
  if (lang.startsWith("es")) return "ES";
  if (lang.startsWith("nl")) return "NL";
  if (lang.startsWith("ar")) return "AE";
  return "US";
}
