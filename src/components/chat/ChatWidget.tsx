import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, ExternalLink, Gift, Loader2, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFlag } from "@/hooks/useAppSettings";
import { getOutboundProductUrl, type ProductLink } from "@/lib/productLinks";
import { trackEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

type ChatSurface = "landing" | "dashboard" | "blog";

type ChatSlots = {
  recipient_relationship: string | null;
  occasion: string | null;
  budget_min: number | null;
  budget_max: number | null;
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
  status: "clarifying" | "results_shown" | "signup_gate";
  assistant_message: string;
  slots: ChatSlots;
  cards?: ChatGiftCard[];
  guest_gate?: boolean;
};

type ChatMessage =
  | { id: string; role: "assistant" | "user"; text: string }
  | { id: string; role: "assistant"; text: string; cards: ChatGiftCard[]; gate?: boolean };

interface ChatWidgetProps {
  surface: ChatSurface;
  defaultOpen?: boolean;
  compact?: boolean;
  className?: string;
}

function getGuestId() {
  const key = "giftmind_guest_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function formatMoney(min: number, max: number) {
  if (min === max) return `$${max}`;
  return `$${min}-${max}`;
}

function slotSummary(slots: ChatSlots | null) {
  if (!slots) return "";
  const parts = [
    slots.recipient_relationship,
    slots.occasion?.replace(/_/g, " "),
    slots.budget_max ? formatMoney(slots.budget_min || Math.max(1, Math.round(slots.budget_max * 0.6)), slots.budget_max) : null,
    slots.interests?.[0],
  ].filter(Boolean);
  return parts.join(" · ");
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
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{formatMoney(card.estimated_price.min, card.estimated_price.max)}</span>
          <span>{card.citations.length} citation{card.citations.length === 1 ? "" : "s"}</span>
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
  const enabled = useFlag("feature_chat_finder", false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [slots, setSlots] = useState<ChatSlots | null>(null);
  const [loading, setLoading] = useState(false);
  const [guestGate, setGuestGate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const sendMessage = async (text = input) => {
    const clean = text.trim();
    if (!clean || loading) return;
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
        },
      });

      if (error) throw error;
      if (!data) throw new Error("No chat response");

      setThreadId(data.thread_id);
      setSlots(data.slots);
      setGuestGate(Boolean(data.guest_gate || data.status === "signup_gate"));

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
      const message = error instanceof Error ? error.message : "Gift chat failed";
      toast.error(message);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "I'm having trouble right now. The full form is still available and more reliable." }]);
      trackEvent("chat_error_shown", { thread_id: threadId, error_code: message });
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

  const drawer = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask GiftMind
            </SheetTitle>
            <Button type="button" variant="ghost" size="sm" onClick={openWizard}>Use full form</Button>
          </div>
          {slotSummary(slots) ? <div className="text-left text-xs text-muted-foreground">{slotSummary(slots)}</div> : null}
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 px-4 py-4" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-background",
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
                Searching across gift ideas and stores...
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
              placeholder="Gift for my dad, loves fishing, around $80..."
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
  const enabled = useFlag("feature_chat_finder", false);
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
