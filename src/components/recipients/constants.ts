// Shared constants for recipient forms

export const RELATIONSHIP_TYPES = [
  { value: "partner", label: "Partner", emoji: "💑" },
  { value: "parent", label: "Parent", emoji: "👨‍👩‍👧" },
  { value: "grandparent", label: "Grandparent", emoji: "🧓" },
  { value: "sibling", label: "Sibling", emoji: "👫" },
  { value: "close_friend", label: "Close Friend", emoji: "🤝" },
  { value: "friend", label: "Friend", emoji: "👋" },
  { value: "colleague", label: "Colleague", emoji: "💼" },
  { value: "boss", label: "Boss", emoji: "🧑‍💼" },
  { value: "acquaintance", label: "Acquaintance", emoji: "🤝" },
  { value: "in_law", label: "In-Law", emoji: "👨‍👩‍👧‍👦" },
  { value: "child", label: "Child", emoji: "👶" },
  { value: "mentor", label: "Mentor", emoji: "🧑‍🏫" },
  { value: "new_relationship", label: "New Relationship", emoji: "💕" },
] as const;

export const RELATIONSHIP_DEPTHS = [
  { value: "very_close", label: "Very Close" },
  { value: "close", label: "Close" },
  { value: "acquaintance", label: "Acquaintance" },
] as const;

export const AGE_RANGES = [
  { value: "under_18", label: "Under 18" },
  { value: "18_25", label: "18–25" },
  { value: "25_35", label: "25–35" },
  { value: "35_50", label: "35–50" },
  { value: "50_65", label: "50–65" },
  { value: "65_plus", label: "65+" },
] as const;

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const CULTURAL_CONTEXTS = [
  { value: "indian_hindu", label: "Indian-Hindu" },
  { value: "indian_muslim", label: "Indian-Muslim" },
  { value: "indian_christian", label: "Indian-Christian" },
  { value: "western", label: "Western" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
] as const;

export const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "no_pork", label: "No Pork" },
  { value: "no_alcohol", label: "No Alcohol" },
] as const;

export const DATE_LABEL_OPTIONS = [
  { value: "Birthday", label: "Birthday", emoji: "🎂" },
  { value: "Anniversary", label: "Anniversary", emoji: "💍" },
  { value: "Work Anniversary", label: "Work Anniversary", emoji: "💼" },
  { value: "Graduation", label: "Graduation", emoji: "🎓" },
  { value: "Housewarming", label: "Housewarming", emoji: "🏠" },
  { value: "Other", label: "Other", emoji: "📅" },
] as const;

export const INTEREST_SUGGESTIONS = [
  "Reading", "Cooking", "Fitness", "Tech", "Fashion", "Travel",
  "Music", "Art", "Gaming", "Photography", "Gardening",
  "Spirituality", "Sports", "Food", "Beauty", "Home Decor",
];

export const RELATIONSHIP_AVATAR_COLORS: Record<string, string> = {
  partner: "#C25450",
  parent: "#D4A04A",
  grandparent: "#B8893E",
  sibling: "#9D7ED3",
  close_friend: "#3E8E7E",
  friend: "#3E8E7E",
  colleague: "#B8893E",
  boss: "#4C2A85",
  acquaintance: "#A69D8F",
  in_law: "#D4A04A",
  child: "#E4C663",
  mentor: "#4C2A85",
  new_relationship: "#E4C663",
};

export const RELATIONSHIP_BADGE_COLORS: Record<string, string> = {
  partner: "bg-[#C25450]/10 text-[#C25450] border-[#C25450]/20",
  parent: "bg-[#D4A04A]/10 text-[#946E32] border-[#D4A04A]/20",
  grandparent: "bg-[#B8893E]/10 text-[#6F5326] border-[#B8893E]/20",
  sibling: "bg-[#9D7ED3]/10 text-[#4C2A85] border-[#9D7ED3]/20",
  close_friend: "bg-[#3E8E7E]/10 text-[#3E8E7E] border-[#3E8E7E]/20",
  friend: "bg-[#3E8E7E]/10 text-[#3E8E7E] border-[#3E8E7E]/20",
  colleague: "bg-[#D4A04A]/10 text-[#946E32] border-[#D4A04A]/20",
  boss: "bg-[#4C2A85]/10 text-[#4C2A85] border-[#4C2A85]/20",
  acquaintance: "bg-muted text-muted-foreground border-border",
  in_law: "bg-[#D4A04A]/10 text-[#946E32] border-[#D4A04A]/20",
  child: "bg-[#E4C663]/20 text-[#946E32] border-[#E4C663]/30",
  mentor: "bg-[#4C2A85]/10 text-[#4C2A85] border-[#4C2A85]/20",
  new_relationship: "bg-[#E4C663]/20 text-[#946E32] border-[#E4C663]/30",
};

// Keep old export for backwards compat
export const RELATIONSHIP_COLORS = RELATIONSHIP_AVATAR_COLORS;

export const FILTER_GROUPS: { label: string; types: string[] }[] = [
  { label: "All", types: [] },
  { label: "Partners", types: ["partner", "new_relationship"] },
  { label: "Family", types: ["parent", "grandparent", "sibling", "child", "in_law"] },
  { label: "Friends", types: ["close_friend", "friend"] },
  { label: "Colleagues", types: ["colleague", "boss", "mentor", "acquaintance"] },
];

export interface ImportantDate {
  label: string;
  date: string; // MM-DD
  recurring: boolean;
}

export interface CulturalContextFormValue {
  category: string;
  dietary: string[];
}

export interface RecipientFormData {
  name: string;
  relationship_type: string;
  relationship_depth: string;
  age_range: string;
  gender: string;
  interests: string[];
  cultural_context: string;
  cultural_context_obj: CulturalContextFormValue;
  country: string;
  notes: string;
  important_dates: ImportantDate[];
}

export const defaultFormData: RecipientFormData = {
  name: "",
  relationship_type: "",
  relationship_depth: "close",
  age_range: "",
  gender: "",
  interests: [],
  cultural_context: "",
  cultural_context_obj: { category: "", dietary: [] },
  country: "",
  notes: "",
  important_dates: [],
};

export const COUNTRY_OPTIONS = [
  { value: "IN", label: "India", flag: "🇮🇳" },
  { value: "US", label: "United States", flag: "🇺🇸" },
  { value: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { value: "AE", label: "United Arab Emirates", flag: "🇦🇪" },
  { value: "FR", label: "France", flag: "🇫🇷" },
  { value: "DE", label: "Germany", flag: "🇩🇪" },
  { value: "IT", label: "Italy", flag: "🇮🇹" },
  { value: "ES", label: "Spain", flag: "🇪🇸" },
  { value: "NL", label: "Netherlands", flag: "🇳🇱" },
  { value: "CA", label: "Canada", flag: "🇨🇦" },
  { value: "AU", label: "Australia", flag: "🇦🇺" },
  { value: "SG", label: "Singapore", flag: "🇸🇬" },
  { value: "OTHER", label: "Other country", flag: "🌍" },
];
