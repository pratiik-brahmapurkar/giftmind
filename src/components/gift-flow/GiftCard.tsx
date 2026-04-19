import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import type { ProductResult } from "@/lib/productLinks";
import { getPlanConfig } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";
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
  isBestMatch?: boolean;
  onCreditsChanged: () => void;
  onSelect: (index: number, name: string) => void;
  onTrackClick: (product: ProductResult["products"][number]) => void;
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
  isBestMatch = false,
  onCreditsChanged,
  onSelect,
  onTrackClick,
}: GiftCardProps) {
  const planConfig = getPlanConfig(userPlan);
  const [cautionOpen, setCautionOpen] = useState(false);

  return (
    <Card
      variant={isBestMatch ? "elevated" : "default"}
      padding="none"
      className={cn(
        "overflow-hidden border-border/80 bg-background",
        isBestMatch ? "border-amber-300 shadow-glow-amber motion-safe:animate-gift-reveal" : "shadow-sm",
      )}
    >
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-sans">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                Recommendation {index + 1}
              </Badge>
              {isBestMatch ? (
                <Badge variant="primary" className="font-sans">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Best Match
                </Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              <h3 className="font-heading text-2xl font-semibold text-foreground">{gift.name}</h3>
              <p className="max-w-2xl text-sm leading-6 text-neutral-600">{gift.why_it_works}</p>
            </div>
          </div>

          <ConfidenceBadge score={gift.confidence_score} size="md" animate />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="default" className="font-sans text-xs">
            <span className="font-mono font-medium">${gift.price_anchor.toLocaleString()}</span>
          </Badge>
          <Badge variant="default" className="font-sans text-xs">
            {gift.product_category}
          </Badge>
          <Badge variant="secondary" className="font-sans text-xs">
            {planConfig.name} plan
          </Badge>
        </div>

        {gift.what_not_to_do ? (
          <div className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100/70"
              onClick={() => setCautionOpen((value) => !value)}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.5} />
              <span className="flex-1 font-medium">Gift caution</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", cautionOpen && "rotate-180")} strokeWidth={1.5} />
            </button>
            {cautionOpen ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {gift.what_not_to_do}
              </div>
            ) : null}
          </div>
        ) : null}

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
          <CheckCircle2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
          I&apos;m choosing this one
        </Button>
      </CardContent>
    </Card>
  );
}
