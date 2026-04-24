import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import SoftPaywall from "@/components/credits/SoftPaywall";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import type { GiftRecommendation, Recipient } from "@/hooks/useGiftSession";
import { getAccessToken, getFunctionErrorDetails } from "@/hooks/giftSessionShared";
import { formatCreditsValue } from "@/lib/credits";
import { buildSignalCheckKey, parseSignalCheckResult, parseSignalChecks } from "@/lib/signalCheck";
import { trackEvent } from "@/lib/posthog";
import { Check, Loader2, Lock, MessageCircleHeart, Sparkles, Wand2, X } from "lucide-react";

interface SignalCheckProps {
  gift: GiftRecommendation;
  sessionId: string;
  recipient: Recipient;
  occasion: string;
  currency: string;
  canUseSignalCheck: boolean;
  isSignalCheckEnabled?: boolean;
  signalCheckCost?: number;
  onCreditsChanged: (nextBalance?: number | null) => void;
  recommendationIndex?: number;
  viewOnly?: boolean;
}

interface SignalCheckSuccessResponse {
  success: true;
  signal_check_id?: string | null;
  revision_number: number;
  credits_remaining?: number | null;
  reused_saved_result?: boolean;
  signal: unknown;
  _meta?: {
    provider?: string | null;
    credits_used?: number | null;
    latency_ms?: number | null;
    attempt?: number | null;
  };
}

interface SignalCheckErrorPayload {
  error?: string;
  message?: string;
  credits_refunded?: boolean;
  credits_remaining?: number | null;
  remaining?: number | null;
}

const SUGGESTED_FOLLOW_UPS = [
  "Make this less romantic",
  "Make this more premium",
  "Make this feel more playful",
] as const;

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

function formatCreditAmount(amount: number) {
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(1).replace(/\.0$/, "");
}

function buildLoadingMessages(recipient: Recipient, occasion: string) {
  const formattedOccasion = occasion.replace(/_/g, " ");
  return [
    `Reading relationship signals for ${recipient.name}...`,
    `Considering your ${recipient.relationship.replace(/_/g, " ")} with ${recipient.name}...`,
    `Assessing the tone for ${formattedOccasion}...`,
    "Weighing the cultural context...",
    "Finalizing the read...",
  ];
}

function extractCreditsRemaining(payload: SignalCheckErrorPayload | null | undefined) {
  if (typeof payload?.credits_remaining === "number") return payload.credits_remaining;
  if (typeof payload?.remaining === "number") return payload.remaining;
  return null;
}

class SignalCheckRequestError extends Error {
  code: string;
  creditsRefunded: boolean;
  creditsRemaining: number | null;

  constructor(
    code: string,
    message: string,
    options?: { creditsRefunded?: boolean; creditsRemaining?: number | null },
  ) {
    super(message);
    this.name = "SignalCheckRequestError";
    this.code = code;
    this.creditsRefunded = Boolean(options?.creditsRefunded);
    this.creditsRemaining = options?.creditsRemaining ?? null;
  }
}

