import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Sparkles, Trophy } from "lucide-react";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import type { ProductResult } from "@/lib/productLinks";
import { cn } from "@/lib/utils";
import { getPlanConfig } from "@/lib/geoConfig";
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

// Removed getConfidenceBadge as ConfidenceBadge component handles calculation

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
    <Card className={cn("shadow-sm", isBestMatch ? "border-2 border-primary/40 ring-1 ring-primary/10" : "border-border/60")}>
      <CardContent className="space-y-5 p-5 md:p-6">
        {/* Best Match badge (Item 13) */}
        {isBestMatch && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-1 text-xs font-semibold text-white shadow-sm">
            <Trophy className="h-3.5 w-3.5" />
            Best Match
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Recommendation {index + 1}
            </div>
            <h3 className="text-xl font-semibold text-foreground">{gift.name}</h3>
          </div>
          <ConfidenceBadge score={gift.confidence_score} size="sm" animate={true} />
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{gift.why_it_works}</p>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 font-medium text-foreground">
            $
            {gift.price_anchor.toLocaleString()}
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{gift.product_category}</span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{planConfig.name} plan</span>
        </div>

        {/* Collapsible "What not to do" warning (Item 15) */}
        {gift.what_not_to_do && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100/60"
            onClick={() => setCautionOpen(!cautionOpen)}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1 font-medium">Gift caution</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", cautionOpen && "rotate-180")} />
          </button>
        )}
        {gift.what_not_to_do && cautionOpen && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {gift.what_not_to_do}
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
