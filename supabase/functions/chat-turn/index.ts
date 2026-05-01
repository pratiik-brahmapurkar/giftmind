import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithFallback, getProviderChain, parseAIJson } from "../_shared/ai-providers.ts";
import { parseJsonBody, sanitizeString } from "../_shared/validate.ts";
import { DEFAULT_GIFT_GENERATION_UNITS, parseNumberSetting } from "../_shared/credits.ts";
import { loadSettings } from "../_shared/settings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatTurnRequest = {
  thread_id?: string | null;
  guest_id?: string | null;
  message: string;
  source_surface?: "landing" | "dashboard" | "blog";
  blog_post_slug?: string | null;
  slots?: Partial<ChatSlots> | null;
  intake_only?: boolean | null;
};

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

type GiftCard = {
  id: string;
  title: string;
  blurb: string;
  confidence: number;
  estimated_price: { min: number; max: number; currency: string };
  why_it_fits: string[];
  citations: string[];
  search_keywords: string[];
  product_category: string;
  store_links: ProductLink[];
};

type ProductLink = {
  store_id: string;
  store_name: string;
  domain: string;
  brand_color: string | null;
  gift_name: string;
  product_category: string;
  is_search_link: boolean;
  search_url?: string | null;
  product_url?: string | null;
  affiliate_url?: string | null;
  product_title?: string | null;
  image_url?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  stock_status?: string | null;
  attribution_label?: string | null;
  is_affiliate?: boolean | null;
};

type StoreRow = {
  store_id: string;
  store_name: string;
  domain: string;
  country_code: string;
  search_url: string;
  affiliate_param: string | null;
  brand_color: string | null;
  categories: string[] | null;
  priority: number | null;
  is_active: boolean | null;
};

