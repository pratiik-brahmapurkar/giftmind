import { AlertTriangle } from "lucide-react";

interface AvoidCalloutProps {
  text: string;
}

export function AvoidCallout({ text }: AvoidCalloutProps) {
  return (
    <div
      role="note"
      aria-label="Caution about this gift choice"
      className="flex items-start gap-3 rounded-xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 px-4 py-3"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          What to avoid
        </p>
        <p className="text-sm text-amber-800">{text}</p>
      </div>
    </div>
  );
}
