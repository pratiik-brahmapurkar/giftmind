import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import type { SelectGiftOptions } from "@/hooks/giftSessionTypes";
import type { ProductResult } from "@/lib/productLinks";
import { getPlanConfig } from "@/lib/geoConfig";
import { trackEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { AvoidCallout } from "./AvoidCallout";
import { BudgetBadge } from "./BudgetBadge";
import { PersonalizationWarning } from "./PersonalizationWarning";
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
  occasionDate?: string | null;
  currency: string;
  budgetMin: number;
  budgetMax: number;
  canUseSignalCheck: boolean;
  isBestMatch?: boolean;
  onCreditsChanged: () => void;
  onSelect: (index: number, name: string, options?: SelectGiftOptions) => void;
  onTrackClick: (product: ProductResult["products"][number]) => void;
  onLockedStoreClick?: (storeName: string, unlockPlan: string) => void;
  viewOnly?: boolean;
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
  occasionDate,
  currency,
  budgetMin,
  budgetMax,
  canUseSignalCheck,
  isBestMatch = false,
  onCreditsChanged,
  onSelect,
  onTrackClick,
  onLockedStoreClick,
  viewOnly = false,
}: GiftCardProps) {
  const planConfig = getPlanConfig(userPlan);
  const prefersReducedMotion = useReducedMotion();
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionNote, setSelectionNote] = useState("");
  const [createReminder, setCreateReminder] = useState(Boolean(occasionDate));

  return (
    <>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { delay: index * 0.1, duration: 0.35, ease: "easeOut" }}
      >
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

          <div className="space-y-3">
            <div className="border-b border-border/60 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why it works
              </p>
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-neutral-600">
              {gift.why_it_works}
            </p>
            <PersonalizationWarning score={gift.personalization_score} />
          </div>

          {gift.what_not_to_do?.trim() ? (
            <AvoidCallout text={gift.what_not_to_do.trim()} />
          ) : null}

          <BudgetBadge
            priceAnchor={gift.price_anchor}
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            currency={currency}
          />

          <SignalCheck
            gift={gift}
            sessionId={sessionId}
            recipient={recipient}
            occasion={occasion}
            currency={currency}
            canUseSignalCheck={canUseSignalCheck}
            onCreditsChanged={onCreditsChanged}
            recommendationIndex={index}
            viewOnly={viewOnly}
          />

          <ProductLinks
            products={products?.products ?? []}
            lockedStores={products?.locked_stores ?? []}
            isLoading={isSearchingProducts}
            recipientCountry={recipientCountry}
            giftName={gift.name}
            fallbackSearchTerm={gift.search_keywords[0] || gift.name}
            onTrackClick={onTrackClick}
            onLockedStoreClick={(store) => onLockedStoreClick?.(store.store_name, store.unlock_plan)}
          />

          {!viewOnly ? (
            <Button type="button" variant="hero" className="w-full" onClick={() => setSelectionOpen(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
              I&apos;ll Pick This One
            </Button>
          ) : null}
        </CardContent>
      </Card>
      </motion.div>

      <Dialog
        open={selectionOpen}
        onOpenChange={(open) => {
          if (!open && selectionOpen) {
            setSelectionNote("");
            setCreateReminder(Boolean(occasionDate));
          }
          setSelectionOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <ConfidenceBadge score={gift.confidence_score} size="lg" animate={false} />
              <div className="space-y-1">
                <DialogTitle>Mark this as your pick?</DialogTitle>
                <DialogDescription>
                  {gift.name} for {recipient.name}&apos;s {occasion.replace(/_/g, " ")}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="font-medium text-foreground">{gift.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{gift.why_it_works}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
                <Checkbox
                  id={`reminder-${sessionId}-${index}`}
                  checked={createReminder}
                  onCheckedChange={(checked) => setCreateReminder(Boolean(checked))}
                />
                <div className="space-y-1">
                  <Label htmlFor={`reminder-${sessionId}-${index}`} className="cursor-pointer">
                    Ask me after the occasion how it went
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll save a follow-up reminder for this gift choice.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`note-${sessionId}-${index}`}>Add a note</Label>
              <Textarea
                id={`note-${sessionId}-${index}`}
                value={selectionNote}
                onChange={(event) => setSelectionNote(event.target.value.slice(0, 200))}
                placeholder="Going to wrap it with his favorite brown paper..."
                rows={3}
                maxLength={200}
              />
              <div className="text-right text-xs text-muted-foreground">{selectionNote.length}/200</div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                trackEvent("gift_selection_cancelled", { rec_index: index });
                setSelectionOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="hero"
              onClick={() => {
                onSelect(index, gift.name, {
                  note: selectionNote.trim(),
                  createReminder,
                  occasion,
                  occasionDate,
                  recipientId: recipient.id,
                });
                setSelectionOpen(false);
              }}
            >
              Yes, This One
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
