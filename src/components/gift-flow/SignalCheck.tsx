import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, MessageCircleHeart, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import { buildSignalCheckKey, parseSignalChecks } from "@/lib/signalCheck";

interface SignalCheckProps {
  gift: GiftRecommendation;
  sessionId: string;
  recipient: Recipient;
  occasion: string;
  currency: string;
  canUseSignalCheck: boolean;
  onCreditsChanged: () => void;
}

const SUGGESTED_FOLLOW_UPS = [
  "Make this less romantic",
  "Make this more premium",
  "Make this feel more playful",
];

function formatTimestamp(value: string | null) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export default function SignalCheck({
  gift,
  sessionId,
  recipient,
  occasion,
  currency,
  canUseSignalCheck,
  onCreditsChanged,
}: SignalCheckProps) {
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["signal-checks", buildSignalCheckKey(sessionId, gift.name)], [gift.name, sessionId]);

  const signalChecksQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signal_checks")
        .select("*")
        .eq("session_id", sessionId)
        .eq("gift_name", gift.name)
        .order("revision_number", { ascending: true });

      if (error) throw error;
      return parseSignalChecks(data ?? []);
    },
    enabled: Boolean(sessionId),
  });

  const checks = signalChecksQuery.data ?? [];
  const latestCheck = checks[checks.length - 1] ?? null;

  const signalMutation = useMutation({
    mutationFn: async (prompt?: string) => {
      if (!canUseSignalCheck) {
        throw new Error("PLAN_RESTRICTED");
      }

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
          follow_up_prompt: prompt || undefined,
          parent_signal_check_id: prompt ? latestCheck?.id ?? undefined : undefined,
        },
      });

      if (response.error || !response.data?.success) {
        const message =
          response.data?.message ||
          response.data?.error ||
          response.error?.message ||
          "Signal Check failed";
        throw new Error(message);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setFollowUpPrompt("");
      onCreditsChanged();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Signal Check failed";
      if (message === "PLAN_RESTRICTED") {
        setUpgradeOpen(true);
        return;
      }
      toast.error(message);
    },
  });

  const runInitialCheck = () => {
    if (!canUseSignalCheck) {
      setUpgradeOpen(true);
      return;
    }

    void signalMutation.mutateAsync();
  };

  const runFollowUp = () => {
    const trimmed = followUpPrompt.trim();
    if (!trimmed) return;

    if (!canUseSignalCheck) {
      setUpgradeOpen(true);
      return;
    }

    void signalMutation.mutateAsync(trimmed);
  };

  const isLoading = signalMutation.isPending;

  if (!canUseSignalCheck && !latestCheck) {
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
        {!latestCheck && (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            onClick={runInitialCheck}
            disabled={isLoading || signalChecksQuery.isLoading}
          >
            <span className="inline-flex items-center gap-2">
              {isLoading || signalChecksQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircleHeart className="h-4 w-4" />
              )}
              Signal Check
            </span>
            {isLoading || signalChecksQuery.isLoading ? "Analyzing..." : "See what this gift says"}
          </Button>
        )}

        {latestCheck && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Signal Check
                </div>
                <Badge variant="outline">Revision {latestCheck.revision_number}</Badge>
                {checks.length > 1 ? <Badge variant="outline">{checks.length} saved reads</Badge> : null}
              </div>

              <div className="space-y-2">
                {latestCheck.result.positive_signals.map((signal) => (
                  <p key={signal} className="text-sm text-foreground">
                    {signal}
                  </p>
                ))}
              </div>

              {latestCheck.result.potential_risks.length > 0 && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Potential risks</p>
                  {latestCheck.result.potential_risks.map((risk) => (
                    <p key={risk} className="text-sm text-amber-900">
                      {risk}
                    </p>
                  ))}
                </div>
              )}

              {latestCheck.result.adjustment_suggestions.length > 0 && (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">How to tune it</p>
                  {latestCheck.result.adjustment_suggestions.map((suggestion) => (
                    <p key={suggestion} className="text-sm text-sky-900">
                      {suggestion}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{latestCheck.result.overall_message}</p>
                <p className="text-sm text-muted-foreground">{latestCheck.result.confidence_note}</p>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wand2 className="h-3.5 w-3.5" />
                  Refine the read
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_FOLLOW_UPS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                      onClick={() => setFollowUpPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={followUpPrompt}
                  onChange={(event) => setFollowUpPrompt(event.target.value)}
                  rows={2}
                  placeholder='Ask a follow-up like "make this less romantic" or "make this more premium".'
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Each follow-up saves a new revision and uses 0.5 credit.</p>
                  <Button type="button" size="sm" variant="outline" onClick={runFollowUp} disabled={isLoading || !followUpPrompt.trim()}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Refine
                  </Button>
                </div>
              </div>

              {checks.length > 1 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="history" className="border-border/60">
                    <AccordionTrigger className="text-sm">Revision History</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {checks
                        .slice()
                        .reverse()
                        .map((check) => (
                          <div key={check.id} className="rounded-xl border border-border/60 bg-background/70 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">Revision {check.revision_number}</Badge>
                              {check.follow_up_prompt ? (
                                <span className="text-xs text-muted-foreground">Prompt: {check.follow_up_prompt}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Original read</span>
                              )}
                              {formatTimestamp(check.created_at) ? (
                                <span className="text-xs text-muted-foreground">{formatTimestamp(check.created_at)}</span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-foreground">{check.result.overall_message}</p>
                          </div>
                        ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
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
