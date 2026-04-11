import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Recipient {
  id: string;
  name: string;
  relationship: string;
  relationship_depth: string;
  age_range: string;
  gender: string;
  interests: string[];
  cultural_context: string;
  country: string | null;
  notes: string;
}

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

export interface ProductResult {
  gift_name: string;
  products: Array<{
    store_id: string;
    store_name: string;
    domain: string;
    brand_color: string;
    search_url: string;
    is_search_link: boolean;
    gift_name: string;
    product_category: string;
  }>;
  locked_stores: Array<{
    store_id: string;
    store_name: string;
    brand_color: string;
    is_locked: boolean;
    unlock_plan: string;
  }>;
}

export interface GiftSessionState {
  sessionId: string | null;
  isGenerating: boolean;
  isSearchingProducts: boolean;
  recommendations: GiftRecommendation[] | null;
  productResults: ProductResult[] | null;
  occasionInsight: string | null;
  budgetAssessment: string | null;
  culturalNote: string | null;
  error: string | null;
  errorType: "NO_CREDITS" | "RATE_LIMITED" | "AI_ERROR" | "AUTH_REQUIRED" | "GENERIC" | null;
  regenerationCount: number;
  selectedGiftIndex: number | null;
  isComplete: boolean;
}

interface GenerateGiftParams {
  recipient: Recipient;
  occasion: string;
  occasionDate: string | null;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  recipientCountry: string | null;
  userCountry: string;
  specialContext: string;
  contextTags: string[];
  userPlan: string;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session?.access_token) return refreshed.data.session.access_token;

  throw { type: "AUTH_REQUIRED", message: "Your session expired. Please sign in again." };
}

async function getFunctionErrorDetails(error: unknown) {
  const fallback = getErrorMessage(error);

  if (typeof error !== "object" || !error || !("context" in error)) {
    return { status: null as number | null, message: fallback };
  }

  const context = (error as { context?: Response }).context;
  if (!(context instanceof Response)) {
    return { status: null as number | null, message: fallback };
  }

  let message = fallback;

  try {
    const payload = await context.clone().json();
    if (payload && typeof payload === "object") {
      const data = payload as { error?: string; message?: string };
      message = data.message || data.error || fallback;
    }
  } catch {
    try {
      const text = await context.clone().text();
      if (text) message = text;
    } catch {
      // keep fallback
    }
  }

  return { status: context.status, message };
}

async function invokeAuthedFunction<TResponse>(name: string, body: Record<string, unknown>) {
  const accessToken = await getAccessToken();
  const functions = supabase.functions;
  functions.setAuth(accessToken);

  const response = await functions.invoke<TResponse>(name, { body });

  if (response.error) {
    const details = await getFunctionErrorDetails(response.error);
    const upper = details.message.toUpperCase();

    if (details.status === 401 || upper.includes("401") || upper.includes("UNAUTHORIZED") || upper.includes("AUTH")) {
      throw { type: "AUTH_REQUIRED", message: details.message || "Your session expired. Please sign in again." };
    }

    if (details.status === 402 || upper.includes("NO_CREDITS") || upper.includes("INSUFFICIENT CREDITS")) {
      throw { type: "NO_CREDITS", message: details.message || "No credits available" };
    }

    throw new Error(details.message || `Function ${name} failed`);
  }

  return response;
}

const initialState: GiftSessionState = {
  sessionId: null,
  isGenerating: false,
  isSearchingProducts: false,
  recommendations: null,
  productResults: null,
  occasionInsight: null,
  budgetAssessment: null,
  culturalNote: null,
  error: null,
  errorType: null,
  regenerationCount: 0,
  selectedGiftIndex: null,
  isComplete: false,
};

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Something went wrong");
  }
  return "Something went wrong";
}

function isNoCreditError(error: unknown) {
  if (typeof error === "object" && error && "type" in error) {
    const typed = error as { type?: string };
    if (typed.type === "NO_CREDITS") return true;
  }

  const message = getErrorMessage(error).toUpperCase();
  return message.includes("NO_CREDITS") || message.includes("INSUFFICIENT CREDITS");
}

