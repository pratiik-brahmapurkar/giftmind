import { cn } from "@/lib/utils";

interface BudgetBadgeProps {
  priceAnchor: number;
  budgetMin: number;
  budgetMax: number;
  currency: string;
}

function formatBudgetAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function BudgetBadge({
  priceAnchor,
  budgetMin,
  budgetMax,
  currency,
}: BudgetBadgeProps) {
  const within = priceAnchor >= budgetMin && priceAnchor <= budgetMax;
  const slightlyOver = !within && priceAnchor <= budgetMax * 1.2;

  const indicator = within ? "✓" : slightlyOver ? "⚠" : "✗";
  const color = within
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : slightlyOver
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-sm", color)}>
      <span>💰 ~{formatBudgetAmount(priceAnchor, currency)}</span>
      <span className="text-current/60">·</span>
      <span>
        Budget {formatBudgetAmount(budgetMin, currency)}–{formatBudgetAmount(budgetMax, currency)}
      </span>
      <span className="font-semibold">{indicator}</span>
    </div>
  );
}
