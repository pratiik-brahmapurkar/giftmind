import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, ExternalLink, Gift, Loader2, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppSettings } from "@/hooks/useAppSettings";
import { getAccessToken, getFunctionErrorDetails } from "@/hooks/giftSessionShared";
import type { GiftRecommendation, GiftSessionState } from "@/hooks/giftSessionTypes";
import { getOutboundProductUrl, type ProductLink, type ProductResult } from "@/lib/productLinks";
import { trackEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

type ChatSurface = "landing" | "dashboard" | "blog";

type ChatSlots = {
  recipient_relationship: string | null;
  occasion: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  interests: string[];
  age_band: string | null;
  country: string | null;
};

type ChatGiftCard = {
  id: string;
  title: string;
  blurb: string;
  confidence: number;
  estimated_price: { min: number; max: number; currency: string };
  why_it_fits: string[];
  citations: string[];
  store_links: ProductLink[];
};

type ChatTurnResponse = {
  thread_id: string;
  session_id?: string | null;
  status: "clarifying" | "ready" | "results_shown" | "signup_gate";
  assistant_message: string;
  slots: ChatSlots;
  cards?: ChatGiftCard[];
  guest_gate?: boolean;
};

type ChatMessage =
  | { id: string; role: "assistant" | "user"; text: string }
  | { id: string; role: "assistant"; text: string; cards: ChatGiftCard[]; gate?: boolean };

type ChatRecipientChip = {
  id: string;
  name: string;
  relationship: string | null;
  interests: string[] | null;
  age_range: string | null;
  gender: string | null;
  cultural_context: string | null;
  country: string | null;
};

type RecommendationStatusResponse = {
  session_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  recommendations: GiftRecommendation[] | null;
  product_results: GiftSessionState["productResults"];
  occasion_insight: string | null;
  budget_assessment: string | null;
  cultural_note: string | null;
  meta?: {
    engine_version?: string | null;
    avg_personalization_score?: number | null;
    cultural_rules_applied?: number | null;
    past_gifts_checked?: number | null;
  } | null;
  error?: {
    code: string;
    message: string;
  } | null;
};

interface ChatWidgetProps {
  surface: ChatSurface;
  defaultOpen?: boolean;
  compact?: boolean;
  className?: string;
}

const QUICK_PROMPTS = [
  "Birthday gift for dad around $80",
  "Anniversary ideas under $75",
  "Teacher thank-you gift around $50",
];

function getGuestId() {
  const key = "giftmind_guest_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function formatMoney(min: number, max: number, currency = "USD") {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    if (min === max) return formatter.format(max);
    return `${formatter.format(min)}-${formatter.format(max)}`;
  } catch {
    if (min === max) return `${currency} ${max}`;
    return `${currency} ${min}-${max}`;
  }
}

function slotSummary(slots: ChatSlots | null) {
  if (!slots) return "";
  const parts = [
    slots.recipient_relationship,
    slots.occasion?.replace(/_/g, " "),
    slots.budget_max ? formatMoney(slots.budget_min || Math.max(1, Math.round(slots.budget_max * 0.6)), slots.budget_max, slots.currency || "USD") : null,
    slots.interests?.[0],
  ].filter(Boolean);
  return parts.join(" · ");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchApiJson<TResponse>(path: string, init: RequestInit, accessToken: string) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: string }).message)
        : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as TResponse;
}

function hasEngineReadySlots(nextSlots: ChatSlots) {
  return Boolean(nextSlots.occasion && nextSlots.budget_max);
}

function normalizeBudget(slots: ChatSlots) {
  const max = Math.max(1, Math.round(slots.budget_max || 75));
  const min = Math.max(1, Math.round(slots.budget_min || Math.max(1, max * 0.6)));
  return { min: Math.min(min, max), max };
}

function countryForCurrency(currency: string | null | undefined) {
  const map: Record<string, string> = {
    INR: "IN",
    PKR: "PK",
    EUR: "DE",
    GBP: "GB",
    CAD: "CA",
    AUD: "AU",
    AED: "AE",
    SGD: "SG",
    JPY: "JP",
    USD: "US",
  };
  return currency ? map[currency] ?? null : null;
}

