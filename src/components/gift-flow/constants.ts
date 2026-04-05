export const OCCASIONS = [
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "anniversary", label: "Anniversary", emoji: "💍" },
  { value: "diwali", label: "Diwali", emoji: "🪔" },
  { value: "christmas", label: "Christmas", emoji: "🎄" },
  { value: "eid", label: "Eid", emoji: "🌙" },
  { value: "holi", label: "Holi", emoji: "🎨" },
  { value: "raksha_bandhan", label: "Raksha Bandhan", emoji: "🪢" },
  { value: "wedding", label: "Wedding", emoji: "💒" },
  { value: "baby_shower", label: "Baby Shower", emoji: "🍼" },
  { value: "housewarming", label: "Housewarming", emoji: "🏠" },
  { value: "thank_you", label: "Thank You", emoji: "🙏" },
  { value: "just_because", label: "Just Because", emoji: "💝" },
  { value: "secret_santa", label: "Office/Secret Santa", emoji: "🎅" },
  { value: "valentines", label: "Valentine's Day", emoji: "❤️" },
  { value: "graduation", label: "Graduation", emoji: "🎓" },
];

export const BUDGET_PRESETS = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500–1,500", min: 500, max: 1500 },
  { label: "₹1,500–3,000", min: 1500, max: 3000 },
  { label: "₹3,000–5,000", min: 3000, max: 5000 },
  { label: "₹5,000–10,000", min: 5000, max: 10000 },
  { label: "₹10,000+", min: 10000, max: 50000 },
];

export const CURRENCIES = [
  { value: "INR", symbol: "₹" },
  { value: "USD", symbol: "$" },
  { value: "GBP", symbol: "£" },
];

export const CONTEXT_TAGS = [
  "First time gifting them",
  "Milestone year",
  "Long distance",
  "They have everything",
  "Want to impress",
  "Keep it simple",
  "Eco-friendly preferred",
  "Handmade/artisan preferred",
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
