import { AlertTriangle } from "lucide-react";

export function PersonalizationWarning({ score }: { score?: number }) {
  if (score == null || score >= 70) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-amber-500"
        strokeWidth={1.5}
      />
      This recommendation is a bit generic. Try regenerating for a more specific match.
    </div>
  );
}
