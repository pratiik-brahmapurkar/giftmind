import { useMemo, useState } from "react";
import { Loader2, Lock, MessageCircleHeart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";

interface SignalCheckResult {
  positive_signals: string[];
  potential_risks: string[];
  overall_message: string;
  confidence_note: string;
}

interface SignalCheckProps {
  gift: GiftRecommendation;
  sessionId: string;
  recipient: Recipient;
  occasion: string;
  currency: string;
  canUseSignalCheck: boolean;
  onCreditsChanged: () => void;
}

const cache = new Map<string, SignalCheckResult>();

export default function SignalCheck({
  gift,
  sessionId,
  recipient,
  occasion,
  currency,
  canUseSignalCheck,
  onCreditsChanged,
}: SignalCheckProps) {
  const cacheKey = useMemo(() => `${sessionId}:${gift.name}`, [gift.name, sessionId]);
  const [result, setResult] = useState<SignalCheckResult | null>(cache.get(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const runSignalCheck = async () => {
    if (!canUseSignalCheck) {
      setUpgradeOpen(true);
      return;
    }

    if (cache.has(cacheKey)) {
      setResult(cache.get(cacheKey) ?? null);
      return;
    }

    setIsLoading(true);

    const response = await supabase.functions.invoke("signal-check", {
      body: {
        gift_name: gift.name,
        gift_description: gift.description,
        recipient_name: recipient.name,
        recipient_relationship: recipient.relationship,
        recipient_relationship_depth: recipient.relationship_depth,
        occasion,
        budget_spent: gift.price_anchor,
        currency,
        session_id: sessionId,
      },
    });

    setIsLoading(false);

    if (response.error || !response.data?.success) {
      setUpgradeOpen(!canUseSignalCheck);
      return;
    }

    cache.set(cacheKey, response.data.signal);
    setResult(response.data.signal);
    onCreditsChanged();
  };

  if (!canUseSignalCheck && !result) {
    return (
      <>
        <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setUpgradeOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Signal Check
          </span>
          Unlock on Popular
        </Button>
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          highlightPlan="popular"
          reason="Signal Check is available on Popular and Pro plans."
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {!result && (
          <Button type="button" variant="outline" className="w-full justify-between" onClick={runSignalCheck} disabled={isLoading}>
            <span className="inline-flex items-center gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleHeart className="h-4 w-4" />}
              Signal Check
            </span>
            {isLoading ? "Analyzing..." : "See what this gift says"}
          </Button>
        )}

        {result && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Signal Check
              </div>

              <div className="space-y-2">
                {result.positive_signals.map((signal) => (
                  <p key={signal} className="text-sm text-foreground">
                    {signal}
                  </p>
                ))}
              </div>

              {result.potential_risks.length > 0 && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Potential risks</p>
                  {result.potential_risks.map((risk) => (
                    <p key={risk} className="text-sm text-amber-900">
                      {risk}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{result.overall_message}</p>
                <p className="text-sm text-muted-foreground">{result.confidence_note}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan="popular"
        reason="Signal Check is available on Popular and Pro plans."
      />
    </>
  );
}
