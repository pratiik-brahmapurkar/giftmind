import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/posthog";

type CreditPackage = Database["public"]["Tables"]["credit_packages"]["Row"];
type CurrencyKey = "INR" | "USD" | "EUR" | "GBP" | "AED" | "CAD" | "AUD" | "SGD";

const CURRENCIES: { key: CurrencyKey; symbol: string; label: string }[] = [
  { key: "INR", symbol: "₹", label: "INR" },
  { key: "USD", symbol: "$", label: "USD" },
  { key: "EUR", symbol: "€", label: "EUR" },
  { key: "GBP", symbol: "£", label: "GBP" },
  { key: "AED", symbol: "د.إ", label: "AED" },
  { key: "CAD", symbol: "C$", label: "CAD" },
  { key: "AUD", symbol: "A$", label: "AUD" },
  { key: "SGD", symbol: "S$", label: "SGD" },
];

const CREDIT_USAGE = [
  { action: "Gift session", cost: "1 credit" },
  { action: "Signal Check", cost: "0.5 credits" },
  { action: "Regeneration", cost: "Free (within session)" },
  { action: "Save a recipient", cost: "Free" },
  { action: "View gift history", cost: "Free" },
];

function detectCurrency(): CurrencyKey {
  if (typeof window === "undefined") return "USD";

  const stored = window.localStorage.getItem("gm_currency");
  if (stored && CURRENCIES.some((currency) => currency.key === stored)) {
    return stored as CurrencyKey;
  }

  return "USD";
}

function formatPrice(amount: number | null, currency: CurrencyKey) {
  const selected = CURRENCIES.find((entry) => entry.key === currency)!;
  const value = amount ?? 0;
  return currency === "INR"
    ? `${selected.symbol}${value.toLocaleString("en-IN")}`
    : `${selected.symbol}${value.toFixed(2)}`;
}

function getPackagePrice(pkg: CreditPackage, currency: CurrencyKey) {
  switch (currency) {
    case "INR":
      return pkg.price_inr;
    case "USD":
      return pkg.price_usd;
    case "EUR":
      return pkg.price_eur;
    case "GBP":
      return pkg.price_gbp;
    case "AED":
      return pkg.price_aed;
    case "CAD":
      return pkg.price_cad;
    case "AUD":
      return pkg.price_aud;
    case "SGD":
      return pkg.price_sgd;
  }
}

function formatPerSession(pkg: CreditPackage, currency: CurrencyKey) {
  const price = Number(getPackagePrice(pkg, currency) ?? 0);
  const credits = pkg.credits || 1;
  const selected = CURRENCIES.find((entry) => entry.key === currency)!;
  const perSession = price / credits;

  return currency === "INR"
    ? `${selected.symbol}${perSession.toFixed(2)}/session`
    : `${selected.symbol}${perSession.toFixed(2)}/session`;
}

const BuyCreditsTab = () => {
  const [currency, setCurrency] = useState<CurrencyKey>(detectCurrency);

  useEffect(() => {
    trackEvent("credit_purchase_started", { trigger: "credits_page", currency });
  }, [currency]);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const orderedPackages = useMemo(
    () => [...packages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [packages],
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Select
          value={currency}
          onValueChange={(value) => {
            const nextCurrency = value as CurrencyKey;
            setCurrency(nextCurrency);
            window.localStorage.setItem("gm_currency", nextCurrency);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.symbol} {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-[360px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {orderedPackages.map((pkg) => (
            <Card key={pkg.id} className="border-border/60 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading text-xl">{pkg.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {pkg.credits} credits · {pkg.validity_days} days validity
                    </p>
                  </div>
                  {(pkg.badge || "").trim() && (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {pkg.badge}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-3xl font-bold text-primary">
                    {formatPrice(Number(getPackagePrice(pkg, currency) ?? 0), currency)}
                  </p>
                  <p className="text-sm text-muted-foreground">{formatPerSession(pkg, currency)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {typeof pkg.savings_percent === "number" && pkg.savings_percent > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                      Save {pkg.savings_percent}%
                    </span>
                  )}
                  {pkg.max_recipients && (
                    <span className="rounded-full bg-muted px-2 py-1">
                      {pkg.max_recipients < 0 ? "Unlimited people" : `${pkg.max_recipients} people`}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2 text-sm text-foreground">
                  {(pkg.features ?? []).map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                  {pkg.has_signal_check && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Signal Check included</span>
                    </div>
                  )}
                  {pkg.has_batch_mode && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Batch mode included</span>
                    </div>
                  )}
                  {pkg.has_history_export && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>History export included</span>
                    </div>
                  )}
                  {pkg.has_priority_ai && (
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Priority AI included</span>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled
                  title="Coming soon — payments will be enabled shortly"
                >
                  <Coins className="mr-2 h-4 w-4" />
                  Buy {pkg.name}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Coming soon — payments will be enabled shortly.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">What do credits get you?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium text-foreground">Action</th>
                  <th className="py-2 text-left font-medium text-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_USAGE.map((row) => (
                  <tr key={row.action} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{row.action}</td>
                    <td className="py-2 text-muted-foreground">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BuyCreditsTab;
