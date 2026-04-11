import { useState } from "react";
import { ExternalLink, Globe2, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { detectUserCountry, SUPPORTED_COUNTRIES } from "@/lib/geoConfig";

interface ProductLinksProps {
  products: Array<{
    store_id: string;
    store_name: string;
    brand_color: string;
    search_url: string;
    is_search_link: boolean;
    gift_name: string;
    product_category: string;
    domain?: string;
  }>;
  lockedStores: Array<{
    store_id: string;
    store_name: string;
    brand_color: string;
    unlock_plan: string;
    is_locked?: boolean;
  }>;
  isLoading: boolean;
  recipientCountry: string | null;
  onTrackClick: (product: any) => void;
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
              className="min-w-[180px] border-border/60 transition-shadow hover:shadow-md"
            >
              <CardContent className="flex h-full min-h-[132px] flex-col gap-4 p-4">
                <div
                  className="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: product.brand_color || "#111827" }}
                >
                  {product.store_name}
                </div>
                <p className="text-sm text-muted-foreground">
                  Browse live matches for {product.gift_name} on {product.store_name}.
                </p>
                <button
                  type="button"
                  className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                  onClick={() => onTrackClick(product)}
                >
                  Browse on {product.store_name}
                  <ExternalLink className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}

          {lockedStores.map((store) => (
            <Card
              key={store.store_id}
              className="min-w-[180px] cursor-pointer border-border/60 bg-muted/30 opacity-80 transition-opacity hover:opacity-100"
              onClick={() => {
                setUpgradeReason(`Unlock ${store.store_name} with the ${store.unlock_plan} plan.`);
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
                  Unlock with {store.unlock_plan}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Affiliate note: some outbound store links may earn GiftMind a commission.
        </p>
      </div>

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} reason={upgradeReason} highlightPlan="popular" />
    </>
  );
}
