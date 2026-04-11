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
  why_it_works?: string;
  confidence_score?: number;
  price_anchor?: number;
  signal_interpretation?: string;
  product_links?: { title: string; url: string }[];
}

interface Props {
  session: GiftSession | null;
  onClose: () => void;
}

const GiftDetailPanel = ({ session, onClose }: Props) => {
  if (!session) return null;

  const response = session.results as unknown as { recommendations?: GiftResult[] } | null;
  const results = response?.recommendations || [];
  const chosen = typeof session.selected_gift_index === "number" ? results[session.selected_gift_index] || null : null;
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
            {session.special_context && (
              <p className="text-sm text-muted-foreground italic">"{session.special_context}"</p>
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
                  <p className="text-sm text-muted-foreground">{gift.why_it_works}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getConfidenceStyle(gift.confidence_score || 0)}`}>
                      {gift.confidence_score || 0}% confidence
                    </span>
                    {gift.price_anchor != null && (
                      <span className="text-[10px] text-muted-foreground">{gift.price_anchor}</span>
                    )}
                  </div>
                  {gift.signal_interpretation && (
                    <p className="text-xs text-muted-foreground italic">
                      Signal: {gift.signal_interpretation}
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
