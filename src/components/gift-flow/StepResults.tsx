import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, ArrowLeft, ShoppingCart, MessageCircle, Check } from "lucide-react";
import { CURRENCIES } from "./constants";

interface StepResultsProps {
  currency: string;
  onRegenerate: () => void;
  onBack: () => void;
  onChoose: (gift: any) => void;
}

// Placeholder results
const placeholderGifts = [
  {
    id: "1",
    name: "Personalized Leather Journal",
    reasoning:
      "Given their love for writing and the milestone birthday, a high-quality leather journal with their initials embossed shows thoughtfulness and lasting value. It's personal, practical, and communicates that you pay attention to what they enjoy.",
    confidence: 92,
    priceMin: 1200,
    priceMax: 2500,
    signal:
      "This gift says: 'I notice what you love, and I want to support it.' It communicates attentiveness and care.",
  },
  {
    id: "2",
    name: "Artisan Coffee Gift Set",
    reasoning:
      "Their interest in specialty coffee makes this a perfect pick. A curated set of single-origin beans with a pour-over kit combines their hobby with a new experience to explore.",
    confidence: 85,
    priceMin: 1800,
    priceMax: 3000,
    signal:
      "This gift says: 'I know your taste and want to elevate it.' It shows effort in understanding their preferences.",
  },
  {
    id: "3",
    name: "Handmade Ceramic Planter",
    reasoning:
      "With their growing interest in indoor plants, a beautifully crafted artisan planter would complement their space. The handmade element adds a personal, eco-friendly touch.",
    confidence: 71,
    priceMin: 900,
    priceMax: 1800,
    signal:
      "This gift says: 'I support your new interests.' It communicates encouragement and a shared aesthetic sense.",
  },
];

const confidenceBadge = (score: number) => {
  if (score >= 80)
    return { label: "High Confidence 🎯", className: "bg-success/10 text-success border-success/20" };
  if (score >= 60)
    return { label: "Good Match", className: "bg-warning/10 text-warning border-warning/20" };
  return { label: "Worth Considering", className: "bg-muted text-muted-foreground border-border" };
};

const StepResults = ({ currency, onRegenerate, onBack, onChoose }: StepResultsProps) => {
  const currSymbol = CURRENCIES.find((c) => c.value === currency)?.symbol || "₹";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Your confident picks ✨
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Here are 3 personalized recommendations with confidence scores
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
                  <span className="text-sm font-medium text-foreground">
                    {currSymbol}{gift.priceMin.toLocaleString()} – {currSymbol}{gift.priceMax.toLocaleString()}
                  </span>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary">
                        <MessageCircle className="w-3 h-3 mr-1" /> What does this say?
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
                    Shopping links will appear here
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

      {/* Bottom actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <Button variant="outline" onClick={onRegenerate} className="w-full sm:w-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Not quite right? Regenerate
        </Button>
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Step 4
        </Button>
      </div>
    </div>
  );
};

export default StepResults;
