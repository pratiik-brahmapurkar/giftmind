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

/* ─── Multi-currency budget presets ─── */
export type BudgetCurrencyKey = "INR" | "USD" | "EUR" | "GBP" | "AED" | "CAD" | "AUD" | "SGD";

export interface BudgetPreset {
  label: string;
  min: number;
  max: number;
}

export const BUDGET_PRESETS_BY_CURRENCY: Record<BudgetCurrencyKey, BudgetPreset[]> = {
  INR: [
    { label: "Under ₹500", min: 0, max: 500 },
    { label: "₹500–1.5K", min: 500, max: 1500 },
    { label: "₹1.5K–3K", min: 1500, max: 3000 },
    { label: "₹3K–5K", min: 3000, max: 5000 },
    { label: "₹5K–10K", min: 5000, max: 10000 },
    { label: "₹10K+", min: 10000, max: 50000 },
  ],
  USD: [
    { label: "Under $15", min: 0, max: 15 },
    { label: "$15–30", min: 15, max: 30 },
    { label: "$30–50", min: 30, max: 50 },
    { label: "$50–100", min: 50, max: 100 },
    { label: "$100–200", min: 100, max: 200 },
    { label: "$200+", min: 200, max: 1000 },
  ],
  EUR: [
    { label: "Under €10", min: 0, max: 10 },
    { label: "€10–30", min: 10, max: 30 },
    { label: "€30–50", min: 30, max: 50 },
    { label: "€50–100", min: 50, max: 100 },
    { label: "€100–200", min: 100, max: 200 },
    { label: "€200+", min: 200, max: 1000 },
  ],
  GBP: [
    { label: "Under £10", min: 0, max: 10 },
    { label: "£10–25", min: 10, max: 25 },
    { label: "£25–50", min: 25, max: 50 },
    { label: "£50–75", min: 50, max: 75 },
    { label: "£75–150", min: 75, max: 150 },
    { label: "£150+", min: 150, max: 1000 },
  ],
  AED: [
    { label: "Under 50", min: 0, max: 50 },
    { label: "50–100", min: 50, max: 100 },
    { label: "100–200", min: 100, max: 200 },
    { label: "200–400", min: 200, max: 400 },
    { label: "400–750", min: 400, max: 750 },
    { label: "750+", min: 750, max: 5000 },
  ],
  CAD: [
    { label: "Under C$20", min: 0, max: 20 },
    { label: "C$20–40", min: 20, max: 40 },
    { label: "C$40–75", min: 40, max: 75 },
    { label: "C$75–150", min: 75, max: 150 },
    { label: "C$150–250", min: 150, max: 250 },
    { label: "C$250+", min: 250, max: 1000 },
  ],
  AUD: [
    { label: "Under A$20", min: 0, max: 20 },
    { label: "A$20–50", min: 20, max: 50 },
    { label: "A$50–75", min: 50, max: 75 },
    { label: "A$75–150", min: 75, max: 150 },
    { label: "A$150–300", min: 150, max: 300 },
    { label: "A$300+", min: 300, max: 2000 },
  ],
  SGD: [
    { label: "Under S$20", min: 0, max: 20 },
    { label: "S$20–40", min: 20, max: 40 },
    { label: "S$40–75", min: 40, max: 75 },
    { label: "S$75–150", min: 75, max: 150 },
    { label: "S$150–250", min: 150, max: 250 },
    { label: "S$250+", min: 250, max: 1000 },
  ],
};

// Legacy compat
export const BUDGET_PRESETS = BUDGET_PRESETS_BY_CURRENCY.INR;

export const CURRENCIES = [
  { value: "INR", symbol: "₹" },
  { value: "USD", symbol: "$" },
  { value: "EUR", symbol: "€" },
  { value: "GBP", symbol: "£" },
  { value: "AED", symbol: "د.إ" },
  { value: "CAD", symbol: "C$" },
  { value: "AUD", symbol: "A$" },
  { value: "SGD", symbol: "S$" },
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
  budgetMin: 500,
  budgetMax: 3000,
  currency: "INR",
  contextTags: [],
  extraNotes: "",
};

export const BUDGET_INSIGHTS: Record<string, string> = {
  low_partner: "💡 For a partner, consider experiential gifts in this range — they communicate more than material items.",
  high_colleague: "💡 This is generous for a colleague. ₹1,500–3,000 is typical for professional relationships.",
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
  } catch {}
  return "US";
}

export function detectCurrencyFromLocale(): BudgetCurrencyKey {
  const stored = localStorage.getItem("gm_currency");
  if (stored && Object.keys(BUDGET_PRESETS_BY_CURRENCY).includes(stored)) return stored as BudgetCurrencyKey;
  try {
    const lang = navigator.language || "";
    if (lang.startsWith("hi") || lang === "en-IN") return "INR";
    if (["fr", "de", "it", "es", "nl"].some((l) => lang.startsWith(l))) return "EUR";
    if (lang === "en-GB") return "GBP";
    if (lang === "en-AU") return "AUD";
    if (lang === "en-CA") return "CAD";
    if (lang.startsWith("ar")) return "AED";
  } catch {}
  return "USD";
}