type ProductRow = {
  id: string;
  store_id: string;
  country_code: string;
  product_title: string;
  product_url: string;
  affiliate_url: string | null;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  stock_status: string | null;
  product_category: string | null;
  keyword_tags: string[] | null;
  is_affiliate: boolean | null;
  priority: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CURRENCY_ALIASES: Array<[RegExp, string]> = [
  [/\b(inr|rs|rupees?)\b|₹/i, "INR"],
  [/\b(pkr|pakistani\s+rupees?)\b/i, "PKR"],
  [/\b(eur|euros?)\b|€/i, "EUR"],
  [/\b(gbp|pounds?|quid)\b|£/i, "GBP"],
  [/\b(cad|canadian\s+dollars?)\b/i, "CAD"],
  [/\b(aud|australian\s+dollars?)\b/i, "AUD"],
  [/\b(aed|dirhams?)\b/i, "AED"],
  [/\b(sgd|singapore\s+dollars?)\b/i, "SGD"],
  [/\b(jpy|yen)\b|¥/i, "JPY"],
  [/\b(usd|dollars?|bucks?)\b|\$/i, "USD"],
];

function parseCurrency(message: string) {
  return CURRENCY_ALIASES.find(([pattern]) => pattern.test(message))?.[1] ?? null;
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

function currencyPattern() {
  return String.raw`(?:₹|€|£|¥|\$|\b(?:usd|dollars?|bucks?|inr|rs|rupees?|pkr|pakistani\s+rupees?|eur|euros?|gbp|pounds?|quid|cad|aud|aed|dirhams?|sgd|jpy|yen)\b)`;
}

function parseMoney(value: string) {
  return Number(value.replace(/,/g, ""));
}

function parseBudget(message: string) {
  const currency = parseCurrency(message);
  const money = currencyPattern();
  const range = message.match(new RegExp(String.raw`(?:${money}\s*)?(\d{1,7}(?:,\d{2,3})*)\s*(?:-|to|–)\s*(?:${money}\s*)?(\d{1,7}(?:,\d{2,3})*)`, "i"));
  if (range) {
    const min = parseMoney(range[1]);
    const max = parseMoney(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min: Math.min(min, max), max: Math.max(min, max), currency };
  }

  const single = message.match(new RegExp(String.raw`(?:under|around|about|~|budget|for|less than)?\s*(?:${money}\s*)?(\d{2,7}(?:,\d{2,3})*)`, "i"));
  if (single) {
    const value = parseMoney(single[1]);
    if (Number.isFinite(value)) return { min: Math.max(1, Math.round(value * 0.65)), max: value, currency };
  }

  return { min: null, max: null, currency };
}

function extractSlots(message: string, previous?: Partial<ChatSlots> | null): ChatSlots {
  const text = message.toLowerCase();
  const budget = parseBudget(text);
  const relationship =
    ["mum", "mom", "mother"].some((token) => text.includes(token)) ? "mother" :
    ["dad", "father"].some((token) => text.includes(token)) ? "father" :
    ["wife", "husband", "partner", "girlfriend", "boyfriend"].find((token) => text.includes(token)) ||
    ["sister", "brother", "friend", "niece", "nephew", "teacher", "boss"].find((token) => text.includes(token)) ||
    previous?.recipient_relationship ||
    null;

  const occasion =
    text.includes("birthday") ? "birthday" :
    text.includes("anniversary") ? "anniversary" :
    text.includes("mother") && text.includes("day") ? "mothers_day" :
    text.includes("father") && text.includes("day") ? "fathers_day" :
    text.includes("wedding") ? "wedding" :
    text.includes("graduation") ? "graduation" :
    text.includes("housewarming") ? "housewarming" :
    text.includes("thank") ? "thank_you" :
    previous?.occasion ||
    null;

  const interests = [
    "fishing", "gardening", "cooking", "coffee", "tea", "books", "reading", "fitness", "music", "travel",
    "gaming", "minecraft", "art", "decor", "fashion", "skincare", "tech", "photography", "hiking",
  ].filter((interest) => text.includes(interest));

  const ageMatch = text.match(/\b(\d{1,3})(?:st|nd|rd|th)?\b/);
  const age = ageMatch ? Number(ageMatch[1]) : null;

  return {
    recipient_relationship: sanitizeString(relationship || "", 80) || null,
    occasion: sanitizeString(occasion || "", 80) || null,
    budget_min: budget.min ?? previous?.budget_min ?? null,
    budget_max: budget.max ?? previous?.budget_max ?? null,
    currency: budget.currency ?? previous?.currency ?? null,
    interests: Array.from(new Set([...(previous?.interests || []), ...interests])).slice(0, 8),
    age_band: age && age > 0 && age < 120 ? `${age}` : previous?.age_band || null,
    country: previous?.country || null,
  };
}

function hasEnoughSlots(slots: ChatSlots, message: string) {
  const filled = [
    slots.recipient_relationship,
    slots.occasion,
    slots.budget_max,
    slots.interests.length > 0 ? "interests" : null,
  ].filter(Boolean).length;
  return filled >= 3 || /show|ideas|recommend|find/i.test(message);
}

function fallbackCards(slots: ChatSlots): GiftCard[] {
  const interest = slots.interests[0] || "their hobbies";
  const max = slots.budget_max || 80;
  const min = slots.budget_min || Math.max(15, Math.round(max * 0.6));
  const currency = slots.currency || "USD";
  const relationship = slots.recipient_relationship || "recipient";
  return [
    {
      id: crypto.randomUUID(),
      title: `Premium ${interest} upgrade`,
      blurb: `A practical but thoughtful upgrade connected to ${relationship}'s interest in ${interest}.`,
      confidence: 84,
      estimated_price: { min, max, currency },
      why_it_fits: [`Matches ${interest}`, "Fits the stated budget", "Feels more personal than a generic gift"],
      citations: ["heuristic_interest_match"],
      search_keywords: [`${interest} gift`, `${relationship} ${interest}`],
      product_category: "hobbies",
      store_links: [],
    },
    {
      id: crypto.randomUUID(),
      title: "Personalised keepsake",
      blurb: "A keepsake adds emotional value without needing a highly specific product preference.",
      confidence: 78,
      estimated_price: { min: Math.max(10, min - 10), max, currency },
      why_it_fits: ["Works for personal occasions", "Easy to tailor", "Safe when preferences are still broad"],
      citations: ["occasion_playbook_general"],
      search_keywords: ["personalized gift", `${relationship} keepsake`],
      product_category: "personalized",
      store_links: [],
    },
    {
      id: crypto.randomUUID(),
      title: "Experience-led gift set",
      blurb: "A small bundle around an activity can feel curated and useful.",
      confidence: 74,
      estimated_price: { min, max, currency },
      why_it_fits: ["Creates an experience", "Flexible across stores", "Good fallback if sizing or taste is uncertain"],
      citations: ["gift_guide_bundle_strategy"],
      search_keywords: [`${interest} gift set`, "gift hamper"],
      product_category: "gift-set",
      store_links: [],
    },
  ];
}

function validateCards(parsed: unknown, slots: ChatSlots): GiftCard[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.gifts)) return fallbackCards(slots);

  const max = slots.budget_max || 80;
  const min = slots.budget_min || Math.max(15, Math.round(max * 0.6));
  const currency = slots.currency || "USD";
  const cards = parsed.gifts.slice(0, 3).map((raw): GiftCard | null => {
    if (!isRecord(raw)) return null;
    const title = sanitizeString(String(raw.title || raw.name || ""), 140);
    if (!title) return null;
    const why = Array.isArray(raw.why_it_fits) ? raw.why_it_fits.map((item) => sanitizeString(String(item), 160)).filter(Boolean) : [];
    const keywords = Array.isArray(raw.search_keywords) ? raw.search_keywords.map((item) => sanitizeString(String(item), 80)).filter(Boolean) : [title];
    const citations = Array.isArray(raw.citations) ? raw.citations.map((item) => sanitizeString(String(item), 120)).filter(Boolean) : [];
    return {
      id: crypto.randomUUID(),
      title,
      blurb: sanitizeString(String(raw.blurb || raw.description || ""), 240) || `A thoughtful fit for ${slots.recipient_relationship || "this recipient"}.`,
      confidence: Math.max(50, Math.min(96, Number(raw.confidence || raw.confidence_score || 75))),
      estimated_price: { min, max, currency },
      why_it_fits: why.length ? why.slice(0, 4) : ["Matches the gift brief"],
      citations: citations.length ? citations : ["chat_context"],
      search_keywords: keywords.slice(0, 5),
      product_category: sanitizeString(String(raw.product_category || "gift"), 80) || "gift",
      store_links: [],
    };
  }).filter((card): card is GiftCard => Boolean(card));

  return cards.length >= 3 ? cards : fallbackCards(slots);
}

