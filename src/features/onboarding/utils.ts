import { COUNTRY_OPTIONS } from "@/components/recipients/constants";
import type { BirthdayDraft, OnboardingState, ProfileCompletionParams } from "@/features/onboarding/types";

export const defaultOnboardingState: OnboardingState = {
  status: "not_started",
  current_step: 1,
  completed_steps: [],
  skipped_steps: [],
  audience: [],
  gift_style: [],
  skipped_recipient: false,
  started_at: null,
  completed_at: null,
};

export function parseOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultOnboardingState;
  }

  const record = value as Record<string, unknown>;

  return {
    status: isOnboardingStatus(record.status) ? record.status : "not_started",
    current_step: typeof record.current_step === "number" ? record.current_step : 1,
    completed_steps: asNumberArray(record.completed_steps),
    skipped_steps: asNumberArray(record.skipped_steps),
    audience: asStringArray(record.audience),
    gift_style: asStringArray(record.gift_style),
    skipped_recipient: typeof record.skipped_recipient === "boolean" ? record.skipped_recipient : false,
    started_at: typeof record.started_at === "string" ? record.started_at : null,
    completed_at: typeof record.completed_at === "string" ? record.completed_at : null,
  };
}

function isOnboardingStatus(value: unknown): value is OnboardingState["status"] {
  return value === "not_started" || value === "in_progress" || value === "opted_out" || value === "completed";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

export function buildOnboardingState(
  current: unknown,
  patch: Partial<OnboardingState>,
): OnboardingState {
  return {
    ...parseOnboardingState(current),
    ...patch,
  };
}

export function detectCountryFromLocale(): string {
  try {
    const locale = navigator.language || "en-US";
    const region = new Intl.Locale(locale).region;
    const match = COUNTRY_OPTIONS.find((country) => country.value === region);
    return match?.value ?? "US";
  } catch {
    return "US";
  }
}

export function birthdayToIso(birthday: BirthdayDraft): string | null {
  if (!birthday.month && !birthday.day && !birthday.year) return null;
  if (!birthday.month || !birthday.day || !birthday.year) return null;

  const month = Number(birthday.month);
  const day = Number(birthday.day);
  const year = Number(birthday.year);

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) return null;
  return date.toISOString().split("T")[0];
}

export function parseBirthdayString(value: string | null | undefined): BirthdayDraft {
  if (!value) return { month: "", day: "", year: "" };
  const [year, month, day] = value.split("-");
  return {
    month: month || "",
    day: day || "",
    year: year || "",
  };
}

export function validateBirthdayDraft(birthday: BirthdayDraft): string | null {
  const hasAnyValue = Boolean(birthday.month || birthday.day || birthday.year);
  const hasAllValues = Boolean(birthday.month && birthday.day && birthday.year);

  if (!hasAnyValue) return null;
  if (!hasAllValues) return "Please complete all birthday fields or clear them all.";

  const iso = birthdayToIso(birthday);
  if (!iso) return "Please enter a valid birthday.";

  const birthDate = new Date(`${iso}T00:00:00.000Z`);
  const now = new Date();
  const age = now.getUTCFullYear() - birthDate.getUTCFullYear() - (
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())
      ? 1
      : 0
  );

  if (age < 13) return "You must be at least 13 years old.";
  if (age > 120) return "Please enter a valid birthday.";

  return null;
}

export function calculateProfileCompletion(params: ProfileCompletionParams): number {
  let score = 0;

  if (params.fullName && params.fullName.trim().length >= 2) score += 20;
  if (params.country && params.country.trim()) score += 20;
  if (params.recipientCount >= 1) score += 25;
  if (params.audience.length > 0) score += 15;
  if (params.birthday) score += 10;
  if (params.giftStyle.length > 0) score += 10;

  return Math.min(score, 100);
}

export function getProfileCompletionMissingFields(params: ProfileCompletionParams): string[] {
  const missing: string[] = [];

  if (!params.fullName || params.fullName.trim().length < 2) missing.push("name");
  if (!params.country || !params.country.trim()) missing.push("country");
  if (params.recipientCount < 1) missing.push("first person");
  if (params.audience.length === 0) missing.push("audience");
  if (!params.birthday) missing.push("birthday");
  if (params.giftStyle.length === 0) missing.push("gifting preferences");

  return missing;
}

export function getCountryMeta(code: string | null | undefined) {
  return COUNTRY_OPTIONS.find((country) => country.value === code) ?? null;
}
