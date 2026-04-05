// Shared constants for recipient forms

export const RELATIONSHIP_TYPES = [
  { value: "partner", label: "Partner" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "close_friend", label: "Close Friend" },
  { value: "friend", label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "boss", label: "Boss" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "in_law", label: "In-Law" },
  { value: "child", label: "Child" },
  { value: "mentor", label: "Mentor" },
  { value: "new_relationship", label: "New Relationship (< 6 months)" },
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

export const INTEREST_SUGGESTIONS = [
  "Reading", "Cooking", "Fitness", "Tech", "Fashion", "Travel",
  "Music", "Art", "Gaming", "Photography", "Gardening",
  "Spirituality", "Sports", "Food", "Beauty", "Home Decor",
];

export const RELATIONSHIP_COLORS: Record<string, string> = {
  partner: "bg-pink-500",
  parent: "bg-blue-500",
  sibling: "bg-green-500",
  close_friend: "bg-purple-500",
  friend: "bg-indigo-400",
  colleague: "bg-slate-500",
  boss: "bg-amber-600",
  acquaintance: "bg-gray-400",
  in_law: "bg-teal-500",
  child: "bg-orange-400",
  mentor: "bg-cyan-600",
  new_relationship: "bg-rose-400",
};

export interface ImportantDate {
  label: string;
  date: string; // MM-DD
  recurring: boolean;
}

export interface RecipientFormData {
  name: string;
  relationship_type: string;
  relationship_depth: string;
  age_range: string;
  gender: string;
  interests: string[];
  cultural_context: string;
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
  notes: "",
  important_dates: [],
};
