import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import type { ProductResult } from "@/lib/productLinks";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/geoConfig";
import ProductLinks from "./ProductLinks";
import SignalCheck from "./SignalCheck";

interface GiftCardProps {
  gift: GiftRecommendation;
  index: number;
  products: ProductResult | null;
  isSearchingProducts: boolean;
  sessionId: string;
  recipientCountry: string | null;
  userPlan: string;
  recipient: Recipient;
  occasion: string;
  currency: string;
  canUseSignalCheck: boolean;
  onCreditsChanged: () => void;
  onSelect: (index: number, name: string) => void;
  onTrackClick: (product: ProductResult["products"][number]) => void;
}

function getConfidenceBadge(score: number) {
  if (score >= 90) {
    return {
      label: `${score}% High confidence`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (score >= 75) {
    return {
      label: `${score}% Strong match`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (score >= 60) {
    return {
      label: `${score}% Good option`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: `${score}% Worth considering`,
    className: "border-orange-200 bg-orange-50 text-orange-700",
  };
}

export default function GiftCard({
  gift,
  index,
  products,
  isSearchingProducts,
  sessionId,
  recipientCountry,
  userPlan,
  recipient,
  occasion,
  currency,
  canUseSignalCheck,
  onCreditsChanged,
  onSelect,
  onTrackClick,
}: GiftCardProps) {
  const badge = getConfidenceBadge(gift.confidence_score);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Recommendation {index + 1}
            </div>
            <h3 className="text-xl font-semibold text-foreground">{gift.name}</h3>
          </div>
          <Badge variant="outline" className={cn("w-fit", badge.className)}>
            {badge.label}
          </Badge>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{gift.why_it_works}</p>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 font-medium text-foreground">
            {getCurrencySymbol(currency)}
            {gift.price_anchor.toLocaleString()}
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{gift.product_category}</span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{userPlan} plan</span>
        </div>

        {gift.what_not_to_do && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="inline-flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {gift.what_not_to_do}
            </span>
          </div>
        )}

        <SignalCheck
          gift={gift}
          sessionId={sessionId}
          recipient={recipient}
          occasion={occasion}
          currency={currency}
          canUseSignalCheck={canUseSignalCheck}
          onCreditsChanged={onCreditsChanged}
        />

        <ProductLinks
          products={products?.products ?? []}
          lockedStores={products?.locked_stores ?? []}
          isLoading={isSearchingProducts}
          recipientCountry={recipientCountry}
          onTrackClick={onTrackClick}
        />

        <Button type="button" variant="hero" className="w-full" onClick={() => onSelect(index, gift.name)}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          I&apos;m choosing this one
        </Button>
      </CardContent>
    </Card>
  );
}
