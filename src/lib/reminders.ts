import type { ImportantDate } from "@/components/recipients/constants";

export interface UpcomingOccasion {
  recipientId: string;
  recipientName: string;
  label: string;
  date: string;
  daysUntil: number;
  emoji: string;
}

export interface ReminderRecipientLike {
  id: string;
  name: string;
  important_dates: unknown;
}

export function getDaysUntilImportantDate(mmdd: string, today = new Date()) {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return null;

  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let target = new Date(base.getFullYear(), month - 1, day);

  if (Number.isNaN(target.getTime())) return null;
  if (target < base) {
    target = new Date(base.getFullYear() + 1, month - 1, day);
  }

  return Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatImportantDate(mmdd: string) {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return mmdd;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${day}`;
}

export function getOccasionEmoji(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes("birthday")) return "🎂";
  if (normalized.includes("anniversary")) return "💍";
  if (normalized.includes("graduation")) return "🎓";
  if (normalized.includes("housewarming")) return "🏠";
  if (normalized.includes("work")) return "💼";

  return "📅";
}

export function formatCountdown(daysUntil: number) {
  if (daysUntil <= 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

export function countScheduledReminderDates(dates: ImportantDate[]) {
  return dates.filter((entry) => getDaysUntilImportantDate(entry.date) !== null).length;
}

export function getUpcomingDates(
  recipients: Array<ReminderRecipientLike & { parsedDates: ImportantDate[] }>,
  windowDays = 60,
) {
  const results: UpcomingOccasion[] = [];

  for (const recipient of recipients) {
    for (const date of recipient.parsedDates) {
      const daysUntil = getDaysUntilImportantDate(date.date);
      if (daysUntil === null || daysUntil < 0 || daysUntil > windowDays) continue;

      results.push({
        recipientId: recipient.id,
        recipientName: recipient.name,
        label: date.label,
        date: date.date,
        daysUntil,
        emoji: getOccasionEmoji(date.label),
      });
    }
  }

  return results.sort((left, right) => left.daysUntil - right.daysUntil);
}

export function getOccasionSlugFromLabel(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "birthday") return "birthday";
  if (normalized === "anniversary") return "anniversary";
  if (normalized === "graduation") return "graduation";
  if (normalized === "work anniversary") return "work_anniversary";
  if (normalized === "housewarming") return "housewarming";
  if (normalized === "valentine's day") return "valentines";
  if (normalized === "eid") return "eid";
  if (normalized === "diwali") return "diwali";
  if (normalized === "christmas") return "christmas";
  if (normalized === "hanukkah") return "hanukkah";

  return null;
}
