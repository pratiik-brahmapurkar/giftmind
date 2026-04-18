import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getAccessToken,
  getCurrentUserId,
  getErrorMessage,
  initialState,
  invokeAuthedFunction,
  isNoCreditError,
  normalizeGiftErrorType,
} from "@/hooks/giftSessionShared";
import type { GenerateGiftParams, GiftRecommendation, GiftSessionState } from "@/hooks/giftSessionTypes";

interface RecommendationStatusResponse {
  session_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  current_node: string | null;
  nodes_completed: string[];
  recommendations: GiftRecommendation[] | null;
  product_results: GiftSessionState["productResults"];
  occasion_insight: string | null;
  budget_assessment: string | null;
  cultural_note: string | null;
  total_duration_ms: number | null;
  meta?: {
    provider?: string | null;
    attempt?: number | null;
    engine_version?: string | null;
    node_timings?: Record<string, number> | null;
    cultural_rules_applied?: number | null;
    past_gifts_checked?: number | null;
    personalization_scores?: Array<Record<string, unknown>> | null;
    avg_personalization_score?: number | null;
  } | null;
  warning?: {
    code: string;
    message: string;
  } | null;
  error?: {
    code: string;
    message: string;
  } | null;
}

interface RecommendationStreamResult {
  status: RecommendationStatusResponse;
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

    throw {
      type: normalizeGiftErrorType(
        payload && typeof payload === "object" ? (payload as { errorType?: string }).errorType : null,
        response.status,
        message,
      ),
      message,
    };
  }

  return payload as TResponse;
}

function mergeBudgetMessaging(status: RecommendationStatusResponse) {
  if (!status.warning?.message) return status.budget_assessment;
  if (!status.budget_assessment) return status.warning.message;
  return `${status.budget_assessment}\n\n${status.warning.message}`;
}

function parseSseEventBlock(block: string) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function applyStatusSnapshot(
  previous: GiftSessionState,
  status: RecommendationStatusResponse,
  options?: {
    isGenerating?: boolean;
    sessionId?: string;
    regenerationIncrement?: boolean;
  },
): GiftSessionState {
  return {
    ...previous,
    sessionId: options?.sessionId ?? previous.sessionId,
    isGenerating: options?.isGenerating ?? previous.isGenerating,
    recommendations: status.recommendations ?? previous.recommendations,
    productResults: status.product_results ?? previous.productResults,
    occasionInsight: status.occasion_insight ?? previous.occasionInsight,
    budgetAssessment: mergeBudgetMessaging(status),
    culturalNote: status.cultural_note ?? previous.culturalNote,
    aiProviderUsed: status.meta?.provider ?? previous.aiProviderUsed,
    aiLatencyMs: status.total_duration_ms ?? previous.aiLatencyMs,
    aiAttempt: status.meta?.attempt ?? previous.aiAttempt,
    engineVersion: status.meta?.engine_version ?? previous.engineVersion,
    currentNode: status.current_node ?? previous.currentNode,
    nodesCompleted: status.nodes_completed ?? previous.nodesCompleted,
    nodeTimings: status.meta?.node_timings ?? previous.nodeTimings,
    warningCode: status.warning?.code ?? previous.warningCode,
    warningMessage: status.warning?.message ?? previous.warningMessage,
    avgPersonalizationScore: status.meta?.avg_personalization_score ?? previous.avgPersonalizationScore,
    isSearchingProducts: false,
    error: status.error?.message ?? previous.error,
    errorType: status.error ? "AI_ERROR" : previous.errorType,
    regenerationCount:
      options?.regenerationIncrement ? previous.regenerationCount + 1 : previous.regenerationCount,
  };
}