export function useGiftSession() {
  const [state, setState] = useState<GiftSessionState>(initialState);

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

  const callAI = useCallback(
    async (params: GenerateGiftParams & { sessionId: string }) => {
      const response = await invokeAuthedFunction<any>("generate-gifts", {
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
      });

      if (response.error) {
        throw response.error;
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
      const response = await invokeAuthedFunction<any>("search-products", {
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

  const generateGifts = useCallback(
    async (params: GenerateGiftParams) => {
      const shouldReuseSession =
        Boolean(state.sessionId) &&
        state.recommendations === null &&
        state.errorType !== "NO_CREDITS" &&
        !state.isComplete;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        isSearchingProducts: false,
        error: null,
        errorType: null,
        recommendations: shouldReuseSession ? prev.recommendations : null,
        productResults: shouldReuseSession ? prev.productResults : null,
        isComplete: false,
      }));

      try {
        let sessionId = state.sessionId;

        if (!shouldReuseSession || !sessionId) {
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

              await supabase.from("gift_sessions").update({ status: "abandoned" }).eq("id", sessionId);
              return;
            }

            console.error("Credit deduction failed (not a credit issue):", creditError);
            setState((prev) => ({
              ...prev,
              isGenerating: false,
              error: isNoCreditError(creditError)
                ? "No credits available"
                : getErrorMessage(creditError) || "Something went wrong while checking credits. Please try again.",
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

        const aiResult = await callAI({
          ...params,
          sessionId,
        });

        setState((prev) => ({
          ...prev,
          sessionId,
          recommendations: aiResult.recommendations,
          occasionInsight: aiResult.occasion_insight,
          budgetAssessment: aiResult.budget_assessment,
          culturalNote: aiResult.cultural_note,
          isGenerating: false,
          error: null,
          errorType: null,
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
          await supabase
            .from("gift_sessions")
            .update({ product_results: products })
            .eq("id", sessionId);
        }
      } catch (error) {
        const message = getErrorMessage(error);
        const upper = message.toUpperCase();
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          isSearchingProducts: false,
          error: upper.includes("AUTH")
            ? "Your session expired. Please sign in again and retry."
            : message,
          errorType: upper.includes("AUTH")
            ? "AUTH_REQUIRED"
            : upper.includes("RATE")
              ? "RATE_LIMITED"
              : "AI_ERROR",
        }));
      }
    },
    [callAI, createSession, deductCredit, searchProducts, state.errorType, state.isComplete, state.recommendations, state.sessionId],
  );

  const regenerate = useCallback(
    async (params: GenerateGiftParams) => {
      if (!state.sessionId) return;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        isSearchingProducts: false,
        error: null,
        errorType: null,
        regenerationCount: prev.regenerationCount + 1,
      }));

      try {
        const aiResult = await callAI({
          ...params,
          sessionId: state.sessionId,
        });

        setState((prev) => ({
          ...prev,
          recommendations: aiResult.recommendations,
          occasionInsight: aiResult.occasion_insight,
          budgetAssessment: aiResult.budget_assessment,
          culturalNote: aiResult.cultural_note,
          isGenerating: false,
          error: null,
          errorType: null,
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

        if (products && state.sessionId) {
          await supabase
            .from("gift_sessions")
            .update({
              product_results: products,
              regeneration_count: state.regenerationCount + 1,
            })
            .eq("id", state.sessionId);
        } else {
          await supabase
            .from("gift_sessions")
            .update({ regeneration_count: state.regenerationCount + 1 })
            .eq("id", state.sessionId);
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          isSearchingProducts: false,
          error: getErrorMessage(error),
          errorType: "AI_ERROR",
        }));
      }
    },
    [callAI, searchProducts, state.sessionId],
  );

  const selectGift = useCallback(
    async (giftIndex: number, giftName: string) => {
      if (!state.sessionId) return;

      const selectedGift = state.recommendations?.[giftIndex];

      await supabase
        .from("gift_sessions")
        .update({
          selected_gift_index: giftIndex,
          selected_gift_name: giftName,
          confidence_score: selectedGift?.confidence_score ?? null,
          status: "completed",
        })
        .eq("id", state.sessionId);

      try {
        await invokeAuthedFunction("award-referral-credits", {
          session_id: state.sessionId,
        });
      } catch {
        // silent
      }

      setState((prev) => ({
        ...prev,
        selectedGiftIndex: giftIndex,
        isComplete: true,
      }));
    },
    [state.recommendations, state.sessionId],
  );

  const trackProductClick = useCallback(
    async (product: {
      gift_name: string;
      store_name: string;
      search_url: string;
      store_id: string;
      domain?: string;
      is_search_link?: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      await supabase.from("product_clicks").insert({
        user_id: user.id,
        session_id: state.sessionId,
        gift_concept_name: product.gift_name,
        product_title: product.store_name,
        product_url: product.search_url,
        store: product.store_id,
        country: product.domain?.split(".").pop() || "",
        is_search_link: Boolean(product.is_search_link),
      });

      window.open(product.search_url, "_blank", "noopener,noreferrer");
    },
    [state.sessionId],
  );

  const resetSession = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    generateGifts,
    regenerate,
    selectGift,
    trackProductClick,
    resetSession,
  };
}
