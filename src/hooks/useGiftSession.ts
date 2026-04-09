import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rateLimiter";
import { captureError } from "@/lib/sentry";

/* ─── Types ─── */
export interface GiftRecommendation {
  name: string;
  description: string;
  why_it_works: string;
  confidence_score: number;
  signal_interpretation: string;
  search_keywords: string[];
  product_category: string;
  price_anchor: number;
  what_not_to_do: string;
}

export interface SignalCheckSignal {
  positive_signals: string[];
  potential_risks: string[];
  overall_message: string;
  confidence_note: string;
}

export interface ProductLink {
  store_id: string;
  store_name: string;
  domain: string;
  brand_color: string | null;
  logo_url?: string | null;
  search_url: string;
  is_search_link: true;
  gift_name: string;
  product_category: string;
}

export interface LockedStore {
  store_id: string;
  store_name: string;
  brand_color: string | null;
  is_locked: true;
  unlock_plan: string;
}

export interface ProductResult {
  gift_name: string;
  products: ProductLink[];
  locked_stores: LockedStore[];
}

interface GiftSessionState {
  sessionId: string | null;
  isGenerating: boolean;
  isSearchingProducts: boolean;
  recommendations: GiftRecommendation[] | null;
  productResults: ProductResult[] | null;
  occasionInsight: string | null;
  budgetAssessment: string | null;
  culturalNote: string | null;
  modelUsed: string | null;
  error: string | null;
  regenerationCount: number;
  selectedGiftIndex: number | null;
  signalCheckResults: Record<string, SignalCheckSignal>;
  signalCheckLoading: string | null;
}

export interface SignalCheckContext {
  recipientName: string;
  recipientRelationship: string;
  recipientRelationshipDepth?: string | null;
  occasion: string;
  relationshipStage?: string | null;
  currency: string;
}

export interface GenerateGiftsParams {
  recipient: {
    name: string;
    relationship_type: string;
    relationship_depth?: string | null;
    age_range?: string | null;
    gender?: string | null;
    interests?: string[] | null;
    cultural_context?: string | null;
    country?: string | null;
    notes?: string | null;
  };
  occasion: string;
  occasionDate: string | null;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  recipientCountry: string | null;
  specialContext: string | null;
  contextTags: string[];
  userPlan: string;
  sessionId: string;
}

