import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGiftSessionV2 } from "@/hooks/useGiftSessionV2";
import type { ProductResult } from "@/lib/productLinks";
import {
  getCurrentUserId,
  getErrorMessage,
  getFunctionErrorDetails,
  getAccessToken,
  hydrateGiftSessionState,
  initialState,
  invokeAuthedFunction,
  isNoCreditError,
  normalizeGiftErrorType,
  upsertFeedbackReminder,
} from "@/hooks/giftSessionShared";
import type { GenerateGiftParams, GenerateGiftsResponse, GiftRecommendation, GiftSessionRow, GiftSessionState, SelectGiftOptions } from "@/hooks/giftSessionTypes";

export type { GenerateGiftParams, GiftRecommendation, GiftSessionState, Recipient } from "@/hooks/giftSessionTypes";

function useGiftSessionV1() {
  const [state, setState] = useState<GiftSessionState>(initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const createSession = useCallback(
    async (data: {
      recipientId: string;
      recipientCountry: string | null;
      occasion: string;
      occasionDate: string | null;
      budgetMin: number;
      budgetMax: number;
      currency: string;
      specialContext: string;
      contextTags: string[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Not authenticated");
      }

      const { data: session, error } = await supabase
        .from("gift_sessions")
        .insert({
          user_id: user.id,
          recipient_id: data.recipientId,
          recipient_country: data.recipientCountry,
          occasion: data.occasion,
          occasion_date: data.occasionDate,
          budget_min: data.budgetMin,
          budget_max: data.budgetMax,
          currency: data.currency,
          special_context: data.specialContext,
          context_tags: data.contextTags,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      setState((prev) => ({ ...prev, sessionId: session.id }));
      return session.id;
    },
    [],
  );

  const deductCredit = useCallback(async (sessionId: string) => {
    const response = await invokeAuthedFunction<{
      success?: boolean;
      deducted?: number;
      remaining?: number;
      error?: string;
      message?: string;
    }>("deduct-credit", { session_id: sessionId, amount: 1 });

    if (response.error) {
      if (isNoCreditError(response.error)) {
        throw { type: "NO_CREDITS", message: "No credits available" };
      }
      throw new Error(`Credit deduction failed: ${getErrorMessage(response.error)}`);
    }

    if (response.data && response.data.success === false) {
      if (isNoCreditError(response.data)) {
        throw { type: "NO_CREDITS", message: getErrorMessage(response.data) || "No credits available" };
      }
      throw new Error(`Credit deduction failed: ${getErrorMessage(response.data)}`);
    }

    return response.data;
  }, []);

  const refundCredit = useCallback(async (sessionId: string) => {
    const response = await invokeAuthedFunction<{
      success?: boolean;
      refunded?: number;
      already_refunded?: boolean;
    }>("refund-credit", { session_id: sessionId, amount: 1 });

    return Boolean(response.data?.success);
  }, []);

  const updateSessionStatus = useCallback(async (sessionId: string, status: "active" | "abandoned" | "completed" | "errored") => {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) return;

    await supabase
      .from("gift_sessions")
      .update({ status })
      .eq("id", sessionId)
      .eq("user_id", currentUserId);
  }, []);

  const callAI = useCallback(
    async (params: GenerateGiftParams & { sessionId: string; isRegeneration?: boolean }) => {
      const accessToken = await getAccessToken();
      const functions = supabase.functions;
      functions.setAuth(accessToken);

      const response = await functions.invoke<GenerateGiftsResponse>("generate-gifts", {
        body: {
          recipient: {
            name: params.recipient.name,
            relationship: params.recipient.relationship,
            relationship_depth: params.recipient.relationship_depth,
            age_range: params.recipient.age_range,
            gender: params.recipient.gender,
            interests: params.recipient.interests || [],
            cultural_context: params.recipient.cultural_context,
            country: params.recipientCountry || params.recipient.country,
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
          is_regeneration: Boolean(params.isRegeneration),
        },
      });

      if (response.error) {
        const details = await getFunctionErrorDetails(response.error);
        const type = normalizeGiftErrorType(
          details.payload?.errorType,
          details.status,
          details.message,
        );

        throw {
          type,
          message: details.message,
          retryAfter:
            typeof details.payload?.retry_after === "number" ? details.payload.retry_after : null,
        };
      }

      if (response.data?.error) {
        throw {
          type: normalizeGiftErrorType(response.data.errorType, null, response.data.error),
          message: response.data.message || response.data.error,
          retryAfter: typeof response.data.retry_after === "number" ? response.data.retry_after : null,
        };
      }

      return response.data;
    },
    [],
  );

  const searchProducts = useCallback(
    async (params: {
      recommendations: GiftRecommendation[];
      recipientCountry: string | null;
      userCountry: string;
      currency: string;
      budgetMin: number;
      budgetMax: number;
      userPlan: string;
    }) => {
      const response = await invokeAuthedFunction<{ results?: ProductResult[] | null }>("search-products", {
        gift_concepts: params.recommendations.map((recommendation) => ({
          name: recommendation.name,
          search_keywords: recommendation.search_keywords,
          product_category: recommendation.product_category,
          price_anchor: recommendation.price_anchor,
        })),
        recipient_country: params.recipientCountry || "",
        user_country: params.userCountry,
        currency: params.currency,
        budget_min: params.budgetMin,
        budget_max: params.budgetMax,
        user_plan: params.userPlan,
      });

      if (response.error) {
        console.error("Product search failed:", response.error);
        return null;
      }

      return response.data?.results || null;
    },
    [],
  );

  const runGeneration = useCallback(
    async (
      params: GenerateGiftParams,
      options: { isRegeneration: boolean; parseRetryAttempt: number },
    ) => {
      const currentState = stateRef.current;
      let sessionId = currentState.sessionId;
      let refundIssued: boolean | null = null;
      const shouldReuseSession =
        Boolean(currentState.sessionId) &&
        currentState.recommendations === null &&
        currentState.errorType !== "NO_CREDITS" &&
        !currentState.isComplete;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        isSearchingProducts: false,
        error: null,
        errorType: null,
        recommendations: shouldReuseSession ? prev.recommendations : null,
        productResults: shouldReuseSession ? prev.productResults : null,
        aiProviderUsed: null,
        aiLatencyMs: null,
        aiAttempt: null,
        refundIssued: null,
        isComplete: false,
      }));

      try {
        if (options.isRegeneration && !sessionId) {
          throw { type: "GENERIC", message: "Session missing. Please start again." };
        }

        if (!options.isRegeneration && (!shouldReuseSession || !sessionId)) {
          sessionId = await createSession({
            recipientId: params.recipient.id,
            recipientCountry: params.recipientCountry,
            occasion: params.occasion,
            occasionDate: params.occasionDate,
            budgetMin: params.budgetMin,
            budgetMax: params.budgetMax,
            currency: params.currency,
            specialContext: params.specialContext,
            contextTags: params.contextTags,
          });

          try {
            await deductCredit(sessionId);
          } catch (creditError) {
            if (isNoCreditError(creditError)) {
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                error: "No credits available",
                errorType: "NO_CREDITS",
                sessionId,
              }));

              const currentUserId = await getCurrentUserId();
              if (currentUserId) {
                await supabase
                  .from("gift_sessions")
                  .update({ status: "abandoned" })
                  .eq("id", sessionId)
                  .eq("user_id", currentUserId);
              }
              return;
            }

            const message = getErrorMessage(creditError) || "Something went wrong while checking credits. Please try again.";
            setState((prev) => ({
              ...prev,
              isGenerating: false,
              error: message,
              errorType:
                typeof creditError === "object" &&
                creditError &&
                "type" in creditError &&
                (creditError as { type?: string }).type === "AUTH_REQUIRED"
                  ? "AUTH_REQUIRED"
                  : "AI_ERROR",
              sessionId,
            }));
            return;
          }
        }

        if (!sessionId) {
          throw { type: "GENERIC", message: "Session missing. Please start again." };
        }

        const aiResult = await callAI({
          ...params,
          sessionId,
          isRegeneration: options.isRegeneration,
        });

        setState((prev) => ({
          ...prev,
          sessionId,
          recommendations: aiResult.recommendations,
          occasionInsight: aiResult.occasion_insight,
          budgetAssessment: aiResult.budget_assessment,
          culturalNote: aiResult.cultural_note,
          aiProviderUsed: aiResult._meta?.provider ?? null,
          aiLatencyMs: aiResult._meta?.latency_ms ?? null,
          aiAttempt: aiResult._meta?.attempt ?? null,
          isGenerating: false,
          error: null,
          errorType: null,
          regenerationCount: options.isRegeneration ? prev.regenerationCount + 1 : prev.regenerationCount,
        }));

        setState((prev) => ({ ...prev, isSearchingProducts: true }));

        const products = await searchProducts({
          recommendations: aiResult.recommendations,
          recipientCountry: params.recipientCountry,
          userCountry: params.userCountry,
          currency: params.currency,
          budgetMin: params.budgetMin,
          budgetMax: params.budgetMax,
          userPlan: params.userPlan,
        });

        setState((prev) => ({
          ...prev,
          productResults: products,
          isSearchingProducts: false,
        }));

        if (products && sessionId) {
          const currentUserId = await getCurrentUserId();
          await supabase
            .from("gift_sessions")
            .update({ product_results: products })
            .eq("id", sessionId)
            .eq("user_id", currentUserId ?? "");
        }
      } catch (error) {
        const typedError =
          typeof error === "object" && error && "type" in error
            ? error as { type?: GiftSessionState["errorType"]; message?: string }
            : { type: undefined, message: getErrorMessage(error) };

        if (typedError.type === "AI_PARSE_ERROR" && options.parseRetryAttempt < 1) {
          window.setTimeout(() => {
            void runGeneration(params, {
              ...options,
              parseRetryAttempt: options.parseRetryAttempt + 1,
            });
          }, 2000);
          return;
        }

        const normalizedType = normalizeGiftErrorType(
          typedError.type,
          null,
          typedError.message || getErrorMessage(error),
        );

        if (sessionId && !options.isRegeneration && normalizedType !== "NO_CREDITS") {
          refundIssued = await refundCredit(sessionId).catch(() => false);
          await updateSessionStatus(sessionId, "errored").catch(() => undefined);
        }

        setState((prev) => ({
          ...prev,
          isGenerating: false,
          isSearchingProducts: false,
          error: normalizedType === "AUTH_REQUIRED"
            ? "Your session expired. Please sign in again and retry."
            : normalizedType === "AI_ERROR" || normalizedType === "AI_PARSE_ERROR" || normalizedType === "NETWORK"
              ? refundIssued
                ? "AI had trouble. Your credit was returned. Try again."
                : "AI had trouble. If your credit was charged, contact support."
              : typedError.message || getErrorMessage(error),
          errorType: normalizedType,
          refundIssued,
        }));
      }
    },
    [callAI, createSession, deductCredit, refundCredit, searchProducts, updateSessionStatus],
  );

  const generateGifts = useCallback(
    async (params: GenerateGiftParams) => {
      await runGeneration(params, { isRegeneration: false, parseRetryAttempt: 0 });
    },
    [runGeneration],
  );

  const regenerate = useCallback(
    async (params: GenerateGiftParams) => {
      await runGeneration(params, { isRegeneration: true, parseRetryAttempt: 0 });
    },
    [runGeneration],
  );

  const selectGift = useCallback(
    async (giftIndex: number, giftName: string, options?: SelectGiftOptions) => {
      if (!state.sessionId) return;

      const selectedGift = state.recommendations?.[giftIndex];
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) return;

      await supabase
        .from("gift_sessions")
        .update({
          selected_gift_index: giftIndex,
          selected_gift_name: giftName,
          selected_gift_note: options?.note ?? null,
          confidence_score: selectedGift?.confidence_score ?? null,
          status: "completed",
        })
        .eq("id", state.sessionId)
        .eq("user_id", currentUserId);

      const { data: completedSession } = await supabase
        .from("gift_sessions")
        .select("recipient_id")
        .eq("id", state.sessionId)
        .eq("user_id", currentUserId)
        .single();

      if (completedSession?.recipient_id) {
        await supabase
          .from("recipients")
          .update({ last_gift_date: new Date().toISOString() })
          .eq("id", completedSession.recipient_id)
          .eq("user_id", currentUserId);
      }

      try {
        await invokeAuthedFunction("award-referral-credits", {
          session_id: state.sessionId,
        });
      } catch {
        // silent
      }

      if (options?.createReminder && options.occasion) {
        await upsertFeedbackReminder({
          userId: currentUserId,
          sessionId: state.sessionId,
          recipientId: completedSession?.recipient_id ?? options.recipientId ?? null,
          occasion: options.occasion,
          occasionDate: options.occasionDate ?? null,
        }).catch(() => undefined);
      }

      setState((prev) => ({
        ...prev,
        selectedGiftIndex: giftIndex,
        selectedGiftName: giftName,
        selectedGiftNote: options?.note ?? null,
        isComplete: true,
      }));
    },
    [state.recommendations, state.sessionId],
  );

  const trackProductClick = useCallback(
    async (product: {
      gift_name: string;
      store_name: string;
      search_url?: string | null;
      product_url?: string | null;
      affiliate_url?: string | null;
      store_id: string;
      domain?: string;
      is_search_link?: boolean;
      product_title?: string | null;
      price_amount?: number | null;
      recommendationIndex?: number;
      recommendationConfidence?: number | null;
      recipientId?: string | null;
      clickedFrom?: "results_screen" | "success_screen";
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const outboundUrl = product.affiliate_url || product.product_url || product.search_url;
      if (!outboundUrl) return;

      await supabase.from("product_clicks").insert({
        user_id: user.id,
        session_id: state.sessionId,
        recipient_id: product.recipientId ?? null,
        gift_concept_name: product.gift_name,
        recommendation_index: product.recommendationIndex ?? null,
        recommendation_confidence: product.recommendationConfidence ?? null,
        product_title: product.product_title || product.store_name,
        product_url: outboundUrl,
        store: product.store_id,
        store_id: product.store_id,
        store_name: product.store_name,
        country: product.domain?.split(".").pop() || "",
        estimated_price: product.price_amount ?? null,
        is_search_link: Boolean(product.is_search_link),
        clicked_from: product.clickedFrom ?? "results_screen",
      });

      window.open(outboundUrl, "_blank", "noopener,noreferrer");
    },
    [state.sessionId],
  );

  const resetSession = useCallback(() => {
    setState(initialState);
  }, []);

  const hydrateSession = useCallback((session: GiftSessionRow) => {
    setState((prev) => ({
      ...prev,
      ...hydrateGiftSessionState(session),
    }));
  }, []);

  return {
    ...state,
    generateGifts,
    regenerate,
    selectGift,
    trackProductClick,
    hydrateSession,
    resetSession,
  };
}

const useGiftSessionImpl = import.meta.env.VITE_USE_LANGGRAPH === "true" ? useGiftSessionV2 : useGiftSessionV1;

export function useGiftSession() {
  return useGiftSessionImpl();
}
