export const UNITS_PER_CREDIT = 2;
export const DEFAULT_FREE_MONTHLY_UNITS = 30;
export const DEFAULT_GIFT_GENERATION_UNITS = 2;
export const DEFAULT_SIGNAL_CHECK_UNITS = 1;
export const DEFAULT_MESSAGE_DRAFT_UNITS = 1;
export const DEFAULT_RELATIONSHIP_INSIGHT_UNITS = 0;
export const DEFAULT_REFERRAL_REWARD_UNITS = 2;

export function parseNumberSetting(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function formatCreditUnits(units: number) {
  const credits = units / UNITS_PER_CREDIT;
  return Number.isInteger(credits) ? `${credits}` : credits.toFixed(1).replace(/\.0$/, "");
}

export function getNextResetIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
}

export function buildSignalCheckActionId(params: {
  sessionId: string;
  giftName: string;
  parentSignalCheckId?: string | null;
  followUpPrompt?: string | null;
}) {
  const prompt = (params.followUpPrompt ?? "").trim() || "initial";
  const parent = params.parentSignalCheckId ?? "base";
  return `${params.sessionId}:signal_check:${params.giftName}:${parent}:${prompt}`;
}
