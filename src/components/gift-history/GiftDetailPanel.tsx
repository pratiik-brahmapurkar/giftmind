import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { OCCASIONS } from "@/components/gift-flow/constants";
import type { Tables } from "@/integrations/supabase/types";

type GiftSession = Tables<"gift_sessions"> & {
  recipients?: Tables<"recipients"> | null;
};

interface GiftResult {
  name: string;
  reasoning: string;
  confidence: number;
  price_range: string;
  signal_check: string;
  product_links?: { title: string; url: string }[];
}

interface Props {
  session: GiftSession | null;
  onClose: () => void;
}

const GiftDetailPanel = ({ session, onClose }: Props) => {
  if (!session) return null;

  const results = (session.results as GiftResult[] | null) || [];
  const chosen = session.chosen_gift as GiftResult | null;
  const occasion = OCCASIONS.find((o) => o.value === session.occasion);

  const getConfidenceStyle = (score: number) => {
    if (score >= 80) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-orange-100 text-orange-700 border-orange-200";
  };

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg font-heading">Session Details</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {session.recipients?.name || "Unknown"} · {occasion ? `${occasion.emoji} ${occasion.label}` : session.occasion || "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Context */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Context</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-muted-foreground">
                Date: {format(new Date(session.created_at), "MMM d, yyyy")}
              </span>
              {session.occasion_date && (
                <span className="text-muted-foreground">
                  · Occasion: {format(new Date(session.occasion_date), "MMM d, yyyy")}
                </span>
              )}
            </div>
            {session.budget_min != null && session.budget_max != null && (
              <p className="text-sm text-muted-foreground">
                Budget: {session.currency === "INR" ? "₹" : session.currency === "GBP" ? "£" : "$"}
                {session.budget_min.toLocaleString()} – {session.currency === "INR" ? "₹" : session.currency === "GBP" ? "£" : "$"}
                {session.budget_max.toLocaleString()}
              </p>
            )}
            {session.context_tags && session.context_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {session.context_tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            )}
            {session.extra_notes && (
              <p className="text-sm text-muted-foreground italic">"{session.extra_notes}"</p>
            )}
          </div>

          <Separator />

          {/* Recommendations */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Recommendations
            </p>
            {results.length === 0 && (
              <p className="text-sm text-muted-foreground">No AI results recorded.</p>
            )}
            {results.map((gift, i) => {
              const isChosen = chosen?.name === gift.name;
              return (
                <Card
                  key={i}
                  className={`p-4 space-y-2 ${isChosen ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">{gift.name}</h4>
                    {isChosen && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                        Selected ✓
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{gift.reasoning}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getConfidenceStyle(gift.confidence)}`}>
                      {gift.confidence}% confidence
                    </span>
                    {gift.price_range && (
                      <span className="text-[10px] text-muted-foreground">{gift.price_range}</span>
                    )}
                  </div>
                  {gift.signal_check && (
                    <p className="text-xs text-muted-foreground italic">
                      Signal: {gift.signal_check}
                    </p>
                  )}
                  {gift.product_links && gift.product_links.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {gift.product_links.map((link, j) => (
                        <a
                          key={j}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline hover:no-underline"
                        >
                          {link.title}
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GiftDetailPanel;