export function useGiftSessionV2() {
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

  const pollStatus = useCallback(async (
    sessionId: string,
    accessToken: string,
    onProgress?: (status: RecommendationStatusResponse) => void,
    getStartError?: () => unknown,
  ) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const startError = getStartError?.();
      if (startError) {
        throw startError;
      }

      const status = await fetchApiJson<RecommendationStatusResponse>(
        `/api/recommend/status?session_id=${encodeURIComponent(sessionId)}`,
        { method: "GET" },
        accessToken,
      );

      onProgress?.(status);

      if (status.status === "completed" || status.status === "failed") {
        return status;
      }

      await sleep(1000);
    }

    throw {
      type: "AI_ERROR",
      message: "Recommendation generation timed out. Please try again.",
    };
  }, []);

  const streamStatus = useCallback(async (
    sessionId: string,
    accessToken: string,
    onProgress?: (status: RecommendationStatusResponse) => void,
    getStartError?: () => unknown,
  ): Promise<RecommendationStreamResult> => {
    const response = await fetch(`/api/recommend/stream?session_id=${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
      },
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null);
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message?: string }).message)
          : `Request failed: ${response.status}`;

      throw {
        type: normalizeGiftErrorType(
          payload && typeof payload === "object" ? (payload as { errorType?: string }).errorType : null,
          response.status,
          message,
        ),
        message,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let latestStatus: RecommendationStatusResponse | null = null;

    while (true) {
      const startError = getStartError?.();
      if (startError) {
        await reader.cancel().catch(() => undefined);
        throw startError;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n\n")) {
        const separatorIndex = buffer.indexOf("\n\n");
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        if (!block.trim()) continue;

        const parsed = parseSseEventBlock(block);
        if (!parsed.data) continue;

        let payload: unknown;
        try {
          payload = JSON.parse(parsed.data);
        } catch {
          continue;
        }

        if (parsed.event === "status") {
          latestStatus = payload as RecommendationStatusResponse;
          onProgress?.(latestStatus);
          continue;
        }

        if (parsed.event === "recommendations" && latestStatus) {
          const finalPayload = payload as {
            recommendations?: GiftRecommendation[] | null;
            product_results?: GiftSessionState["productResults"];
            occasion_insight?: string | null;
            budget_assessment?: string | null;
            cultural_note?: string | null;
            warning?: RecommendationStatusResponse["warning"];
            meta?: RecommendationStatusResponse["meta"];
          };

          latestStatus = {
            ...latestStatus,
            status: "completed",
            recommendations: finalPayload.recommendations ?? latestStatus.recommendations,
            product_results: finalPayload.product_results ?? latestStatus.product_results,
            occasion_insight: finalPayload.occasion_insight ?? latestStatus.occasion_insight,
            budget_assessment: finalPayload.budget_assessment ?? latestStatus.budget_assessment,
            cultural_note: finalPayload.cultural_note ?? latestStatus.cultural_note,
            warning: finalPayload.warning ?? latestStatus.warning,
            meta: finalPayload.meta ?? latestStatus.meta,
          };
          onProgress?.(latestStatus);
          continue;
        }

        if (parsed.event === "error") {
          const errorPayload = payload as { code?: string; message?: string };
          throw {
            type: normalizeGiftErrorType(errorPayload.code, 500, errorPayload.message || "Recommendation generation failed."),
            message: errorPayload.message || "Recommendation generation failed.",
          };
        }

        if (parsed.event === "done") {
          if (latestStatus) {
            return { status: latestStatus };
          }
        }
      }
    }

    if (latestStatus) {
      return { status: latestStatus };
    }

    throw {
      type: "AI_ERROR",
      message: "Recommendation stream ended unexpectedly. Please try again.",
    };
  }, []);

  const runGeneration = useCallback(
    async (
      params: GenerateGiftParams,
      options: { isRegeneration: boolean },
    ) => {
      const currentState = stateRef.current;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        isSearchingProducts: false,
        error: null,
        errorType: null,
        recommendations: options.isRegeneration ? prev.recommendations : null,
        productResults: options.isRegeneration ? prev.productResults : null,
        aiProviderUsed: null,
        aiLatencyMs: null,
        aiAttempt: null,
        engineVersion: null,
        currentNode: "gift_generator",
        nodesCompleted: [],
        nodeTimings: null,
        warningCode: null,
        warningMessage: null,
        avgPersonalizationScore: null,
        isComplete: false,
      }));

      try {
        let sessionId = currentState.sessionId;

        if (options.isRegeneration && !sessionId) {
          throw { type: "GENERIC", message: "Session missing. Please start again." };
        }

        if (!options.isRegeneration || !sessionId) {
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

            throw creditError;
          }
        }

        if (!sessionId) {
          throw { type: "GENERIC", message: "Session missing. Please start again." };
        }

        const accessToken = await getAccessToken();

        let startError: unknown = null;
        const startPromise = fetchApiJson<{ session_id: string; status: string }>(
          "/api/recommend/start",
          {
            method: "POST",
            body: JSON.stringify({
              session_id: sessionId,
              recipient_id: params.recipient.id,
              occasion: params.occasion,
              occasion_date: params.occasionDate,
              budget_min: params.budgetMin,
              budget_max: params.budgetMax,
              currency: params.currency,
              recipient_country: params.recipientCountry,
              user_country: params.userCountry,
              special_context: params.specialContext,
              context_tags: params.contextTags,
              user_plan: params.userPlan,
              is_regeneration: options.isRegeneration,
            }),
          },
          accessToken,
        ).catch((error) => {
          startError = error;
          throw error;
        });

        let status: RecommendationStatusResponse;
        const handleProgress = (progressStatus: RecommendationStatusResponse) => {
          setState((prev) => applyStatusSnapshot(prev, progressStatus, {
            isGenerating: progressStatus.status === "pending" || progressStatus.status === "in_progress",
            sessionId,
          }));
        };

        try {
          const streamResult = await streamStatus(sessionId, accessToken, handleProgress, () => startError);
          status = streamResult.status;
        } catch (streamError) {
          if (startError) {
            throw startError;
          }

          status = await pollStatus(sessionId, accessToken, handleProgress, () => startError);
        }

        await startPromise;

        if (status.status === "failed") {
          throw {
            type: normalizeGiftErrorType(status.error?.code, 500, status.error?.message || "Recommendation generation failed."),
            message: status.error?.message || "Recommendation generation failed.",
          };
        }

        setState((prev) => ({
          ...applyStatusSnapshot(prev, status, {
            isGenerating: false,
            sessionId,
            regenerationIncrement: options.isRegeneration,
          }),
          error: null,
          errorType: null,
        }));
      } catch (error) {
        const typedError =
          typeof error === "object" && error && "type" in error
            ? (error as { type?: GiftSessionState["errorType"]; message?: string })
            : { type: undefined, message: getErrorMessage(error) };

        const normalizedType = normalizeGiftErrorType(
          typedError.type,
          null,
          typedError.message || getErrorMessage(error),
        );

        setState((prev) => ({
          ...prev,
          isGenerating: false,
          isSearchingProducts: false,
          currentNode: null,
          error: normalizedType === "AUTH_REQUIRED"
            ? "Your session expired. Please sign in again and retry."
            : typedError.message || getErrorMessage(error),
          errorType: normalizedType,
        }));
      }
    },
    [createSession, deductCredit, pollStatus, streamStatus],
  );

  const generateGifts = useCallback(
    async (params: GenerateGiftParams) => {
      await runGeneration(params, { isRegeneration: false });
    },
    [runGeneration],
  );

  const regenerate = useCallback(
    async (params: GenerateGiftParams) => {
      await runGeneration(params, { isRegeneration: true });
    },
    [runGeneration],
  );

  const selectGift = useCallback(
    async (giftIndex: number, giftName: string) => {
      if (!state.sessionId) return;

      const accessToken = await getAccessToken();

      await fetchApiJson<{ success: boolean }>(
        "/api/recommend/select",
        {
          method: "POST",
          body: JSON.stringify({
            session_id: state.sessionId,
            gift_index: giftIndex,
            gift_name: giftName,
          }),
        },
        accessToken,
      );

      setState((prev) => ({
        ...prev,
        selectedGiftIndex: giftIndex,
        isComplete: true,
      }));
    },
    [state.sessionId],
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
        gift_concept_name: product.gift_name,
        product_title: product.product_title || product.store_name,
        product_url: outboundUrl,
        store: product.store_id,
        country: product.domain?.split(".").pop() || "",
        is_search_link: Boolean(product.is_search_link),
      });

      window.open(outboundUrl, "_blank", "noopener,noreferrer");
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
