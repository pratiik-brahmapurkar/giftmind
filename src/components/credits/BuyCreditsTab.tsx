import { useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Coins, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import PricingCards from "@/components/pricing/PricingCards";
import { trackEvent } from "@/lib/posthog";

const FAQ_ITEMS = [
  {
    q: "What happens when credits expire?",
    a: "Unused credits expire after the validity period of your purchased package. You'll receive email reminders before they expire so you can use them. Expired credits cannot be recovered.",
  },
  {
    q: "Can I get a refund?",
    a: "Within 7 days of purchase, we offer a full refund for unused credit packages. After 7 days or once credits have been used, refunds are not available.",
  },
  { q: "How many credits does each feature use?", a: null },
];

const CREDIT_USAGE = [
  { feature: "Gift session", cost: "1 credit" },
  { feature: "Signal Check", cost: "0.5 credit (Popular+ plans)" },
  { feature: "Batch mode", cost: "0.75 credit/recipient (Popular+ plans)" },
  { feature: "Regenerate within session", cost: "Free" },
  { feature: "Save recipient", cost: "Free" },
];

interface Props {
  credits: number;
  expiringBatches: Array<{
    id: string;
    credits: number;
    daysLeft: number;
    expiresAt: string;
    packageName: string;
  }>;
}

function formatExpiryDate(expiresAt: string) {
  return new Date(expiresAt).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function formatBatchSummary(batch: Props["expiringBatches"][number]) {
  return `${batch.credits} expiring ${formatExpiryDate(batch.expiresAt)}`;
}

const BuyCreditsTab = ({ credits, expiringBatches }: Props) => {
  useEffect(() => {
    trackEvent('credit_purchase_started', { trigger: 'pricing_page', current_plan: 'unknown' });
  }, []);

  const balanceTint =
    credits === 0
      ? "border-destructive/30 bg-destructive/5"
      : credits <= 3
      ? "border-warning/30 bg-warning/5"
      : "border-border bg-card";

  const expiryCopy = useMemo(() => {
    if (credits <= 0) return null;
    if (expiringBatches.length === 0) return "No active expiry batches found";

    const soonest = expiringBatches[0];
    if (credits <= 3) {
      if (soonest.daysLeft === 0) {
        return `${soonest.credits} credit${soonest.credits !== 1 ? "s" : ""} expire today`;
      }
      if (soonest.daysLeft === 1) {
        return `${soonest.credits} credit${soonest.credits !== 1 ? "s" : ""} expire tomorrow`;
      }
      return `${soonest.credits} credit${soonest.credits !== 1 ? "s" : ""} expire in ${soonest.daysLeft} days`;
    }

    return expiringBatches
      .slice(0, 2)
      .map(formatBatchSummary)
      .join(" · ");
  }, [credits, expiringBatches]);

  return (
    <div className="space-y-8">
      {/* Balance card */}
      <Card className={cn("p-6", balanceTint)}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {credits <= 3 ? (
              <AlertTriangle className="w-6 h-6 text-warning" />
            ) : (
              <Coins className="w-6 h-6 text-primary" />
            )}
          </div>
          <div>
            <p className="text-3xl font-bold font-heading text-foreground">
              {credits} credits
            </p>
            {credits === 0 && (
              <p className="text-sm text-destructive font-medium">You're out of credits</p>
            )}
            {credits > 0 && credits <= 3 && (
              <p className="text-sm text-warning font-medium">
                {expiryCopy || "Running low"}
              </p>
            )}
            {credits > 3 && (
              <p className="text-sm text-muted-foreground">
                {expiryCopy}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Shared pricing cards */}
      <PricingCards compact />

      {/* Info note */}
      <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
        Credits are used only when AI generates recommendations. Browsing, saving recipients, and reading blog posts is always free.
      </p>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h3 className="text-lg font-heading font-semibold text-foreground mb-4">
          Frequently Asked Questions
        </h3>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm font-medium">{item.q}</AccordionTrigger>
              <AccordionContent>
                {item.a ? (
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium text-foreground">Feature</th>
                          <th className="text-left py-2 font-medium text-foreground">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CREDIT_USAGE.map((row) => (
                          <tr key={row.feature} className="border-b border-border/50">
                            <td className="py-2 text-foreground">{row.feature}</td>
                            <td className="py-2 text-muted-foreground">{row.cost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default BuyCreditsTab;
