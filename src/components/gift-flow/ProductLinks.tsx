import { useState } from "react";
import { ExternalLink, Globe2, Lock, TicketPercent, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { detectUserCountry, getUpgradeText, SUPPORTED_COUNTRIES } from "@/lib/geoConfig";
import type { ProductLink as ProductLinkRecord, LockedStore } from "@/lib/productLinks";

interface ProductLinksProps {
  products: ProductLinkRecord[];
  lockedStores: LockedStore[];
  isLoading: boolean;
  recipientCountry: string | null;
  onTrackClick: (product: ProductLinkRecord) => void;
}

function formatPrice(amount: number | null | undefined) {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function stockBadge(product: ProductLinkRecord) {
  switch (product.stock_status) {
    case "in_stock":
      return { label: "In stock", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "low_stock":
      return { label: "Low stock", className: "border-amber-200 bg-amber-50 text-amber-700" };
    case "out_of_stock":
      return { label: "Out of stock", className: "border-rose-200 bg-rose-50 text-rose-700" };
    case "preorder":
      return { label: "Preorder", className: "border-sky-200 bg-sky-50 text-sky-700" };
    default:
      return null;
  }
}

export default function ProductLinks({
  products,
  lockedStores,
  isLoading,
  recipientCountry,
  onTrackClick,
}: ProductLinksProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("Upgrade to unlock more stores.");
  const userCountry = detectUserCountry();
  const crossBorderCountry = recipientCountry && recipientCountry !== userCountry ? recipientCountry : null;
  const crossBorderMeta = SUPPORTED_COUNTRIES.find((country) => country.code === crossBorderCountry);
  const currentPlan = lockedStores.some((store) => store.unlock_plan === "thoughtful") ? "spark" : "thoughtful";
  const upgradeText = getUpgradeText(currentPlan, "more_stores");

  return (
    <>
      <div className="space-y-3">
        {crossBorderMeta && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <span className="inline-flex items-center gap-2">
              <Globe2 className="h-4 w-4" />
              Showing stores that make sense for {crossBorderMeta.name} {crossBorderMeta.flag}
            </span>
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-2">
          {isLoading &&
            products.length === 0 &&
            [1, 2, 3].map((item) => (
              <Card key={item} className="min-h-[132px] min-w-[180px] animate-pulse border-border/60">
                <CardContent className="space-y-3 p-4">
                  <div className="h-5 w-20 rounded bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-10 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}

          {products.map((product) => (
            <Card
              key={`${product.store_id}-${product.gift_name}`}
              className="min-w-[260px] border-border/60 transition-shadow hover:shadow-md"
            >
              <CardContent className="flex h-full min-h-[220px] flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: product.brand_color || "#111827" }}
                  >
                    {product.store_name}
                  </div>
                  {product.is_affiliate ? (
                    <Badge variant="outline" className="text-[10px]">
                      {product.attribution_label || "Affiliate"}
                    </Badge>
                  ) : null}
                </div>

                {product.image_url ? (
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                    <img
                      src={product.image_url}
                      alt={product.product_title || product.gift_name}
                      className="h-28 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {product.product_title || `Browse ${product.gift_name}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {product.is_search_link
                      ? `Live search results for ${product.gift_name} on ${product.store_name}.`
                      : `${product.product_category} picked for this gift concept.`}
                  </p>
                </div>

                {(product.price_amount != null || product.stock_status || product.delivery_eta_text) && (
                  <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                    {product.price_amount != null ? (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-foreground">
                          {formatPrice(product.price_amount)}
                        </span>
                        {product.original_price_amount && product.original_price_amount > product.price_amount ? (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(product.original_price_amount)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {stockBadge(product) ? (
                        <Badge variant="outline" className={stockBadge(product)?.className}>
                          {stockBadge(product)?.label}
                        </Badge>
                      ) : null}
                      {product.delivery_eta_text ? (
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          <Truck className="mr-1 h-3 w-3" />
                          {product.delivery_eta_text}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                )}

                {product.coupon_code || product.coupon_text ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <span className="inline-flex items-start gap-2">
                      <TicketPercent className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {product.coupon_text || "Coupon available"}
                        {product.coupon_code ? ` Use ${product.coupon_code}.` : ""}
                      </span>
                    </span>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                  onClick={() => onTrackClick(product)}
                >
                  {product.is_search_link ? "Browse on" : "View on"} {product.store_name}
                  <ExternalLink className="h-4 w-4" />
                </button>
                {product.is_affiliate ? (
                  <p className="text-[11px] text-muted-foreground">
                    {product.affiliate_source || "Affiliate-enabled link"}.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {lockedStores.map((store) => (
            <Card
              key={store.store_id}
              className="min-w-[180px] cursor-pointer border-border/60 bg-muted/30 opacity-80 transition-opacity hover:opacity-100"
              onClick={() => {
                setUpgradeReason(`${upgradeText} to unlock ${store.store_name}.`);
                setUpgradeOpen(true);
              }}
            >
              <CardContent className="flex min-h-[132px] flex-col gap-4 p-4">
                <div
                  className="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold text-white opacity-70"
                  style={{ backgroundColor: store.brand_color || "#6b7280" }}
                >
                  {store.store_name}
                </div>
                <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  {upgradeText}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Affiliate note: some outbound store links may earn GiftMind a commission.
        </p>
      </div>

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} reason={upgradeReason} highlightPlan="confident" />
    </>
  );
}