function compactUnique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

function productsForRecommendation(recommendation: GiftRecommendation, productResults: ProductResult[] | null) {
  const match = productResults?.find((result) => result.gift_name.toLowerCase() === recommendation.name.toLowerCase());
  return match?.products || [];
}

function priceRange(recommendation: GiftRecommendation, products: ProductLink[], slots: ChatSlots) {
  const prices = products
    .map((product) => product.price_amount)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  if (prices.length > 0) {
    return { min: Math.round(Math.min(...prices)), max: Math.round(Math.max(...prices)) };
  }
  if (recommendation.price_anchor) {
    const anchor = Math.round(recommendation.price_anchor);
    return { min: Math.max(1, Math.round(anchor * 0.8)), max: Math.max(anchor, Math.round(anchor * 1.2)) };
  }
  return normalizeBudget(slots);
}

function toChatGiftCards(status: RecommendationStatusResponse, slots: ChatSlots): ChatGiftCard[] {
  const productResults = status.product_results || null;
  return (status.recommendations || []).slice(0, 3).map((recommendation, index) => {
    const products = productsForRecommendation(recommendation, productResults);
    const range = priceRange(recommendation, products, slots);
    const citations = compactUnique([
      status.meta?.engine_version ? `Engine ${status.meta.engine_version}` : "Recommendation engine",
      recommendation.product_category,
      status.meta?.cultural_rules_applied ? `${status.meta.cultural_rules_applied} cultural rule checks` : null,
      status.meta?.past_gifts_checked ? `${status.meta.past_gifts_checked} past gift checks` : null,
    ]);

    return {
      id: `engine-${status.session_id}-${index}`,
      title: recommendation.name,
      blurb: recommendation.why_it_works || recommendation.description,
      confidence: Math.round(recommendation.confidence_score || recommendation.personalization_score || 80),
      estimated_price: { min: range.min, max: range.max, currency: slots.currency || products[0]?.price_currency || "USD" },
      why_it_fits: compactUnique([
        recommendation.signal_interpretation,
        recommendation.product_category,
        ...(recommendation.search_keywords || []).slice(0, 2),
      ]).slice(0, 3),
      citations,
      store_links: products,
    };
  });
}

function useChatFinderEnabled() {
  const { data } = useAppSettings(["feature_chat_finder"]);

  const configured = data?.feature_chat_finder;
  if (typeof configured === "boolean") return configured;
  return true;
}

function chatFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("chat finder is disabled")) {
    return "Ask GiftMind is disabled in settings. Enable feature_chat_finder in Admin Settings to use chat.";
  }
  if (normalized.includes("function not found") || normalized.includes("not found")) {
    return "Ask GiftMind is not deployed yet. Deploy the chat-turn Supabase function and run the chat migration.";
  }
  return message || "I'm having trouble right now. The full form is still available and more reliable.";
}