export default function SignalCheck({
  gift,
  sessionId,
  recipient,
  occasion,
  currency,
  canUseSignalCheck,
  isSignalCheckEnabled = true,
  signalCheckCost = 0.5,
  onCreditsChanged,
  recommendationIndex = 0,
  viewOnly = false,
}: SignalCheckProps) {
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [followUpSource, setFollowUpSource] = useState<"suggested" | "custom" | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [inlineError, setInlineError] = useState<SignalCheckRequestError | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [historyAccordionValue, setHistoryAccordionValue] = useState("");
  const [creditUsageNotice, setCreditUsageNotice] = useState<{
    used: number;
    remaining: number | null;
  } | null>(null);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["signal-checks", buildSignalCheckKey(sessionId, gift.name)],
    [gift.name, sessionId],
  );

  const previewText = gift.signal_interpretation?.trim() ?? "";
  const displayPreview =
    previewText ||
    `What does this gift say about your relationship with ${recipient.name}? Signal Check analyzes the relationship signal this gift sends.`;
  const previewVisible = displayPreview.slice(0, 80);
  const previewBlurred = displayPreview.slice(80, 120);
  const previewExcerpt = displayPreview.length > 200 ? `${displayPreview.slice(0, 200)}...` : displayPreview;
  const loadingMessages = useMemo(
    () => buildLoadingMessages(recipient, occasion),
    [occasion, recipient],
  );
  const signalCostLabel = formatCreditAmount(signalCheckCost);

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
    enabled: Boolean(sessionId) && isSignalCheckEnabled,
  });

  const checks = signalChecksQuery.data ?? [];
  const latestCheck = checks[checks.length - 1] ?? null;

  const signalMutation = useMutation({
    mutationFn: async (prompt?: string) => {
      if (!canUseSignalCheck) {
        throw new SignalCheckRequestError(
          "PLAN_RESTRICTED",
          "Signal Check is available on Confident and Gifting Pro plans.",
        );
      }

      const accessToken = await getAccessToken();
      const functions = supabase.functions;
      functions.setAuth(accessToken);

      const response = await functions.invoke<SignalCheckSuccessResponse>("signal-check", {
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
          // The current UI only refines from the latest read. Do not add arbitrary restore/edit
          // semantics until revisions become explicitly selectable in the UI.
          parent_signal_check_id: prompt ? latestCheck?.id ?? undefined : undefined,
        },
      });

      if (response.error) {
        const details = await getFunctionErrorDetails(response.error);
        const payload =
          details.payload && typeof details.payload === "object"
            ? details.payload as SignalCheckErrorPayload
            : null;

        throw new SignalCheckRequestError(
          payload?.error || "SIGNAL_CHECK_FAILED",
          payload?.message || details.message || "Signal Check failed",
          {
            creditsRefunded: Boolean(payload?.credits_refunded),
            creditsRemaining: extractCreditsRemaining(payload),
          },
        );
      }

      if (!response.data?.success) {
        const payload = response.data as unknown as SignalCheckErrorPayload;
        throw new SignalCheckRequestError(
          payload?.error || "SIGNAL_CHECK_FAILED",
          payload?.message || payload?.error || "Signal Check failed",
          {
            creditsRefunded: Boolean(payload?.credits_refunded),
            creditsRemaining: extractCreditsRemaining(payload),
          },
        );
      }

      return response.data;
    },
    onSuccess: (data) => {
      const parsedSignal = parseSignalCheckResult(data.signal);
      queryClient.invalidateQueries({ queryKey });
      setInlineError(null);
      setFollowUpPrompt("");
      setFollowUpSource(null);
      onCreditsChanged(data.credits_remaining ?? null);

      if (!data.reused_saved_result && data._meta?.credits_used) {
        setCreditUsageNotice({
          used: data._meta.credits_used,
          remaining: data.credits_remaining ?? null,
        });
      }

      trackEvent("signal_check_success", {
        rec_index: recommendationIndex,
        revision_number: data.revision_number,
        has_risks: Boolean(parsedSignal?.potential_risks.length),
        has_suggestions: Boolean(parsedSignal?.adjustment_suggestions.length),
        latency_ms: data._meta?.latency_ms ?? null,
        provider: data._meta?.provider ?? null,
      });
    },
    onError: (error) => {
      const normalized =
        error instanceof SignalCheckRequestError
          ? error
          : new SignalCheckRequestError("SIGNAL_CHECK_FAILED", "Signal Check failed");

      if (normalized.code === "PLAN_RESTRICTED") {
        setUpgradeOpen(true);
        return;
      }

      setInlineError(normalized);

      if (normalized.creditsRemaining != null) {
        onCreditsChanged(normalized.creditsRemaining);
      }

      trackEvent("signal_check_error", {
        rec_index: recommendationIndex,
        error_type: normalized.code,
        credits_refunded: normalized.creditsRefunded,
      });
    },
  });

  useEffect(() => {
    if (!signalMutation.isPending || latestCheck) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % loadingMessages.length);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [latestCheck, loadingMessages.length, signalMutation.isPending]);

  useEffect(() => {
    if (!creditUsageNotice) return;

    const timeout = window.setTimeout(() => setCreditUsageNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [creditUsageNotice]);

  const isBootstrapping = signalChecksQuery.isLoading && checks.length === 0;
  const isAnalyzingInitial = signalMutation.isPending && !latestCheck;

  const openUpgradeModal = (eventName: "signal_check_preview_clicked" | "signal_check_upgrade_clicked") => {
    trackEvent(eventName, {
      rec_index: recommendationIndex,
      current_plan: "locked",
      plan: "locked",
    });
    setUpgradeOpen(true);
  };

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

    setInlineError(null);
    void signalMutation.mutateAsync(undefined);
  };

  const runFollowUp = () => {
    const trimmed = followUpPrompt.trim();
    if (!trimmed) return;

    trackEvent("signal_check_follow_up", {
      rec_index: recommendationIndex,
      revision_number: (latestCheck?.revision_number ?? 0) + 1,
      prompt_type: followUpSource ?? "custom",
    });

    setInlineError(null);
    void signalMutation.mutateAsync(trimmed);
  };

  if (!isSignalCheckEnabled) {
    return null;
  }

  if (viewOnly && !latestCheck) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
          Signal Check
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>{previewExcerpt}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {!latestCheck && !canUseSignalCheck ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
              Signal Check
            </div>

            <button
              type="button"
              className="hidden w-full rounded-2xl border border-border/60 bg-muted/20 p-4 text-left text-sm text-muted-foreground sm:block"
              onClick={() => openUpgradeModal("signal_check_preview_clicked")}
              aria-label={`Preview Signal Check for ${recipient.name}`}
            >
              <p>
                <span>{previewVisible}</span>
                {previewBlurred ? (
                  <span className="blur-[3px] select-none" aria-hidden="true">
                    {previewBlurred}
                  </span>
                ) : null}
                {displayPreview.length > 120 ? "..." : null}
              </p>
            </button>

            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full justify-between"
              onClick={() => openUpgradeModal("signal_check_upgrade_clicked")}
            >
              <span className="inline-flex items-center gap-2">
                <Lock className="h-4 w-4" strokeWidth={1.5} />
                See what this says about {recipient.name}
              </span>
              <span className="text-xs text-muted-foreground">Confident 🎯</span>
            </Button>
          </div>
        ) : null}

        {!latestCheck && canUseSignalCheck ? (
          <div className="space-y-3">
            {isAnalyzingInitial ? (
              <Card className="border-[#EDD896] bg-[linear-gradient(135deg,#FAF5E8_0%,#F5E9C9_100%)] shadow-sm" padding="none">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#6F5326]">
                    <MessageCircleHeart className="h-4 w-4 text-[#D4A04A]" strokeWidth={1.5} />
                    Signal Check
                  </div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                    Analyzing...
                  </div>
                  <p className="text-sm text-muted-foreground">{loadingMessages[loadingMessageIndex]}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-sm text-muted-foreground">
                  <p className="italic">&quot;{previewExcerpt}&quot;</p>
                  <p className="mt-2 text-xs">Full analysis uses {signalCostLabel} credits.</p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full justify-between"
                  onClick={runInitialCheck}
                  disabled={signalMutation.isPending || isBootstrapping}
                >
                  <span className="inline-flex items-center gap-2">
                    {isBootstrapping ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <MessageCircleHeart className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    See what this says about {recipient.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{signalCostLabel} credits</span>
                </Button>
              </>
            )}

            {inlineError ? (
              inlineError.code === "NO_CREDITS" ? (
                <SoftPaywall compact title={inlineError.message} />
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <p>{inlineError.message}</p>
                </div>
              )
            ) : null}
          </div>
        ) : null}

        <AnimatePresence>
          {latestCheck ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6F5326]">Relationship read</p>
                    <p className="text-sm font-medium text-foreground">{latestCheck.result.overall_message}</p>
                    <p className="text-sm text-muted-foreground">{latestCheck.result.confidence_note}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6F5326]">Positive signals</p>
                    {latestCheck.result.positive_signals.map((signal, index) => (
                      <motion.div
                        key={signal}
                        className="flex items-start gap-2"
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.2 }}
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#3E8E7E]" strokeWidth={1.5} />
                        <p className="text-sm text-foreground">{signal}</p>
                      </motion.div>
                    ))}
                  </div>

                  {latestCheck.result.potential_risks.length > 0 ? (
                    <motion.div
                      className="space-y-2 rounded-xl border border-[#E8D3C8] bg-[#FFF6F4] p-3"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#9A4B47]">Potential risks</p>
                      {latestCheck.result.potential_risks.map((risk) => (
                        <div key={risk} className="flex items-start gap-2">
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-[#C25450]" strokeWidth={1.5} />
                          <p className="text-sm text-[#7A3B38]">{risk}</p>
                        </div>
                      ))}
                    </motion.div>
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
                            onClick={() => {
                              setFollowUpPrompt(prompt);
                              setFollowUpSource("suggested");
                            }}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        value={followUpPrompt}
                        onChange={(event) => {
                          setFollowUpPrompt(event.target.value.slice(0, 240));
                          setFollowUpSource("custom");
                        }}
                        rows={3}
                        maxLength={240}
                        placeholder='Ask a follow-up like "make this less romantic" or "make this more premium".'
                      />

                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <p>Each follow-up saves a new revision and uses {signalCostLabel} credits.</p>
                        <p>{followUpPrompt.length}/240</p>
                      </div>

                      {inlineError ? (
                        inlineError.code === "NO_CREDITS" ? (
                          <SoftPaywall compact title={inlineError.message} />
                        ) : (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            <p>{inlineError.message}</p>
                          </div>
                        )
                      ) : null}

                      <div className="flex items-center justify-end gap-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={runFollowUp}
                          disabled={signalMutation.isPending || !followUpPrompt.trim()}
                        >
                          {signalMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                          ) : null}
                          Refine
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {checks.length > 1 ? (
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full"
                      value={historyAccordionValue}
                      onValueChange={(value) => {
                        setHistoryAccordionValue(value);
                        if (value === "history") {
                          trackEvent("signal_check_history_viewed", {
                            revision_count: checks.length,
                          });
                        }
                      }}
                    >
                      <AccordionItem value="history" className="border-border/60">
                        <AccordionTrigger className="min-h-11 text-sm">Revision History</AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          {checks
                            .slice()
                            .reverse()
                            .map((check) => (
                              <div key={check.id} className="rounded-xl border border-border/60 bg-background/70 p-3 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="primary">Revision {check.revision_number}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {check.follow_up_prompt ? check.follow_up_prompt : "Original read"}
                                  </span>
                                  {formatTimestamp(check.created_at) ? (
                                    <span className="text-xs text-muted-foreground">
                                      {formatTimestamp(check.created_at)}
                                    </span>
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {creditUsageNotice ? (
            <motion.p
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {formatCreditAmount(creditUsageNotice.used)} credits used
              {creditUsageNotice.remaining != null ? ` · ${formatCreditsValue(creditUsageNotice.remaining)} remaining` : ""}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan="confident"
        reason="Signal Check: see what your gift says about the relationship"
      />
    </>
  );
}
