import type { Tables } from "@/integrations/supabase/types";

export interface SignalCheckResult {
  positive_signals: string[];
  potential_risks: string[];
  overall_message: string;
  confidence_note: string;
  adjustment_suggestions: string[];
}

export type SignalCheckRow = Tables<"signal_checks">;
export type GiftFeedbackRow = Tables<"gift_feedback">;

export interface ParsedSignalCheck extends SignalCheckRow {
  result: SignalCheckResult;
}

export interface SignalFeedbackComparison {
  label: string;
  description: string;
  className: string;
}

export function buildSignalCheckKey(sessionId: string | null | undefined, giftName: string) {
  return `${sessionId || "unknown"}:${giftName}`;
}

export function parseSignalCheckResult(value: unknown): SignalCheckResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const positiveSignals = Array.isArray(source.positive_signals)
    ? source.positive_signals.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const potentialRisks = Array.isArray(source.potential_risks)
    ? source.potential_risks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const adjustmentSuggestions = Array.isArray(source.adjustment_suggestions)
    ? source.adjustment_suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const overallMessage = typeof source.overall_message === "string" ? source.overall_message.trim() : "";
  const confidenceNote = typeof source.confidence_note === "string" ? source.confidence_note.trim() : "";

  if (!positiveSignals.length || !overallMessage || !confidenceNote) {
    return null;
  }

  return {
    positive_signals: positiveSignals,
    potential_risks: potentialRisks,
    overall_message: overallMessage,
    confidence_note: confidenceNote,
    adjustment_suggestions: adjustmentSuggestions,
  };
}

export function parseSignalChecks(rows: SignalCheckRow[]) {
  return rows
    .map((row) => {
      const result = parseSignalCheckResult(row.result_payload);
      if (!result) return null;
      return { ...row, result } satisfies ParsedSignalCheck;
    })
    .filter((row): row is ParsedSignalCheck => Boolean(row))
    .sort((left, right) => left.revision_number - right.revision_number);
}

export function getSignalFeedbackComparison(
  signalCheck: ParsedSignalCheck | null,
  feedback: GiftFeedbackRow | null | undefined,
): SignalFeedbackComparison | null {
  if (!signalCheck || !feedback?.recipient_reaction) return null;

  const hasRisks = signalCheck.result.potential_risks.length > 0;

  switch (feedback.recipient_reaction) {
    case "loved_it":
    case "liked_it":
      return {
        label: hasRisks ? "Mixed outcome" : "Matched outcome",
        description: hasRisks
          ? "The recipient still liked it, even though Signal Check had flagged some risk."
          : "The final reaction lined up with the positive read from Signal Check.",
        className: hasRisks
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "neutral":
      return {
        label: hasRisks ? "Matched caution" : "Mixed outcome",
        description: hasRisks
          ? "The neutral reaction landed close to the cautions Signal Check surfaced."
          : "Signal Check was more optimistic than the eventual neutral reaction.",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    case "didnt_like":
      return {
        label: hasRisks ? "Matched caution" : "Missed outcome",
        description: hasRisks
          ? "The recipient reaction aligned with the potential risks called out by Signal Check."
          : "Signal Check missed the negative reaction and read this gift too positively.",
        className: hasRisks
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-rose-200 bg-rose-50 text-rose-800",
      };
    default:
      return null;
  }
}
