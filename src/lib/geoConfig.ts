// src/lib/geoConfig.ts
// Universal USD pricing — zero localization

// ─── Plan Configuration ───

export const PLANS = {
  spark: {
    name: 'Spark',
    slug: 'spark',
    emoji: '✨',
    badge: null,
    price: 0,
    credits: 3,
    validityDays: 7,
    perSession: '$0',
    savings: '',
    maxRecipients: 1,
    maxRegenerations: 1,
    maxReminders: 0,
    storesLevel: 'basic' as const,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    features: [
      '3 gift sessions',
      'Save 1 person',
      '1 regeneration',
      'Amazon links only',
      'Confidence scores',
      '7-day validity',
    ],
    lockedFeatures: [
      { text: 'Signal Check', unlockPlan: 'confident' },
      { text: 'Batch mode', unlockPlan: 'confident' },
      { text: 'Priority AI', unlockPlan: 'gifting-pro' },
    ],
    buttonText: 'Current Plan',
    buttonVariant: 'outline' as const,
  },
  thoughtful: {
    name: 'Thoughtful',
    slug: 'thoughtful',
    emoji: '💝',
    badge: '💝',
    price: 2.99,
    credits: 25,
    validityDays: 30,
    perSession: '$0.12',
    savings: '',
    maxRecipients: 5,
    maxRegenerations: 2,
    maxReminders: 0,
    storesLevel: 'basic' as const,
    hasSignalCheck: false,
    hasBatchMode: false,
    hasPriorityAi: false,
    hasHistoryExport: false,
    features: [
      '25 gift sessions',
      'Save up to 5 people',
      '2 regenerations per session',
      'Amazon + 1 local store',
      'Confidence scores',
      '30-day validity',
    ],
    lockedFeatures: [
      { text: 'Signal Check', unlockPlan: 'confident' },
      { text: 'Batch mode', unlockPlan: 'confident' },
    ],
    buttonText: 'Get Thoughtful',
    buttonVariant: 'outline' as const,
  },
  confident: {
    name: 'Confident',
    slug: 'confident',
    emoji: '🎯',
    badge: '🎯 Best Value',
    price: 5.99,
    credits: 75,
    validityDays: 60,
    perSession: '$0.08',
    savings: 'Save 33%',
    maxRecipients: 15,
    maxRegenerations: 3,
    maxReminders: 3,
    storesLevel: 'all' as const,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: false,
    hasHistoryExport: false,
    features: [
      '75 gift sessions',
      'Save up to 15 people',
      '3 regenerations per session',
      'All stores in your region',
      'Signal Check — see what your gift says',
      'Batch mode for festivals',
      '3 occasion reminders',
      '60-day validity',
    ],
    lockedFeatures: [
      { text: 'Priority AI', unlockPlan: 'gifting-pro' },
      { text: 'Export history', unlockPlan: 'gifting-pro' },
    ],
    buttonText: 'Get Best Value',
    buttonVariant: 'default' as const,
    isRecommended: true,
  },
  'gifting-pro': {
    name: 'Gifting Pro',
    slug: 'gifting-pro',
    emoji: '🚀',
    badge: '🚀 Power Gifter',
    price: 14.99,
    credits: 200,
    validityDays: 90,
    perSession: '$0.07',
    savings: 'Save 37%',
    maxRecipients: -1,
    maxRegenerations: -1,
    maxReminders: -1,
    storesLevel: 'all' as const,
    hasSignalCheck: true,
    hasBatchMode: true,
    hasPriorityAi: true,
    hasHistoryExport: true,
    features: [
      '200 gift sessions',
      'Unlimited people',
      'Unlimited regenerations',
      'All stores in your region',
      'Signal Check',
      'Batch mode for festivals',
      'Unlimited occasion reminders',
      'Priority AI — faster & smarter',
      'Export gift history',
      '90-day validity',
    ],
    lockedFeatures: [],
    buttonText: 'Go Pro 🚀',
    buttonVariant: 'default' as const,
    isDark: true,
  },
} as const;

export type PlanSlug = keyof typeof PLANS;

export function getPlanConfig(slug: string) {
  return PLANS[slug as PlanSlug] || PLANS.spark;
}

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

export function getUpgradePlan(currentPlan: string, feature: string): PlanSlug {
  const map: Record<string, PlanSlug> = {
    'signal_check': 'confident',
    'batch_mode': 'confident',
    'more_recipients': currentPlan === 'spark' ? 'thoughtful' : 'confident',
    'more_stores': currentPlan === 'spark' ? 'thoughtful' : 'confident',
    'more_regenerations': currentPlan === 'spark' ? 'thoughtful' : 'confident',
    'priority_ai': 'gifting-pro',
    'history_export': 'gifting-pro',
    'reminders': 'confident',
  };
  return map[feature] || 'confident';
}

export function getUpgradeText(currentPlan: string, feature: string): string {
  const plan = PLANS[getUpgradePlan(currentPlan, feature)];
  return `Unlock with ${plan.name} ${plan.emoji}`;
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