function GiftCardInline({ card, onProductClick }: { card: ChatGiftCard; onProductClick: (product: ProductLink) => void }) {
  const topProduct = card.store_links[0];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {topProduct?.image_url ? (
        <img src={topProduct.image_url} alt={topProduct.product_title || card.title} className="h-32 w-full object-cover" loading="lazy" />
      ) : null}
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold leading-snug">{card.title}</h3>
          <Badge className="shrink-0 bg-emerald-600 text-white">{card.confidence}%</Badge>
        </div>
        <p className="text-sm leading-5 text-muted-foreground">{card.blurb}</p>
        <div className="flex flex-wrap gap-1.5">
          {card.why_it_fits.slice(0, 3).map((reason) => (
            <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{reason}</span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-foreground">{formatMoney(card.estimated_price.min, card.estimated_price.max, card.estimated_price.currency)}</span>
          <span className="text-muted-foreground">{card.citations.length} citation{card.citations.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {card.store_links.map((product) => (
            <Button key={`${card.id}-${product.store_id}`} type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onProductClick(product)}>
              {product.is_search_link ? "Browse" : "View"} {product.store_name}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatWidget({ surface, defaultOpen = false, compact = false, className }: ChatWidgetProps) {
  const enabled = useChatFinderEnabled();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [slots, setSlots] = useState<ChatSlots | null>(null);
  const [boundRecipient, setBoundRecipient] = useState<ChatRecipientChip | null>(null);
  const [loading, setLoading] = useState(false);
  const [guestGate, setGuestGate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: recipientChips = [] } = useQuery({
    queryKey: ["chat-recipient-chips", user?.id],
    enabled: enabled && Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("recipients")
        .select("id,name,relationship,interests,age_range,gender,cultural_context,country")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) {
        const details = await getFunctionErrorDetails(error);
        throw new Error(details.message);
      }
      return (data || []) as ChatRecipientChip[];
    },
  });

  const greeting = useMemo(() => {
    const name = user?.user_metadata?.full_name?.split(" ")[0];
    if (user && name) return `Welcome back, ${name}. Who are you gifting for?`;
    return "Hey, I'm GiftMind. Tell me who you're gifting for and I'll find ideas. Free first try, no signup needed.";
  }, [user]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", text: greeting },
  ]);

  useEffect(() => {
    setMessages((current) => current[0]?.id === "greeting" ? [{ id: "greeting", role: "assistant", text: greeting }, ...current.slice(1)] : current);
  }, [greeting]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, loading]);

  useEffect(() => {
    if (!open) return;
    trackEvent("chat_widget_opened", {
      surface,
      auth_state: user ? "authenticated" : "guest",
      source_url: window.location.pathname,
    });
  }, [open, surface, user]);

  if (!enabled) return null;

  const runRecommendationEngine = async (recipient: ChatRecipientChip, nextSlots: ChatSlots, sourceMessage: string, nextThreadId: string) => {
    if (!user) throw new Error("Sign in to use saved recipient recommendations.");

    const budget = normalizeBudget(nextSlots);
    const currency = nextSlots.currency || "USD";
    const contextTags = compactUnique([...(nextSlots.interests || []), ...(recipient.interests || [])]);
    const occasion = nextSlots.occasion || "just_because";
    const recipientCountry = recipient.country || nextSlots.country || countryForCurrency(currency) || "US";
    const specialContext = compactUnique([
      `Chat request: ${sourceMessage}`,
      recipient.relationship ? `Relationship: ${recipient.relationship}` : null,
      recipient.age_range ? `Age range: ${recipient.age_range}` : null,
      recipient.gender ? `Gender: ${recipient.gender}` : null,
      recipient.cultural_context ? `Cultural context: ${recipient.cultural_context}` : null,
      contextTags.length ? `Interests: ${contextTags.join(", ")}` : null,
    ]).join(". ");

    const { data: session, error: sessionError } = await supabase
      .from("gift_sessions")
      .insert({
        user_id: user.id,
        recipient_id: recipient.id,
        recipient_country: recipientCountry,
        occasion,
        occasion_date: null,
        budget_min: budget.min,
        budget_max: budget.max,
        currency,
        special_context: specialContext,
        context_tags: contextTags,
        status: "active",
        source: "chat",
        chat_thread_id: nextThreadId,
      } as never)
      .select("id")
      .single();

    if (sessionError) throw sessionError;

    const accessToken = await getAccessToken();
    const actionId = `${session.id}:chat_retrieval:0`;
    trackEvent("chat_retrieval_started", {
      thread_id: nextThreadId,
      session_id: session.id,
      recipient_id: recipient.id,
      engine_version: "v2",
    });

    await fetchApiJson<{ session_id: string; status: string }>("/api/recommend/start", {
      method: "POST",
      body: JSON.stringify({
        session_id: session.id,
        recipient_id: recipient.id,
        occasion,
        occasion_date: null,
        budget_min: budget.min,
        budget_max: budget.max,
        currency,
        recipient_country: recipientCountry,
        user_country: "US",
        special_context: specialContext,
        context_tags: contextTags,
        user_plan: "spark",
        is_regeneration: false,
        action_id: actionId,
        source: "chat",
        chat_thread_id: nextThreadId,
      }),
    }, accessToken);

    let status: RecommendationStatusResponse | null = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      status = await fetchApiJson<RecommendationStatusResponse>(
        `/api/recommend/status?session_id=${encodeURIComponent(session.id)}`,
        { method: "GET" },
        accessToken,
      );
      if (status.status === "completed" || status.status === "failed") break;
      await sleep(attempt < 6 ? 1000 : 2000);
    }

    if (!status || status.status !== "completed") {
      throw new Error(status?.error?.message || "Recommendation engine is still working. Try the full form if results do not appear.");
    }

    const cards = toChatGiftCards(status, nextSlots);
    if (!cards.length) throw new Error("No recommendation cards returned.");

    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `I used the full recommendation engine for ${recipient.name}, including saved profile context and gift history checks.`,
      cards,
    }]);
    trackEvent("chat_results_rendered", {
      thread_id: nextThreadId,
      session_id: session.id,
      n_cards: cards.length,
      citations_count: cards.reduce((sum, card) => sum + card.citations.length, 0),
      engine_version: status.meta?.engine_version || "v2",
    });
  };

  const sendMessage = async (text = input, options?: { recipient?: ChatRecipientChip | null }) => {
    const clean = text.trim();
    if (!clean || loading) return;
    const activeRecipient = options?.recipient ?? boundRecipient;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    setLoading(true);
    trackEvent("chat_message_sent", {
      thread_id: threadId,
      turn_index: messages.filter((message) => message.role === "user").length + 1,
      char_len: clean.length,
      slots_filled: slots ? slotSummary(slots).split(" · ").filter(Boolean).length : 0,
    });

    try {
      const { data, error } = await supabase.functions.invoke<ChatTurnResponse>("chat-turn", {
        body: {
          thread_id: threadId,
          guest_id: user ? null : getGuestId(),
          message: clean,
          source_surface: surface,
          slots,
          intake_only: Boolean(user && activeRecipient),
        },
      });

      if (error) throw error;
      if (!data) throw new Error("No chat response");

      setThreadId(data.thread_id);
      setSlots(data.slots);
      setGuestGate(Boolean(data.guest_gate || data.status === "signup_gate"));

      if (user && activeRecipient && hasEngineReadySlots(data.slots)) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Got it. Running the full recommendation engine for ${activeRecipient.name} now.`,
        }]);
        await runRecommendationEngine(activeRecipient, data.slots, clean, data.thread_id);
        return;
      }

      if (data.cards?.length) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.assistant_message,
          cards: data.cards || [],
          gate: Boolean(data.guest_gate || data.status === "signup_gate"),
        }]);
        trackEvent("chat_results_rendered", {
          thread_id: data.thread_id,
          n_cards: data.cards.length,
          citations_count: data.cards.reduce((sum, card) => sum + card.citations.length, 0),
        });
      } else {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.assistant_message }]);
        if (data.status === "clarifying") {
          trackEvent("chat_clarifying_shown", { thread_id: data.thread_id });
        }
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Gift chat failed";
      const message = chatFailureMessage(rawMessage);
      toast.error(message);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: message }]);
      trackEvent("chat_error_shown", { thread_id: threadId, error_code: rawMessage });
    } finally {
      setLoading(false);
    }
  };

  const openWizard = () => {
    const params = new URLSearchParams();
    params.set("source", "chat");
    if (slots?.occasion) params.set("occasion", slots.occasion);
    if (slots?.budget_min) params.set("budget_min", String(slots.budget_min));
    if (slots?.budget_max) params.set("budget_max", String(slots.budget_max));
    if (slots?.currency) params.set("currency", slots.currency);
    const context = [
      slots?.recipient_relationship ? `Gift for ${slots.recipient_relationship}` : null,
      slots?.interests?.length ? `Interests: ${slots.interests.join(", ")}` : null,
      threadId ? `Chat thread: ${threadId}` : null,
    ].filter(Boolean).join(". ");
    if (context) params.set("context", context);
    navigate(`/gift-flow?${params.toString()}`);
  };

  const clickProduct = (product: ProductLink) => {
    trackEvent("chat_card_clicked", {
      thread_id: threadId,
      store: product.store_name,
    });
    const url = getOutboundProductUrl(product);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const hasInitialShortcuts = messages.length <= 1 && !loading && !(guestGate && !user);

  const drawer = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                Ask GiftMind
              </SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-left">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {boundRecipient ? "Full engine" : user ? "Saved people ready" : "Free preview"}
                </Badge>
                {slots?.currency ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{slots.currency}</Badge> : null}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={openWizard}>Use full form</Button>
          </div>
          {slotSummary(slots) || boundRecipient ? (
            <div className="text-left text-xs text-muted-foreground">
              {[boundRecipient ? `Saved person: ${boundRecipient.name}` : null, slotSummary(slots)].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 px-4 py-4" aria-live="polite">
          {hasInitialShortcuts ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Try a quick start</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button key={prompt} type="button" size="sm" variant="outline" className="h-auto rounded-full px-3 py-1.5 text-xs" onClick={() => void sendMessage(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {user && recipientChips.length > 0 && messages.length <= 1 ? (
            <div className="rounded-xl border bg-background p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Use a saved person</p>
              <div className="flex flex-wrap gap-2">
                {recipientChips.map((recipient) => (
                  <Button
                    key={recipient.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBoundRecipient(recipient);
                      const context = [
                        `Gift for ${recipient.name}`,
                        recipient.relationship ? `relationship: ${recipient.relationship}` : null,
                        recipient.interests?.length ? `interests: ${recipient.interests.join(", ")}` : null,
                      ].filter(Boolean).join(", ");
                      void sendMessage(context, { recipient });
                    }}
                  >
                    {recipient.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[88%] px-3 py-2 text-sm shadow-sm",
                message.role === "user"
                  ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-2xl rounded-bl-md border bg-background",
              )}>
                <p className="whitespace-pre-wrap leading-5">{message.text}</p>
                {"cards" in message ? (
                  <div className="mt-3 space-y-3">
                    {message.cards.map((card) => <GiftCardInline key={card.id} card={card} onProductClick={clickProduct} />)}
                    {message.gate ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                        <p className="font-medium">That's your free preview.</p>
                        <p className="mt-1 text-xs">Sign up free to keep chatting, save ideas, and get monthly credits.</p>
                        <div className="mt-3 flex gap-2">
                          <Button asChild size="sm"><Link to="/signup">Sign up</Link></Button>
                          <Button asChild size="sm" variant="outline"><Link to="/login">Log in</Link></Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {boundRecipient ? "Running the full recommendation engine..." : "Searching across gift ideas and stores..."}
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t bg-background p-3">
          {guestGate && !user ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <span>Sign up to continue after your free preview.</span>
              <Button asChild size="sm"><Link to="/signup">Save free</Link></Button>
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Gift for dad, loves fishing, around ₹3000..."
              disabled={loading || (guestGate && !user)}
              aria-label="Ask GiftMind"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading || (guestGate && !user)} aria-label="Send chat message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">Your messages help find gifts. We do not sell your data.</p>
        </div>
      </SheetContent>
    </Sheet>
  );

  if (compact) {
    return (
      <div className={className}>
        <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => setOpen(true)}>
          <MessageSquare className="h-4 w-4" />
          Ask GiftMind
        </Button>
        {drawer}
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        className={cn("fixed bottom-5 right-5 z-40 h-14 rounded-full px-5 shadow-lg", className)}
        onClick={() => setOpen(true)}
      >
        {open ? <X className="mr-2 h-5 w-5" /> : <Bot className="mr-2 h-5 w-5" />}
        Ask GiftMind
      </Button>
      {drawer}
    </>
  );
}

export function AskGiftMindCard() {
  const enabled = useChatFinderEnabled();
  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <Gift className="h-4 w-4" />
            Ask GiftMind
          </p>
          <p className="mt-1 text-sm text-amber-900">Type one sentence and get gift ideas without stepping through the full form.</p>
        </div>
        <ChatWidget surface="dashboard" compact className="sm:w-48" />
      </div>
    </div>
  );
}
