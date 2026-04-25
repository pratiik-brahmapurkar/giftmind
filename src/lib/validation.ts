export function sanitizeString(input: string, maxLength = 500): string {
  if (!input || typeof input !== "string") return "";

  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'`]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .substring(0, maxLength);
}

export function sanitizeArray(arr: unknown[], maxItems = 20): string[] {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeString(item, 100))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function validateEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email) && email.length <= 320;
}

export function validateBudget(min: number, max: number): boolean {
  return (
    typeof min === "number" &&
    typeof max === "number" &&
    min >= 0 &&
    max > min &&
    max <= 10_000_000 &&
    Number.isFinite(min) &&
    Number.isFinite(max)
  );
}

export function validateCountryCode(code: string): boolean {
  const valid = ["IN", "US", "GB", "AE", "FR", "DE", "IT", "ES", "NL", "CA", "AU", "SG", "OTHER", "GLOBAL"];
  return valid.includes(code?.toUpperCase());
}

export function validateOccasion(occasion: string): boolean {
  const valid = [
    "birthday", "anniversary", "valentines", "wedding", "baby_shower",
    "housewarming", "graduation", "thank_you", "just_because", "christmas",
    "corporate", "secret_santa", "diwali", "holi", "raksha_bandhan",
    "karwa_chauth", "ganesh_chaturthi", "eid_al_fitr", "eid_al_adha",
    "ramadan", "thanksgiving", "halloween", "hanukkah", "mothers_day",
    "fathers_day", "boxing_day", "sinterklaas", "chinese_new_year",
    "hari_raya", "deepavali", "canada_day", "australia_day", "anzac_day",
    "fete_nationale", "nikolaus", "oktoberfest", "kings_day", "national_day",
    "thanksgiving_ca",
  ];
  return valid.includes(occasion?.toLowerCase());
}

export function validateRelationship(rel: string): boolean {
  const valid = [
    "partner", "parent", "grandparent", "sibling", "close_friend", "friend", "colleague",
    "boss", "acquaintance", "in_law", "child", "mentor", "new_relationship",
  ];
  return valid.includes(rel?.toLowerCase());
}

export function validatePlan(plan: string): boolean {
  return ["spark", "pro"].includes(plan);
}

export function validateCurrency(currency: string): boolean {
  return currency?.toUpperCase() === "USD";
}

export function validateReferralCode(code: string): boolean {
  return /^[a-zA-Z0-9]{6,12}$/.test(code);
}
