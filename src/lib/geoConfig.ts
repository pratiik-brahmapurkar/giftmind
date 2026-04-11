export const CURRENCIES = [
  { code: "INR", symbol: "₹", flag: "🇮🇳" },
  { code: "USD", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", flag: "🇬🇧" },
  { code: "AED", symbol: "د.إ", flag: "🇦🇪" },
  { code: "CAD", symbol: "C$", flag: "🇨🇦" },
  { code: "AUD", symbol: "A$", flag: "🇦🇺" },
  { code: "SGD", symbol: "S$", flag: "🇸🇬" },
] as const;

export const SUPPORTED_COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳", currency: "INR" },
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "AED" },
  { code: "FR", name: "France", flag: "🇫🇷", currency: "EUR" },
  { code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR" },
  { code: "IT", name: "Italy", flag: "🇮🇹", currency: "EUR" },
  { code: "ES", name: "Spain", flag: "🇪🇸", currency: "EUR" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", currency: "EUR" },
  { code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD" },
  { code: "AU", name: "Australia", flag: "🇦🇺", currency: "AUD" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", currency: "SGD" },
  { code: "OTHER", name: "Other Country", flag: "🌍", currency: "USD" },
] as const;

export const BUDGET_CHIPS: Record<string, Array<{ label: string; min: number; max: number }>> = {
  INR: [
    { label: "Under ₹500", min: 0, max: 500 },
    { label: "₹500 – 1.5K", min: 500, max: 1500 },
    { label: "₹1.5K – 3K", min: 1500, max: 3000 },
    { label: "₹3K – 5K", min: 3000, max: 5000 },
    { label: "₹5K – 10K", min: 5000, max: 10000 },
    { label: "₹10K+", min: 10000, max: 50000 },
  ],
  USD: [
    { label: "Under $15", min: 0, max: 15 },
    { label: "$15 – 30", min: 15, max: 30 },
    { label: "$30 – 50", min: 30, max: 50 },
    { label: "$50 – 100", min: 50, max: 100 },
    { label: "$100 – 200", min: 100, max: 200 },
    { label: "$200+", min: 200, max: 1000 },
  ],
  EUR: [
    { label: "Under €10", min: 0, max: 10 },
    { label: "€10 – 30", min: 10, max: 30 },
    { label: "€30 – 50", min: 30, max: 50 },
    { label: "€50 – 100", min: 50, max: 100 },
    { label: "€100 – 200", min: 100, max: 200 },
    { label: "€200+", min: 200, max: 1000 },
  ],
  GBP: [
    { label: "Under £10", min: 0, max: 10 },
    { label: "£10 – 25", min: 10, max: 25 },
    { label: "£25 – 50", min: 25, max: 50 },
    { label: "£50 – 75", min: 50, max: 75 },
    { label: "£75 – 150", min: 75, max: 150 },
    { label: "£150+", min: 150, max: 750 },
  ],
  AED: [
    { label: "Under 50", min: 0, max: 50 },
    { label: "50 – 100", min: 50, max: 100 },
    { label: "100 – 200", min: 100, max: 200 },
    { label: "200 – 400", min: 200, max: 400 },
    { label: "400 – 750", min: 400, max: 750 },
    { label: "750+", min: 750, max: 3000 },
  ],
  CAD: [
    { label: "Under C$20", min: 0, max: 20 },
    { label: "C$20 – 40", min: 20, max: 40 },
    { label: "C$40 – 75", min: 40, max: 75 },
    { label: "C$75 – 150", min: 75, max: 150 },
    { label: "C$150 – 250", min: 150, max: 250 },
    { label: "C$250+", min: 250, max: 1000 },
  ],
  AUD: [
    { label: "Under A$20", min: 0, max: 20 },
    { label: "A$20 – 50", min: 20, max: 50 },
    { label: "A$50 – 75", min: 50, max: 75 },
    { label: "A$75 – 150", min: 75, max: 150 },
    { label: "A$150 – 300", min: 150, max: 300 },
    { label: "A$300+", min: 300, max: 1500 },
  ],
  SGD: [
    { label: "Under S$20", min: 0, max: 20 },
    { label: "S$20 – 40", min: 20, max: 40 },
    { label: "S$40 – 75", min: 40, max: 75 },
    { label: "S$75 – 150", min: 75, max: 150 },
    { label: "S$150 – 250", min: 150, max: 250 },
    { label: "S$250+", min: 250, max: 1000 },
  ],
};

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
  partner: "#FF6B6B",
  spouse: "#FF6B6B",
  parent: "#6C5CE7",
  sibling: "#A29BFE",
  close_friend: "#00B894",
  friend: "#00B894",
  colleague: "#FDCB6E",
  boss: "#FDCB6E",
  child: "#FD79A8",
  in_law: "#6C5CE7",
  acquaintance: "#B2BEC3",
  new_relationship: "#FD79A8",
  mentor: "#0984E3",
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

export function detectUserCurrency(): string {
  const saved = localStorage.getItem("gm_currency");
  if (saved) return saved;

  const lang = navigator.language || "";
  if (lang.startsWith("hi") || lang === "en-IN") return "INR";
  if (lang.startsWith("fr") || lang.startsWith("de") || lang.startsWith("it") || lang.startsWith("es") || lang.startsWith("nl")) return "EUR";
  if (lang === "en-GB") return "GBP";
  if (lang === "en-AU") return "AUD";
  if (lang === "en-CA") return "CAD";
  if (lang.startsWith("ar")) return "AED";

  return "USD";
}

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

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((currency) => currency.code === code)?.symbol || "$";
}