async function generateCards(slots: ChatSlots, message: string, settings: Record<string, unknown>, plan: string) {
  const chain = getProviderChain(plan, "chat-finder", settings);
  const systemPrompt = [
    "You are GiftMind's concise gift recommender.",
    "Return strict JSON only: {\"gifts\":[{\"title\":\"\",\"blurb\":\"\",\"confidence\":85,\"why_it_fits\":[\"\"],\"citations\":[\"chat_context\"],\"search_keywords\":[\"\"],\"product_category\":\"\"}]}",
    "Return exactly 3 gifts. Every gift must fit the user's stated budget and currency. Every gift must include at least one citation id. Do not invent store names, prices, or stock.",
  ].join("\n");

  const userMessage = JSON.stringify({ latest_message: message, slots });
  const result = await callAIWithFallback(chain, {
    systemPrompt,
    userMessage,
    responseFormat: "json",
    temperature: 0.45,
    maxTokens: 1200,
  }, settings);

  return { cards: validateCards(parseAIJson(result.text), slots), ai: result };
}

async function enrichCards(cards: GiftCard[], targetCountry: string, guestLimited: boolean) {
  const { data: stores } = await supabaseAdmin
    .from("marketplace_config")
    .select("store_id,store_name,domain,country_code,search_url,affiliate_param,brand_color,categories,priority,is_active")
    .in("country_code", [targetCountry, "GLOBAL"])
    .eq("is_active", true)
    .order("priority", { ascending: true });

  const storeRows = (stores || []) as StoreRow[];
  const storeIds = storeRows.map((store) => store.store_id);
  const { data: products } = storeIds.length
    ? await supabaseAdmin
      .from("marketplace_products")
      .select("id,store_id,country_code,product_title,product_url,affiliate_url,image_url,price_amount,price_currency,stock_status,product_category,keyword_tags,is_affiliate,priority")
      .in("store_id", storeIds)
      .in("country_code", [targetCountry, "GLOBAL"])
      .eq("is_active", true)
      .order("priority", { ascending: true })
    : { data: [] };

  const productRows = (products || []) as ProductRow[];
  const maxStores = guestLimited ? 2 : 4;

  return cards.map((card) => {
    const terms = [card.title, ...card.search_keywords].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
    const links = storeRows.slice(0, maxStores).map((store): ProductLink => {
      const matched = productRows
        .filter((product) => product.store_id === store.store_id)
        .map((product) => {
          const haystack = `${product.product_title} ${(product.keyword_tags || []).join(" ")} ${product.product_category || ""}`.toLowerCase();
          return { product, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
        })
        .sort((a, b) => b.score - a.score || (a.product.priority || 0) - (b.product.priority || 0))[0]?.product;

      if (matched) {
        return {
          store_id: store.store_id,
          store_name: store.store_name,
          domain: store.domain,
          brand_color: store.brand_color,
          gift_name: card.title,
          product_category: card.product_category,
          is_search_link: false,
          product_url: matched.product_url,
          affiliate_url: matched.affiliate_url,
          product_title: matched.product_title,
          image_url: matched.image_url,
          price_amount: matched.price_amount,
          price_currency: matched.price_currency,
          stock_status: matched.stock_status,
          attribution_label: matched.is_affiliate ? "Affiliate" : "Catalog",
          is_affiliate: matched.is_affiliate,
        };
      }

      const keyword = encodeURIComponent(card.search_keywords[0] || card.title);
      return {
        store_id: store.store_id,
        store_name: store.store_name,
        domain: store.domain,
        brand_color: store.brand_color,
        gift_name: card.title,
        product_category: card.product_category,
        is_search_link: true,
        search_url: `${store.search_url}${keyword}${store.affiliate_param || ""}`,
        attribution_label: store.affiliate_param ? "Affiliate search" : "Search",
        is_affiliate: Boolean(store.affiliate_param),
      };
    });

    return { ...card, store_links: links };
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const settings = await loadSettings(supabaseAdmin);
    if (!asBoolean(settings.feature_chat_finder, false)) {
      return json({ error: "Chat finder is disabled" }, 403);
    }

    const parsed = await parseJsonBody<ChatTurnRequest>(req, json);
    if (parsed.response) return parsed.response;
    const body = parsed.data || {};
    const message = sanitizeString(body.message || "", 1500);
    if (message.length < 2) return json({ error: "Message is required" }, 400);

    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { data: authData } = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null } };
    const user = authData.user;
    const guestId = sanitizeString(body.guest_id || "", 120);
    if (!user && !guestId) return json({ error: "guest_id is required for guest chat" }, 400);

    const sourceSurface = body.source_surface || "landing";
    const previousSlots = body.slots || {};
    const slots = extractSlots(message, previousSlots);

    let threadId = sanitizeString(body.thread_id || "", 80);
    if (!threadId) {
      const { data: thread, error } = await supabaseAdmin
        .from("chat_threads")
        .insert({
          user_id: user?.id || null,
          guest_id: user ? null : guestId,
          source_surface: sourceSurface,
          blog_post_slug: body.blog_post_slug || null,
          slots,
        })
        .select("id")
        .single();
      if (error) throw error;
      threadId = thread.id;
    }

    await supabaseAdmin.from("chat_messages").insert({
      thread_id: threadId,
      role: "user",
      content: { text: message, slots },
    });

    if (!hasEnoughSlots(slots, message)) {
      const missing = !slots.recipient_relationship ? "who this is for" : !slots.occasion ? "the occasion" : "your rough budget";
      const reply = `Got it. Tell me ${missing}, and I can narrow this down fast.`;
      await supabaseAdmin.from("chat_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content: { text: reply, type: "clarifying" },
      });
      await supabaseAdmin.from("chat_threads").update({ slots, updated_at: new Date().toISOString() }).eq("id", threadId);
      return json({ thread_id: threadId, status: "clarifying", assistant_message: reply, slots });
    }

    if (body.intake_only) {
      const reply = "I have enough to run the full recommendation engine for this saved recipient.";
      await supabaseAdmin.from("chat_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content: { text: reply, type: "ready" },
      });
      await supabaseAdmin.from("chat_threads").update({ slots, updated_at: new Date().toISOString() }).eq("id", threadId);
      return json({ thread_id: threadId, status: "ready", assistant_message: reply, slots });
    }

    let guestWasAlreadyUsed = false;
    if (!user) {
      const { data: guestCredit } = await supabaseAdmin
        .from("guest_credits")
        .select("credit_used")
        .eq("guest_id", guestId)
        .maybeSingle();
      guestWasAlreadyUsed = Boolean(guestCredit?.credit_used);
      if (guestWasAlreadyUsed) {
        await supabaseAdmin.from("chat_threads").update({ status: "gated", updated_at: new Date().toISOString() }).eq("id", threadId);
        return json({ thread_id: threadId, status: "signup_gate", assistant_message: "That's your free preview. Sign up free to keep the conversation going and save your ideas.", slots });
      }
    }

    const startedAt = Date.now();
    const plan = user ? ((await supabaseAdmin.from("users").select("active_plan,country").eq("id", user.id).single()).data?.active_plan || "spark") : "spark";
    const userCountry = user ? ((await supabaseAdmin.from("users").select("country").eq("id", user.id).single()).data?.country || "US") : "US";
    const targetCountry = sanitizeString(slots.country || countryForCurrency(slots.currency) || userCountry || "US", 10).toUpperCase();

    let aiProvider: string | null = null;
    let aiLatencyMs: number | null = null;
    let cards: GiftCard[];
    try {
      const generated = await generateCards(slots, message, settings, plan);
      cards = generated.cards;
      aiProvider = generated.ai.provider;
      aiLatencyMs = generated.ai.latencyMs;
    } catch (error) {
      console.error("chat-turn AI failed, using deterministic fallback:", error);
      cards = fallbackCards(slots);
    }

    const enrichedCards = await enrichCards(cards, targetCountry, !user);
    const citationsCount = enrichedCards.reduce((sum, card) => sum + card.citations.length, 0);
    const chatUnits = Math.max(1, Math.floor(parseNumberSetting(settings.chat_retrieval_units, DEFAULT_GIFT_GENERATION_UNITS)));
    let sessionId: string | null = null;
    let remainingBalance: number | null = null;

    if (user) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("gift_sessions")
        .insert({
          user_id: user.id,
          recipient_id: null,
          occasion: slots.occasion || "just_because",
          budget_min: slots.budget_min,
          budget_max: slots.budget_max,
          currency: slots.currency || "USD",
          special_context: message,
          context_tags: slots.interests,
          status: "completed",
          ai_response: { recommendations: enrichedCards },
          product_results: enrichedCards.map((card) => ({ gift_name: card.title, products: card.store_links, locked_stores: [] })),
          ai_provider_used: aiProvider,
          ai_latency_ms: aiLatencyMs,
          credits_used: chatUnits,
          source: "chat",
          chat_thread_id: threadId,
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;
      sessionId = session.id;

      const actionId = `${sessionId}:chat_retrieval:0`;
      const { data: deduction } = await supabaseAdmin.rpc("deduct_user_credit", {
        p_user_id: user.id,
        p_session_id: sessionId,
        p_amount: chatUnits,
        p_action_id: actionId,
        p_action_type: "chat_retrieval",
      });
      if (isRecord(deduction) && deduction.success === false) {
        return json({ error: "Insufficient credits", errorType: "NO_CREDITS" }, 402);
      }
      remainingBalance = isRecord(deduction) && typeof deduction.remaining_balance === "number" ? deduction.remaining_balance : null;
      await supabaseAdmin.from("credit_transactions").update({ context: "chat" }).eq("session_id", sessionId);
    } else {
      await supabaseAdmin.from("guest_credits").upsert({
        guest_id: guestId,
        credit_used: true,
        used_at: new Date().toISOString(),
      });
      await supabaseAdmin.from("chat_threads").update({ status: "gated" }).eq("id", threadId);
    }

    const assistantMessage = "Here are three grounded ideas. I kept them tied to your brief and included store options where available.";
    await supabaseAdmin.from("chat_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: { text: assistantMessage, type: "results", cards: enrichedCards },
      citations: enrichedCards.flatMap((card) => card.citations),
      credit_charged: true,
    });
    await supabaseAdmin.from("chat_threads").update({
      slots,
      last_results: enrichedCards,
      updated_at: new Date().toISOString(),
    }).eq("id", threadId);

    return json({
      thread_id: threadId,
      session_id: sessionId,
      status: user ? "results_shown" : "signup_gate",
      assistant_message: assistantMessage,
      slots,
      cards: enrichedCards,
      citations_count: citationsCount,
      latency_ms: Date.now() - startedAt,
      remaining_balance: remainingBalance,
      guest_gate: !user,
    });
  } catch (error) {
    console.error("Unhandled chat-turn error:", error);
    return json({ error: "Chat finder failed. Try the full form instead." }, 500);
  }
});
