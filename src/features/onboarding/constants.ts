export const AUDIENCE_OPTIONS = [
  { value: "family", label: "Family", emoji: "👨‍👩‍👧‍👦" },
  { value: "friends", label: "Friends", emoji: "👫" },
  { value: "partner", label: "Partner", emoji: "💑" },
  { value: "work", label: "Work", emoji: "💼" },
  { value: "kids", label: "Kids", emoji: "👶" },
  { value: "online", label: "Online Friends", emoji: "🌐" },
] as const;

export const GIFT_STYLE_OPTIONS = [
  { value: "thoughtful", label: "Thoughtful", emoji: "💡" },
  { value: "practical", label: "Practical", emoji: "🔧" },
  { value: "extravagant", label: "Extravagant", emoji: "💎" },
  { value: "funny", label: "Funny", emoji: "😂" },
  { value: "experience", label: "Experiences", emoji: "🌿" },
  { value: "creative", label: "Creative", emoji: "🎨" },
] as const;

export const ONBOARDING_STEP_LABELS = {
  1: "Welcome",
  2: "Gifting Context",
  3: "Add a Person",
  4: "About You",
  5: "You're All Set",
} as const;

export type AudienceOption = (typeof AUDIENCE_OPTIONS)[number]["value"];
export type GiftStyleOption = (typeof GIFT_STYLE_OPTIONS)[number]["value"];
