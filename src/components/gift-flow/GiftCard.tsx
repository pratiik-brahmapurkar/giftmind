import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Gift,
  Heart,
  Palette,
  Shirt,
  ShoppingBag,
  Sparkles,
  Trophy,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  isSignalCheckEnabled?: boolean;
  signalCheckCost?: number;
  isBestMatch?: boolean;
  onCreditsChanged: (nextBalance?: number | null) => void;
  onSelect: (index: number, name: string, options?: SelectGiftOptions) => void;
  onTrackClick: (product: ProductResult["products"][number]) => void;
  onLockedStoreClick?: (storeName: string, unlockPlan: string) => void;
  viewOnly?: boolean;
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return null;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function visualIconForCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("book") || normalized.includes("journal")) return BookOpen;
  if (normalized.includes("fashion") || normalized.includes("wear") || normalized.includes("apparel")) return Shirt;
  if (normalized.includes("art") || normalized.includes("decor")) return Palette;
  return Gift;
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
  isSignalCheckEnabled = true,
  signalCheckCost = 0.5,
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
  const [savedForLater, setSavedForLater] = useState(false);
  const topProduct = products?.products?.[0] ?? null;
  const visibleStoreLinks = products?.products?.slice(0, 3) ?? [];
  const VisualIcon = visualIconForCategory(gift.product_category);

  const handleSaveForLater = () => {
    setSavedForLater((current) => !current);
    trackEvent("gift_save_for_later_clicked", {
      rec_index: index,
      saved: !savedForLater,
      gift_name: gift.name,
    });
  };

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
            "overflow-hidden rounded-3xl border-[#EADCC6] bg-white shadow-[0_16px_45px_rgba(55,42,22,0.08)]",
            isBestMatch ? "border-amber-300 shadow-glow-amber motion-safe:animate-gift-reveal" : "",
          )}
        >
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="relative flex min-h-[190px] items-center justify-center overflow-hidden rounded-2xl border border-[#EFE3D1] bg-[#FBF6EC] lg:w-56 lg:shrink-0">
                {topProduct?.image_url ? (
                  <img
                    src={topProduct.image_url}
                    alt={topProduct.product_title || gift.name}
                    className="h-full min-h-[190px] w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#D4A04A]/15 text-[#7A5520]">
                    <VisualIcon className="h-11 w-11" strokeWidth={1.7} />
                  </div>
                )}
                {isBestMatch ? (
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#7A5520] shadow-sm">
                    <Trophy className="h-3.5 w-3.5" />
                    Best match
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-sans">
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Recommendation {index + 1}
                      </Badge>
                      <Badge variant="outline" className="border-[#E6D5BA] bg-[#FBF6EC] font-sans text-[#7A5520]">
                        {gift.product_category}
                      </Badge>
                      <Badge variant="secondary" className="font-sans text-xs">
                        {planConfig.name} plan
                      </Badge>
                    </div>
                    <h3 className="font-heading text-2xl font-semibold leading-tight text-foreground">
                      {gift.name}
                    </h3>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <ConfidenceBadge score={gift.confidence_score} size="md" animate />
                    <div className="rounded-full border border-[#E6D5BA] bg-[#FBF6EC] px-3 py-1 text-sm font-semibold text-[#5C4524]">
                      ~{formatMoney(gift.price_anchor)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Why it works
                  </p>
                  <p className="text-base leading-relaxed text-neutral-700">
                    {gift.why_it_works}
                  </p>
                  <PersonalizationWarning score={gift.personalization_score} />
                </div>

                <Accordion type="single" collapsible className="rounded-2xl border border-[#EFE3D1] bg-[#FCFAF6] px-4">
                  <AccordionItem value="insights" className="border-0">
                    <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                      What to avoid and deeper AI notes
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-4">
                      {gift.what_not_to_do?.trim() ? (
                        <AvoidCallout text={gift.what_not_to_do.trim()} />
                      ) : (
                        <p className="rounded-xl border border-border/60 bg-white p-3 text-sm text-muted-foreground">
                          No specific avoid note was flagged for this recommendation.
                        </p>
                      )}
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {gift.signal_interpretation || gift.description}
                      </p>
                      <BudgetBadge
                        priceAnchor={gift.price_anchor}
                        budgetMin={budgetMin}
                        budgetMax={budgetMax}
                        currency={currency}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>

          <SignalCheck
            gift={gift}
            sessionId={sessionId}
            recipient={recipient}
            occasion={occasion}
            currency={currency}
            canUseSignalCheck={canUseSignalCheck}
            isSignalCheckEnabled={isSignalCheckEnabled}
            signalCheckCost={signalCheckCost}
            onCreditsChanged={onCreditsChanged}
            recommendationIndex={index}
            viewOnly={viewOnly}
          />

          <div className="flex flex-col gap-3 border-t border-[#EFE3D1] pt-5 lg:flex-row lg:items-center lg:justify-between">
            {!viewOnly ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="hero" className="min-h-12 px-6" onClick={() => setSelectionOpen(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  I&apos;ll Pick This One
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "min-h-12 px-4",
                    savedForLater && "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                  )}
                  onClick={handleSaveForLater}
                  aria-pressed={savedForLater}
                >
                  <Heart className={cn("mr-2 h-4 w-4", savedForLater && "fill-current")} strokeWidth={1.6} />
                  {savedForLater ? "Saved" : "Save for Later"}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {visibleStoreLinks.map((product) => (
                <Button
                  key={`${product.store_id}-${product.gift_name}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="border border-border/60 bg-white"
                  onClick={() => onTrackClick(product)}
                >
                  <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                  {product.is_search_link ? "Browse" : "View"} {product.store_name}
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ))}
              {isSearchingProducts && visibleStoreLinks.length === 0 ? (
                <span className="text-xs text-muted-foreground">Finding store links...</span>
              ) : null}
            </div>
          </div>

          {(products?.products?.length || products?.locked_stores?.length || isSearchingProducts) ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="stores" className="rounded-2xl border border-border/60 px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  <span className="inline-flex items-center gap-2">
                    More store details
                    <ChevronDown className="hidden h-4 w-4" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <ProductLinks
                    products={products?.products ?? []}
                    lockedStores={products?.locked_stores ?? []}
                    lockedStoreCountTotal={products?.locked_store_count_total ?? products?.locked_stores?.length ?? 0}
                    isLoading={isSearchingProducts}
                    recipientCountry={recipientCountry}
                    isGlobalFallback={Boolean(products?.is_global_fallback)}
                    giftName={gift.name}
                    fallbackSearchTerm={gift.search_keywords[0] || gift.name}
                    onTrackClick={onTrackClick}
                    onLockedStoreClick={(store) => onLockedStoreClick?.(store.store_name, store.unlock_plan)}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