/* ─── Hook ─── */
export function useGiftSession() {
  const { user } = useAuth();
  const [state, setState] = useState<GiftSessionState>({
    sessionId: null,
    isGenerating: false,
    isSearchingProducts: false,
    recommendations: null,
    productResults: null,
    occasionInsight: null,
    budgetAssessment: null,
    culturalNote: null,
    modelUsed: null,
    error: null,
    regenerationCount: 0,
    selectedGiftIndex: null,
    signalCheckResults: {},
    signalCheckLoading: null,
  });

  const isRateLimited = (error: unknown, data?: { error?: string; message?: string }) => {
    const message = error instanceof Error ? error.message : "";
    return (
      data?.error === "RATE_LIMITED" ||
      data?.message?.includes("Too many requests") ||
      message.includes("RATE_LIMITED") ||
      message.includes("429")
    );
  };

  /* ── Search for product links via Edge Function ─────────────────────────── */
  const searchProducts = useCallback(async (params: {
    giftConcepts: GiftRecommendation[];
    recipientCountry: string | null;
    userCountry: string | null;
    currency: string;
    budgetMin: number;
    budgetMax: number;
    userPlan: string;
  }) => {
    setState((prev) => ({ ...prev, isSearchingProducts: true }));

    try {
      const response = await supabase.functions.invoke("search-products", {
        body: {
          gift_concepts: params.giftConcepts.map((r) => ({
            name: r.name,
            search_keywords: r.search_keywords,
            product_category: r.product_category,
            price_anchor: r.price_anchor,
          })),
          recipient_country: params.recipientCountry || "",
          user_country: params.userCountry || "",
          currency: params.currency,
          budget_min: params.budgetMin,
          budget_max: params.budgetMax,
          user_plan: params.userPlan,
        },
      });

      if (response.error) throw new Error(response.error.message);

      setState((prev) => ({
        ...prev,
        isSearchingProducts: false,
        productResults: response.data?.results ?? null,
      }));
    } catch (err: unknown) {
      // Non-fatal: product search failing shouldn't block recommendations
      setState((prev) => ({ ...prev, isSearchingProducts: false }));
      console.error("Product search failed:", err);
      captureError(
        err instanceof Error ? err : new Error("Product search failed"),
        {
          action: "search-products",
          budget_min: params.budgetMin,
          budget_max: params.budgetMax,
          user_plan: params.userPlan,
        },
      );
    }
  }, []);

  /* ── Generate gift recommendations via Edge Function ────────────────────── */
  const generateGifts = useCallback(async (params: GenerateGiftsParams) => {
    if (user?.id) {
      const limit = checkRateLimit({
        key: `gifts_${user.id}`,
        maxRequests: 20,
        windowMs: 86_400_000,
      });

      if (!limit.allowed) {
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: RATE_LIMIT_MESSAGE,
        }));
        throw new Error("RATE_LIMITED");
      }
    }

    setState((prev) => ({
      ...prev,
      isGenerating: true,
      error: null,
      recommendations: null,
      productResults: null,
    }));

    try {
      // ── Step 1: Deduct 1 credit BEFORE calling AI ──────────────────────────
      // This is atomic at the DB level (FOR UPDATE lock). If it fails, we stop.
      const deductResponse = await supabase.functions.invoke("deduct-credit", {
        body: { session_id: params.sessionId, amount: 1 },
      });

      const deductData = deductResponse.data;

      if (deductResponse.error || !deductData?.success) {
        // NO_CREDITS → StepResults shows upgrade modal, not error card
        const isNoCreditError =
          deductData?.error === "NO_CREDITS" ||
          deductResponse.error?.message?.includes("NO_CREDITS") ||
          deductData?.remaining === 0;

        if (!isNoCreditError) {
          captureError(
            new Error(deductResponse.error?.message || deductData?.message || "Failed to deduct credit"),
            {
              action: "deduct-credit",
              session_id: params.sessionId,
            },
          );
        }

        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: isNoCreditError ? "NO_CREDITS" : (deductData?.message || "Failed to deduct credit"),
        }));
        return;
      }

      // ── Step 2: Call generate-gifts with Claude AI ─────────────────────────
      const response = await supabase.functions.invoke("generate-gifts", {
        body: {
          recipient: {
            name: params.recipient.name,
            relationship: params.recipient.relationship_type,
            relationship_depth: params.recipient.relationship_depth,
            age_range: params.recipient.age_range,
            gender: params.recipient.gender,
            interests: params.recipient.interests,
            cultural_context: params.recipient.cultural_context,
            country: params.recipient.country,
            notes: params.recipient.notes,
          },
          occasion: params.occasion,
          occasion_date: params.occasionDate,
          budget_min: params.budgetMin,
          budget_max: params.budgetMax,
          currency: params.currency,
          recipient_country: params.recipientCountry,
          special_context: params.specialContext,
          context_tags: params.contextTags,
          user_plan: params.userPlan,
          session_id: params.sessionId,
        },
      });

      if (response.error || response.data?.error) {
        if (isRateLimited(response.error, response.data)) {
          throw new Error("RATE_LIMITED");
        }
        throw new Error(
          response.error?.message ||
            response.data?.message ||
            response.data?.error ||
            "Failed to generate recommendations",
        );
      }

      const result = response.data;
      const recommendations: GiftRecommendation[] = result.recommendations;

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        recommendations,
        occasionInsight: result.occasion_insight ?? null,
        budgetAssessment: result.budget_assessment ?? null,
        culturalNote: result.cultural_note ?? null,
        modelUsed: result.model_used ?? null,
      }));

      // Fire product search in parallel (non-blocking)
      searchProducts({
        giftConcepts: recommendations,
        recipientCountry: params.recipientCountry,
        userCountry: null,
        currency: params.currency,
        budgetMin: params.budgetMin,
        budgetMax: params.budgetMax,
        userPlan: params.userPlan,
      });

      return result;
    } catch (err: unknown) {
      const message = isRateLimited(err)
        ? RATE_LIMIT_MESSAGE
        : err instanceof Error
          ? err.message
          : "Failed to generate recommendations";
      captureError(
        err instanceof Error ? err : new Error("Failed to generate recommendations"),
        {
          action: "generate-gifts",
          session_id: params.sessionId,
          occasion: params.occasion,
          budget_min: params.budgetMin,
          budget_max: params.budgetMax,
        },
      );
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: message,
      }));
      throw err;
    }
  }, [searchProducts, user?.id]);

  /* ── Mark a gift as chosen ──────────────────────────────────────────────── */
  const selectGift = useCallback(async (giftIndex: number, gift: GiftRecommendation) => {
    setState((prev) => ({ ...prev, selectedGiftIndex: giftIndex }));

    const sessionId = state.sessionId;
    if (!sessionId) return;

    try {
      await supabase
        .from("gift_sessions")
        .update({
          chosen_gift: gift as any,
          selected_gift_name: gift.name,
          selected_gift_index: giftIndex,
          status: "completed",
        } as any)
        .eq("id", sessionId);
    } catch (err) {
      console.error("Failed to persist gift selection:", err);
      captureError(
        err instanceof Error ? err : new Error("Failed to persist gift selection"),
        {
          action: "persist-gift-selection",
          session_id: sessionId,
        },
      );
    }

    // Non-blocking: try to award referral credits to the referrer.
    // The edge function returns 200 silently if there's no pending referral.
    try {
      await supabase.functions.invoke("award-referral-credits", {
        body: { session_id: sessionId },
      });
    } catch (e) {
      // Don't fail gift selection if referral awarding fails
      console.log("Referral credit check (non-blocking):", e);
      captureError(
        e instanceof Error ? e : new Error("Referral credit award failed"),
        {
          action: "award-referral-credits",
          session_id: sessionId,
        },
      );
    }
  }, [state.sessionId]);

  /* ── Track a store click ────────────────────────────────────────────────── */
  const trackClick = useCallback(async (product: ProductLink, sessionId: string | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const limit = checkRateLimit({
        key: `clicks_${user.id}`,
        maxRequests: 100,
        windowMs: 3_600_000,
      });

      if (!limit.allowed) {
        toast.error(RATE_LIMIT_MESSAGE);
        return;
      }

      await supabase.from("product_clicks").insert({
        user_id: user.id,
        session_id: sessionId || null,
        gift_concept_name: product.gift_name,
        store: product.store_name,
        product_url: product.search_url,
        // Extract TLD as rough country indicator
        country: product.domain?.split(".").pop() ?? null,
        is_search_link: product.is_search_link,
      } as any);
    } catch (err) {
      // Non-fatal
      console.error("Failed to track click:", err);
      captureError(
        err instanceof Error ? err : new Error("Failed to track product click"),
        {
          action: "track-product-click",
          session_id: sessionId,
        },
      );
    }
  }, []);

  /* ── Re-generate with incremented counter ───────────────────────────────── */
  const regenerate = useCallback(async (params: GenerateGiftsParams) => {
    setState((prev) => ({
      ...prev,
      regenerationCount: prev.regenerationCount + 1,
    }));
    return generateGifts(params);
  }, [generateGifts]);

  /* ── Expose session ID setter so GiftFlow can push the DB-created ID ────── */
  const setSessionId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, sessionId: id }));
  }, []);

  /* ── Signal Check — call the signal-check edge function ─────────────────── */
  const handleSignalCheck = useCallback(
    async (
      gift: GiftRecommendation,
      context: SignalCheckContext,
      onCreditsRefresh?: () => Promise<void>,
    ) => {
      // Already cached — nothing to do
      if (state.signalCheckResults[gift.name]) return;

      setState((prev) => ({ ...prev, signalCheckLoading: gift.name }));

      try {
        if (user?.id) {
          const limit = checkRateLimit({
            key: `signal_${user.id}`,
            maxRequests: 30,
            windowMs: 86_400_000,
          });

          if (!limit.allowed) {
            toast.error(RATE_LIMIT_MESSAGE);
            return;
          }
        }

        const response = await supabase.functions.invoke("signal-check", {
          body: {
            gift_name: gift.name,
            gift_description: gift.description,
            recipient_name: context.recipientName,
            recipient_relationship: context.recipientRelationship,
            recipient_relationship_depth: context.recipientRelationshipDepth || undefined,
            occasion: context.occasion,
            relationship_stage: context.relationshipStage || undefined,
            budget_spent: gift.price_anchor,
            currency: context.currency,
            session_id: state.sessionId,
          },
        });

        if (response.error || response.data?.error) {
          if (isRateLimited(response.error, response.data)) {
            toast.error(RATE_LIMIT_MESSAGE);
            return;
          }
          throw response.error ?? new Error(response.data?.message || "Signal Check failed");
        }

        const data = response.data;

        // Plan restricted — shouldn't reach here if UI gates properly
        if (data?.error === "PLAN_RESTRICTED") return;

        // No credits
        if (data?.error === "NO_CREDITS") {
          toast.error(data.message || "Not enough credits for Signal Check");
          return;
        }

        if (data?.error === "RATE_LIMITED") {
          toast.error(RATE_LIMIT_MESSAGE);
          return;
        }

        if (data?.signal) {
          setState((prev) => ({
            ...prev,
            signalCheckResults: {
              ...prev.signalCheckResults,
              [gift.name]: data.signal,
            },
          }));
        }

        // Refresh credit balance (0.5 was deducted)
        if (onCreditsRefresh) {
          await onCreditsRefresh();
        }
      } catch (err) {
        console.error("Signal check failed:", err);
        captureError(
          err instanceof Error ? err : new Error("Signal check failed"),
          {
            action: "signal-check",
            session_id: state.sessionId,
            gift_name: gift.name,
          },
        );
        toast.error("Signal Check failed. Please try again.");
      } finally {
        setState((prev) => ({ ...prev, signalCheckLoading: null }));
      }
    },
    [state.signalCheckResults, state.sessionId, user?.id],
  );

  return {
    ...state,
    setSessionId,
    generateGifts,
    searchProducts,
    selectGift,
    trackClick,
    regenerate,
    handleSignalCheck,
  };
}
