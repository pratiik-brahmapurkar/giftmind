import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import { buildSignalCheckKey, parseSignalChecks } from "@/lib/signalCheck";
import { trackEvent } from "@/lib/posthog";
import { Check, Loader2, Lock, MessageCircleHeart, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";

interface SignalCheckProps {
  gift: GiftRecommendation;
  sessionId: string;
  recipient: Recipient;
  occasion: string;
  currency: string;
  canUseSignalCheck: boolean;
  onCreditsChanged: () => void;
  recommendationIndex?: number;
  viewOnly?: boolean;
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
  recommendationIndex = 0,
  viewOnly = false,
}: SignalCheckProps) {
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["signal-checks", buildSignalCheckKey(sessionId, gift.name)], [gift.name, sessionId]);
  const previewText = gift.signal_interpretation?.trim() ?? "";
  const previewVisible = previewText.slice(0, 80);
  const previewBlurred = previewText.slice(80, 120);

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
    trackEvent("signal_check_run", {
      rec_index: recommendationIndex,
      plan: canUseSignalCheck ? "paid" : "locked",
      revision_number: latestCheck?.revision_number ?? 1,
    });

    if (!canUseSignalCheck) {
      setUpgradeOpen(true);
      return;
    }

    void signalMutation.mutateAsync(undefined);
  };

  const runFollowUp = () => {
    const trimmed = followUpPrompt.trim();
    if (!trimmed) return;
    trackEvent("signal_check_follow_up", {
      rec_index: recommendationIndex,
      plan: canUseSignalCheck ? "paid" : "locked",
      revision_number: (latestCheck?.revision_number ?? 0) + 1,
    });
    void signalMutation.mutateAsync(trimmed);
  };

  const isLoading = signalMutation.isPending || signalChecksQuery.isLoading;

  if (viewOnly && !latestCheck) {
    return previewText ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
          Signal Check
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>&quot;{previewText.slice(0, 200)}...&quot;</p>
        </div>
      </div>
    ) : null;
  }

  if (!canUseSignalCheck && !latestCheck) {
    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
            Signal Check
          </div>
          {previewText ? (
            <div
              className="relative cursor-pointer rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground"
              onClick={() => {
                trackEvent("signal_check_preview_clicked", {
                  rec_index: recommendationIndex,
                  plan: "locked",
                });
                setUpgradeOpen(true);
              }}
              role="button"
              aria-label="Preview of Signal Check analysis. Upgrade to Confident to unlock."
            >
              <p>
                <span>&quot;{previewVisible}</span>
                <span className="blur-[3px] select-none" aria-hidden="true">{previewBlurred}</span>
                <span>...&quot;</span>
              </p>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-muted/40 to-transparent"
                aria-hidden="true"
              />
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            onClick={() => {
              trackEvent("signal_check_upgrade_clicked", {
                rec_index: recommendationIndex,
                current_plan: "locked",
              });
              setUpgradeOpen(true);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4" strokeWidth={1.5} />
              Unlock full Signal Check
            </span>
            Confident 🎯
          </Button>
        </div>
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          highlightPlan="confident"
          reason="Signal Check is available on Confident and Gifting Pro plans."
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {!latestCheck ? (
          <div className="space-y-3">
            {previewText ? (
              <div className="rounded-xl border border-border/40 bg-muted/10 p-3 text-sm text-muted-foreground">
                <p className="italic">&quot;{previewText.slice(0, 200)}...&quot;</p>
                <p className="mt-1 text-xs">Full analysis uses 0.5 credits.</p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={runInitialCheck}
              disabled={isLoading}
            >
              <span className="inline-flex items-center gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <MessageCircleHeart className="h-4 w-4" strokeWidth={1.5} />}
                Signal Check
              </span>
              {isLoading ? "Analyzing..." : "See what this gift says"}
            </Button>
          </div>
        ) : null}

        {latestCheck ? (
          <Card className="border-[#EDD896] bg-[linear-gradient(135deg,#FAF5E8_0%,#F5E9C9_100%)] shadow-sm" padding="none">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[#6F5326]">
                  <Sparkles className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
                  Signal Check
                </div>
                <Badge variant="primary">Revision {latestCheck.revision_number}</Badge>
                {checks.length > 1 ? <Badge variant="primary">{checks.length} saved reads</Badge> : null}
              </div>

              <div className="space-y-2">
                {latestCheck.result.positive_signals.map((signal) => (
                  <div key={signal} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#3E8E7E]" strokeWidth={1.5} />
                    <p className="text-sm text-foreground">{signal}</p>
                  </div>
                ))}
              </div>

              {latestCheck.result.potential_risks.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-[#E8D3C8] bg-[#FFF6F4] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9A4B47]">Potential risks</p>
                  {latestCheck.result.potential_risks.map((risk) => (
                    <div key={risk} className="flex items-start gap-2">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-[#C25450]" strokeWidth={1.5} />
                      <p className="text-sm text-[#7A3B38]">{risk}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {latestCheck.result.adjustment_suggestions.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">How to tune it</p>
                  {latestCheck.result.adjustment_suggestions.map((suggestion) => (
                    <p key={suggestion} className="text-sm text-indigo-900">
                      {suggestion}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{latestCheck.result.overall_message}</p>
                <p className="text-sm text-muted-foreground">{latestCheck.result.confidence_note}</p>
              </div>

              {!viewOnly ? (
                <div className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-3">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Wand2 className="h-3.5 w-3.5" strokeWidth={1.5} />
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
                    <Button type="button" size="sm" variant="outline" onClick={runFollowUp} disabled={signalMutation.isPending || !followUpPrompt.trim()}>
                      {signalMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
                      Refine
                    </Button>
                  </div>
                </div>
              ) : null}

              {checks.length > 1 ? (
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
                              <Badge variant="primary">Revision {check.revision_number}</Badge>
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
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan="confident"
        reason="Signal Check is available on Confident and Gifting Pro plans."
      />
    </>
  );
}
