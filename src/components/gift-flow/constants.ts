export const OCCASION_GROUPS = [
  {
    label: "Personal",
    occasions: [
      { value: "birthday", label: "Birthday", emoji: "🎂" },
      { value: "anniversary", label: "Anniversary", emoji: "💍" },
      { value: "valentines", label: "Valentine's", emoji: "❤️" },
      { value: "just_because", label: "Just Because", emoji: "💝" },
    ],
  },
  {
    label: "Festivals",
    occasions: [
      { value: "diwali", label: "Diwali", emoji: "🪔" },
      { value: "christmas", label: "Christmas", emoji: "🎄" },
      { value: "eid", label: "Eid", emoji: "🌙" },
      { value: "holi", label: "Holi", emoji: "🎨" },
      { value: "raksha_bandhan", label: "Raksha Bandhan", emoji: "🪢" },
    ],
  },
  {
    label: "Life Events",
    occasions: [
      { value: "wedding", label: "Wedding", emoji: "💒" },
      { value: "baby_shower", label: "Baby Shower", emoji: "🍼" },
      { value: "housewarming", label: "Housewarming", emoji: "🏠" },
      { value: "graduation", label: "Graduation", emoji: "🎓" },
    ],
  },
  {
    label: "Professional",
    occasions: [
      { value: "secret_santa", label: "Office/Secret Santa", emoji: "🎅" },
      { value: "thank_you", label: "Thank You", emoji: "🙏" },
    ],
  },
];

// Flat list for backward compat
export const OCCASIONS = OCCASION_GROUPS.flatMap((g) => g.occasions);

export interface BudgetPreset {
  label: string;
  min: number;
  max: number;
}

export const BUDGET_PRESETS: BudgetPreset[] = [
  { label: "Under $15", min: 0, max: 15 },
  { label: "$15–30", min: 15, max: 30 },
  { label: "$30–50", min: 30, max: 50 },
  { label: "$50–100", min: 50, max: 100 },
  { label: "$100–200", min: 100, max: 200 },
  { label: "$200+", min: 200, max: 1000 },
];

export const CONTEXT_TAGS = [
  { label: "First time gifting them", emoji: "🆕" },
  { label: "Milestone year", emoji: "🏆" },
  { label: "Long distance", emoji: "📍" },
  { label: "They have everything", emoji: "🤷" },
  { label: "Want to impress", emoji: "✨" },
  { label: "Keep it simple", emoji: "🙂" },
  { label: "Eco-friendly preferred", emoji: "🌿" },
  { label: "Handmade preferred", emoji: "🎨" },
  { label: "Prefer experiences over things", emoji: "🎭" },
  { label: "They prefer practical gifts", emoji: "🔧" },
];

export const STEP_LABELS = [
  "Recipient",
  "Occasion",
  "Budget",
  "Context",
  "Results",
];

export interface GiftFlowState {
  recipientId: string | null;
  recipientCountry: string;
  occasion: string;
  occasionDate: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  contextTags: string[];
  extraNotes: string;
}

export const defaultGiftFlowState: GiftFlowState = {
  recipientId: null,
  recipientCountry: "",
  occasion: "",
  occasionDate: "",
  budgetMin: 15,
  budgetMax: 50,
  currency: "USD",
  contextTags: [],
  extraNotes: "",
};

export const BUDGET_INSIGHTS: Record<string, string> = {
  low_partner: "💡 For a partner, consider experiential gifts in this range — they communicate more than material items.",
  high_colleague: "💡 This is generous for a colleague. $30–50 is typical for professional relationships.",
};

/* ─── Supported countries for cross-border gifting ─── */
export interface SupportedCountry {
  code: string;
  flag: string;
  name: string;
  demonym: string;
  tier: number;
}

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  // Tier 1
  { code: "IN", flag: "🇮🇳", name: "India", demonym: "Indian", tier: 1 },
  { code: "US", flag: "🇺🇸", name: "United States", demonym: "American", tier: 1 },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom", demonym: "British", tier: 1 },
  { code: "AE", flag: "🇦🇪", name: "United Arab Emirates", demonym: "Emirati", tier: 1 },
  // Tier 2 — Europe
  { code: "FR", flag: "🇫🇷", name: "France", demonym: "French", tier: 2 },
  { code: "DE", flag: "🇩🇪", name: "Germany", demonym: "German", tier: 2 },
  { code: "IT", flag: "🇮🇹", name: "Italy", demonym: "Italian", tier: 2 },
  { code: "ES", flag: "🇪🇸", name: "Spain", demonym: "Spanish", tier: 2 },
  { code: "NL", flag: "🇳🇱", name: "Netherlands", demonym: "Dutch", tier: 2 },
  // Tier 3 — Commonwealth + Asia
  { code: "CA", flag: "🇨🇦", name: "Canada", demonym: "Canadian", tier: 3 },
  { code: "AU", flag: "🇦🇺", name: "Australia", demonym: "Australian", tier: 3 },
  { code: "SG", flag: "🇸🇬", name: "Singapore", demonym: "Singaporean", tier: 3 },
  // Other
  { code: "OTHER", flag: "🌍", name: "Other (Amazon Global)", demonym: "international", tier: 4 },
];

/* ─── Detect user's country from locale ─── */
export function detectUserCountry(): string {
  try {
    const lang = navigator.language || "";
    if (lang === "en-IN" || lang.startsWith("hi")) return "IN";
    if (lang === "en-GB") return "GB";
    if (lang === "en-AU") return "AU";
    if (lang === "en-CA") return "CA";
    if (lang.startsWith("fr")) return "FR";
    if (lang.startsWith("de")) return "DE";
    if (lang.startsWith("it")) return "IT";
    if (lang.startsWith("es")) return "ES";
    if (lang.startsWith("nl")) return "NL";
    if (lang.startsWith("ar")) return "AE";
  } catch {
    return "US";
  }
}
