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

export const BUDGET_PRESETS = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500–1.5K", min: 500, max: 1500 },
  { label: "₹1.5K–3K", min: 1500, max: 3000 },
  { label: "₹3K–5K", min: 3000, max: 5000 },
  { label: "₹5K–10K", min: 5000, max: 10000 },
  { label: "₹10K+", min: 10000, max: 50000 },
];

export const CURRENCIES = [
  { value: "INR", symbol: "₹" },
  { value: "USD", symbol: "$" },
  { value: "GBP", symbol: "£" },
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
  occasion: "",
  occasionDate: "",
  budgetMin: 500,
  budgetMax: 3000,
  currency: "INR",
  contextTags: [],
  extraNotes: "",
};

export const BUDGET_INSIGHTS: Record<string, Record<string, string>> = {
  low_partner: "💡 For a partner, consider experiential gifts in this range — they communicate more than material items.",
  high_colleague: "💡 This is generous for a colleague. ₹1,500–3,000 is typical for professional relationships.",
};
