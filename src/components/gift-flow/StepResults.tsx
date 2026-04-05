import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, ArrowLeft, ShoppingCart, MessageCircle, Check, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENCIES } from "./constants";
import AffiliateDisclaimer from "@/components/AffiliateDisclaimer";

interface StepResultsProps {
  currency: string;
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

const StepResults = ({ currency, onRegenerate, onBack, onChoose }: StepResultsProps) => {
  const currSymbol = CURRENCIES.find((c) => c.value === currency)?.symbol || "₹";
  const [loading, setLoading] = useState(true);
  const [msgIndex, setMsgIndex] = useState(0);

  // Simulate loading
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
          <span className="transition-all">{LOADING_MESSAGES[msgIndex]}</span>
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

      <div className="space-y-4">
        {placeholderGifts.map((gift) => {
          const badge = confidenceBadge(gift.confidence);
          return (
            <Card key={gift.id} className="border-border/50 overflow-hidden">
              <CardContent className="p-5 space-y-3">
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

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <MessageCircle className="w-3 h-3 mr-1" /> What does this gift say?
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-sm">
                      {gift.signal}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Shop placeholder */}
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    <ShoppingCart className="w-3 h-3 inline mr-1" />
                    🛒 Shop This Gift — links will appear here
                  </p>
                </div>

                <Button
                  variant="hero"
                  size="sm"
                  className="w-full"
                  onClick={() => onChoose(gift)}
                >
                  <Check className="w-4 h-4 mr-1" /> I'm choosing this one!
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AffiliateDisclaimer />
      <p className="text-xs text-muted-foreground text-center">
        Results powered by AI — suggestions are personalized, not sponsored.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <Button variant="outline" onClick={onRegenerate} className="w-full sm:w-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Not quite right? Try again
        </Button>
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    </div>
  );
};

export default StepResults;
