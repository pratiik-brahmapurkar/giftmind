import { differenceInCalendarDays, format } from "date-fns";

export const UNITS_PER_CREDIT = 2;
export const DEFAULT_FREE_MONTHLY_UNITS = 30;
export const DEFAULT_GIFT_GENERATION_UNITS = 2;
export const DEFAULT_SIGNAL_CHECK_UNITS = 1;
export const DEFAULT_MESSAGE_DRAFT_UNITS = 1;

export function unitsToCredits(units: number) {
  return units / UNITS_PER_CREDIT;
}

export function formatCreditsValue(units: number) {
  const credits = unitsToCredits(units);
  return Number.isInteger(credits) ? `${credits}` : credits.toFixed(1).replace(/\.0$/, "");
}

export function formatCreditsLabel(units: number, options?: { includeWord?: boolean }) {
  const value = formatCreditsValue(units);
  if (options?.includeWord === false) return value;
  return `${value} credit${units === UNITS_PER_CREDIT ? "" : "s"}`;
}

export function formatShortCreditsLabel(units: number) {
  const credits = unitsToCredits(units);
  if (credits === 0.5) return "1/2 credit";
  return formatCreditsLabel(units);
}

export function getHalfCreditNotice(units: number) {
  if (units % UNITS_PER_CREDIT === 0) return null;
  return "1/2 credit available";
}

export function getMonthlyUsageProgress(balanceUnits: number, monthlyAllocationUnits = DEFAULT_FREE_MONTHLY_UNITS) {
  const usedUnits = Math.max(monthlyAllocationUnits - balanceUnits, 0);
  return Math.max(0, Math.min(100, (usedUnits / monthlyAllocationUnits) * 100));
}

export function formatResetDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return format(new Date(value), "MMM d");
  } catch {
    return null;
  }
}

export function getResetCountdownLabel(value: string | null | undefined) {
  if (!value) return null;

  const resetDate = new Date(value);
  if (Number.isNaN(resetDate.getTime())) return null;

  const days = Math.max(differenceInCalendarDays(resetDate, new Date()), 0);
  if (days === 0) return "Resets today";
  if (days === 1) return "Resets in 1 day";
  return `Resets in ${days} days`;
}

export function getNextResetDateFromMonthlyBatch(expiresAt: string | null | undefined) {
  if (expiresAt) return expiresAt;

  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
}

export function buildGiftGenerationActionId(sessionId: string, regenerationIndex = 0) {
  return regenerationIndex > 0
    ? `${sessionId}:gift_generation:regen:${regenerationIndex}`
    : `${sessionId}:gift_generation:initial`;
}
