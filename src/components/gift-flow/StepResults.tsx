import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw, ArrowLeft, MessageCircle, Check, Loader2, Lock, ExternalLink, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENCIES, SUPPORTED_COUNTRIES } from "./constants";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/* ─── Store configs ─── */
interface StoreConfig {
  key: string;
  name: string;
  color: string;
  textOnColor?: string; // default white
  searchUrl: (query: string) => string;
}

const STORE_DB: Record<string, StoreConfig[]> = {
  IN: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}` },
    { key: "flipkart", name: "Flipkart", color: "#2874F0", searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}` },
    { key: "myntra", name: "Myntra", color: "#FF3F6C", searchUrl: (q) => `https://www.myntra.com/${encodeURIComponent(q)}` },
    { key: "ajio", name: "Ajio", color: "#3B3B3B", searchUrl: (q) => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}` },
  ],
  US: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
    { key: "uncommon", name: "Uncommon Goods", color: "#2D8653", searchUrl: (q) => `https://www.uncommongoods.com/search?q=${encodeURIComponent(q)}` },
    { key: "target", name: "Target", color: "#CC0000", searchUrl: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}` },
    { key: "nordstrom", name: "Nordstrom", color: "#000000", searchUrl: (q) => `https://www.nordstrom.com/sr?keyword=${encodeURIComponent(q)}` },
  ],
  GB: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}` },
    { key: "johnlewis", name: "John Lewis", color: "#2D2D2D", searchUrl: (q) => `https://www.johnlewis.com/search?search-term=${encodeURIComponent(q)}` },
    { key: "noths", name: "NOTHS", color: "#E8178A", searchUrl: (q) => `https://www.notonthehighstreet.com/search?term=${encodeURIComponent(q)}` },
    { key: "argos", name: "Argos", color: "#D42114", searchUrl: (q) => `https://www.argos.co.uk/search/${encodeURIComponent(q)}` },
    { key: "ms", name: "M&S", color: "#007A4D", searchUrl: (q) => `https://www.marksandspencer.com/search?q=${encodeURIComponent(q)}` },
  ],
  AE: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.ae/s?k=${encodeURIComponent(q)}` },
    { key: "noon", name: "Noon", color: "#FEEE00", textOnColor: "#000", searchUrl: (q) => `https://www.noon.com/search?q=${encodeURIComponent(q)}` },
  ],
  FR: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}` },
    { key: "fnac", name: "Fnac", color: "#E1A400", searchUrl: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
  DE: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
  NL: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.nl/s?k=${encodeURIComponent(q)}` },
    { key: "bol", name: "Bol.com", color: "#0000C8", searchUrl: (q) => `https://www.bol.com/nl/nl/s/?searchtext=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
  CA: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.ca/s?k=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
  AU: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.com.au/s?k=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
  SG: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.sg/s?k=${encodeURIComponent(q)}` },
  ],
  OTHER: [
    { key: "amazon", name: "Amazon", color: "#FF9900", searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
    { key: "etsy", name: "Etsy", color: "#F1641E", searchUrl: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  ],
};

// Fallback for unlisted countries
function getStoresForCountry(countryCode: string): StoreConfig[] {
  return STORE_DB[countryCode] || STORE_DB.OTHER;
}

/* ─── Plan-based store gating ─── */
function getUnlockedStoreCount(plan: string): number {
  if (plan === "free") return 1;
  if (plan === "starter") return 2;
  return Infinity; // popular, pro
}

function getUpgradePlanLabel(plan: string): string {
  if (plan === "free") return "Starter";
  if (plan === "starter") return "Popular";
  return "Pro";
}

/* ─── Types ─── */
interface StepResultsProps {
  currency: string;
  recipientCountry?: string;
  sessionId?: string | null;
  onRegenerate: () => void;
  onBack: () => void;
  onChoose: (gift: any) => void;
}

const LOADING_MESSAGES = [
  "Reading the room...",
  "Checking cultural notes...",
  "Calibrating confidence...",
  "Almost there...",
];

const placeholderGifts = [
  {
    id: "1",
    name: "Personalized Leather Journal",
    reasoning: "Given their love for writing and the milestone birthday, a high-quality leather journal with their initials embossed shows thoughtfulness and lasting value.",
    confidence: 92,
    priceMin: 1200,
    priceMax: 2500,
    signal: "This gift says: 'I notice what you love, and I want to support it.' It communicates attentiveness and care.",
  },
  {
    id: "2",
    name: "Artisan Coffee Gift Set",
    reasoning: "Their interest in specialty coffee makes this a perfect pick. A curated set of single-origin beans with a pour-over kit combines their hobby with a new experience.",
    confidence: 85,
    priceMin: 1800,
    priceMax: 3000,
    signal: "This gift says: 'I know your taste and want to elevate it.' It shows effort in understanding their preferences.",
  },
  {
    id: "3",
    name: "Handmade Ceramic Planter",
    reasoning: "With their growing interest in indoor plants, a beautifully crafted artisan planter would complement their space. The handmade element adds a personal touch.",
    confidence: 71,
    priceMin: 900,
    priceMax: 1800,
    signal: "This gift says: 'I support your new interests.' It communicates encouragement and a shared aesthetic sense.",
  },
];

const confidenceBadge = (score: number) => {
  if (score >= 90) return { label: "🎯 High Confidence", className: "bg-success/10 text-success border-success/20" };
  if (score >= 75) return { label: "✓ Strong Match", className: "bg-success/10 text-success border-success/20" };
  if (score >= 60) return { label: "Good Option", className: "bg-warning/10 text-warning border-warning/20" };
  return { label: "Worth Considering", className: "bg-[hsl(25,95%,53%)]/10 text-[hsl(25,95%,53%)] border-[hsl(25,95%,53%)]/20" };
};

/* ─── Shop Section per gift ─── */
function ShopSection({
  giftName,
  stores,
  unlockedCount,
  plan,
  recipientCountry,
  sessionId,
  onUpgrade,
}: {
  giftName: string;
  stores: StoreConfig[];
  unlockedCount: number;
  plan: string;
  recipientCountry?: string;
  sessionId?: string | null;
  onUpgrade: (storeName: string) => void;
}) {
  const { user } = useAuth();
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const filteredStores = storeFilter === "all" ? stores : stores.filter((s) => s.key === storeFilter);

  const handleStoreClick = async (store: StoreConfig) => {
    const url = store.searchUrl(giftName);
    window.open(url, "_blank", "noopener,noreferrer");

    // Track click
    if (user) {
      try {
        await supabase.from("product_clicks").insert({
          user_id: user.id,
          session_id: sessionId || null,
          gift_concept_name: giftName,
          store: store.name,
          product_url: url,
          country: recipientCountry || null,
          is_search_link: true,
        } as any);
      } catch {}
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">🛒 Shop This Gift</p>

      {/* Store filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStoreFilter("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            storeFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground border border-border hover:border-primary/40"
          )}
        >
          All
        </button>
        {stores.map((store, idx) => {
          const isLocked = idx >= unlockedCount;
          return (
            <button
              key={store.key}
              onClick={() => isLocked ? onUpgrade(store.name) : setStoreFilter(store.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                isLocked && "opacity-50 cursor-pointer",
                storeFilter === store.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground border border-border hover:border-primary/40"
              )}
            >
              {isLocked && <Lock className="w-3 h-3 inline mr-0.5" />}
              {store.name}
            </button>
          );
        })}
      </div>

      {/* Store cards — horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {filteredStores.map((store, idx) => {
          const isLocked = stores.indexOf(store) >= unlockedCount;

          if (isLocked) {
            return (
              <div
                key={store.key}
                onClick={() => onUpgrade(store.name)}
                className="flex-shrink-0 w-[180px] rounded-lg border border-border/50 bg-muted/30 p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors min-h-[140px]"
              >
                <div
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5 mb-2 opacity-50"
                  style={{ backgroundColor: store.color, color: store.textOnColor || "#fff" }}
                >
                  {store.name}
                </div>
                <Lock className="w-5 h-5 text-muted-foreground/40 mb-1" />
                <p className="text-xs text-muted-foreground/60">
                  Unlock with {getUpgradePlanLabel(plan)}
                </p>
              </div>
            );
          }

          return (
            <div
              key={store.key}
              className="flex-shrink-0 w-[180px] rounded-lg border border-border/50 bg-card p-4 flex flex-col items-center text-center relative hover:shadow-md transition-shadow min-h-[140px]"
            >
              {/* Store badge */}
              <div
                className="absolute top-2 right-2 text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{ backgroundColor: store.color, color: store.textOnColor || "#fff" }}
              >
                {store.name}
              </div>

              {/* Store initial */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 mt-2"
                style={{ backgroundColor: store.color + "20", color: store.color }}
              >
                {store.name.charAt(0)}
              </div>

              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                Search "{giftName}" on {store.name}
              </p>

              <button
                onClick={() => handleStoreClick(store)}
                className="mt-auto w-full text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1"
                style={{
                  backgroundColor: store.color,
                  color: store.textOnColor || "#fff",
                }}
              >
                Browse on {store.name} <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main component ─── */
const StepResults = ({ currency, recipientCountry, sessionId, onRegenerate, onBack, onChoose }: StepResultsProps) => {
  const { user } = useAuth();
  const currSymbol = CURRENCIES.find((c) => c.value === currency)?.symbol || "₹";
  const { plan, limits } = useUserPlan();
  const [loading, setLoading] = useState(true);
  const [msgIndex, setMsgIndex] = useState(0);
  const [regenCount, setRegenCount] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [upgradeHighlight, setUpgradeHighlight] = useState<"popular" | "pro">("popular");

  const storeCountry = recipientCountry || "US";
  const stores = getStoresForCountry(storeCountry);
  const unlockedCount = getUnlockedStoreCount(plan);

  const isCrossBorder = recipientCountry && recipientCountry !== (
    (() => { try { const l = navigator.language; if (l === "en-IN" || l.startsWith("hi")) return "IN"; if (l === "en-GB") return "GB"; if (l === "en-AU") return "AU"; if (l === "en-CA") return "CA"; if (l.startsWith("ar")) return "AE"; return "US"; } catch { return "US"; } })()
  );
  const recipientCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  const atRegenLimit = regenCount >= limits.regenerations;

  const handleRegenerate = () => {
    if (atRegenLimit) {
      setUpgradeReason(`You've used all ${limits.regenerations} regeneration${limits.regenerations === 1 ? "" : "s"} for this session. Upgrade for more regenerations per session.`);
      setUpgradeHighlight(plan === "free" ? "popular" : plan === "starter" ? "popular" : "pro");
      setUpgradeOpen(true);
      return;
    }
    setRegenCount((c) => c + 1);
    onRegenerate();
  };

  const openSignalUpgrade = () => {
    setUpgradeReason("Unlock Signal Check to understand what your gift communicates about your relationship.");
    setUpgradeHighlight("popular");
    setUpgradeOpen(true);
  };

  const openStoreUpgrade = (storeName: string) => {
    setUpgradeReason(`Upgrade to see ${storeName} links and more store options.`);
    setUpgradeHighlight(plan === "free" ? "starter" : "popular");
    setUpgradeOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
            Finding your perfect picks ✨
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>{LOADING_MESSAGES[msgIndex]}</span>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50 overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Your confident picks ✨
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          3 personalized recommendations with confidence scores
        </p>
      </div>

      {/* Cross-border banner */}
      {isCrossBorder && recipientCountryObj && (
        <div className="bg-[hsl(210,100%,95%)] border border-[hsl(210,100%,85%)] rounded-lg px-4 py-2.5 text-[13px] text-[hsl(210,60%,40%)]">
          🌍 Showing stores that deliver to {recipientCountryObj.name} {recipientCountryObj.flag}
        </div>
      )}

      <div className="space-y-6">
        {placeholderGifts.map((gift) => {
          const badge = confidenceBadge(gift.confidence);
          return (
            <Card key={gift.id} className="border-border/50 overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading font-semibold text-foreground text-lg">
                    {gift.name}
                  </h3>
                  <Badge variant="outline" className={badge.className}>
                    {gift.confidence}% — {badge.label}
                  </Badge>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {gift.reasoning}
                </p>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">
                    {currSymbol}{gift.priceMin.toLocaleString()} – {currSymbol}{gift.priceMax.toLocaleString()}
                  </span>

                  {/* Signal Check */}
                  {limits.hasSignalCheck ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <MessageCircle className="w-3 h-3 mr-1" /> What does this gift say?
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-xs text-sm">
                        {gift.signal}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground">
                          <Lock className="w-3 h-3 mr-1" /> What does this gift say?
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-xs space-y-2">
                        <p className="text-sm text-muted-foreground blur-[3px] select-none">
                          {gift.signal.slice(0, 15)}...
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          🔒 Unlock Signal Check with Popular or above
                        </p>
                        <Button size="sm" variant="hero" className="w-full text-xs" onClick={openSignalUpgrade}>
                          Upgrade to Popular
                        </Button>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* Shop section with stores */}
                <ShopSection
                  giftName={gift.name}
                  stores={stores}
                  unlockedCount={unlockedCount}
                  plan={plan}
                  recipientCountry={recipientCountry}
                  sessionId={sessionId}
                  onUpgrade={openStoreUpgrade}
                />

                <Button variant="hero" size="sm" className="w-full" onClick={() => onChoose(gift)}>
                  <Check className="w-4 h-4 mr-1" /> I'm choosing this one!
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Affiliate disclaimer */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Prices may vary. GiftMind may earn a small commission on purchases — at no extra cost to you.
        </span>
      </p>

      <p className="text-xs text-muted-foreground text-center">
        Results powered by AI — suggestions are personalized, not sponsored.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <div className="w-full sm:w-auto space-y-1">
          <Button variant="outline" onClick={handleRegenerate} className="w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-1" />
            {atRegenLimit ? (
              <><Lock className="w-3 h-3 mr-1" /> Regenerations used</>
            ) : (
              "Not quite right? Try again"
            )}
          </Button>
          {limits.regenerations !== Infinity && (
            <p className="text-[10px] text-muted-foreground text-center sm:text-left">
              {regenCount}/{limits.regenerations} regenerations used
            </p>
          )}
        </div>
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={upgradeHighlight}
        reason={upgradeReason}
      />
    </div>
  );
};

export default StepResults;
