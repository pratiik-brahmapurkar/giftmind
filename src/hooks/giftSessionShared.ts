import { supabase } from "@/integrations/supabase/client";
import type { GiftRecommendation, GiftSessionRow, GiftSessionState } from "@/hooks/giftSessionTypes";
import type { ProductResult } from "@/lib/productLinks";

export const initialState: GiftSessionState = {
  sessionId: null,
  isGenerating: false,
  isSearchingProducts: false,
  recommendations: null,
  productResults: null,
  occasionInsight: null,
  budgetAssessment: null,
  culturalNote: null,
  aiProviderUsed: null,
  aiLatencyMs: null,
  aiAttempt: null,
  engineVersion: null,
  currentNode: null,
  nodesCompleted: [],
  nodeTimings: null,
  warningCode: null,
  warningMessage: null,
  avgPersonalizationScore: null,
  error: null,
  errorType: null,
  refundIssued: null,
  regenerationCount: 0,
  selectedGiftIndex: null,
  selectedGiftName: null,
  selectedGiftNote: null,
  isComplete: false,
};

export function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Something went wrong");
  }
  return "Something went wrong";
}

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session?.access_token) return refreshed.data.session.access_token;

  throw { type: "AUTH_REQUIRED", message: "Your session expired. Please sign in again." };
}

export async function getFunctionErrorDetails(error: unknown) {
  const fallback = getErrorMessage(error);

  if (typeof error !== "object" || !error || !("context" in error)) {
    return {
      status: null as number | null,
      message: fallback,
      payload: null as Record<string, unknown> | null,
    };
  }

  const context = (error as { context?: Response }).context;
  if (!(context instanceof Response)) {
    return {
      status: null as number | null,
      message: fallback,
      payload: null as Record<string, unknown> | null,
    };
  }

  let message = fallback;
  let payload: Record<string, unknown> | null = null;

  try {
    const parsed = await context.clone().json();
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, unknown>;
      const data = parsed as { error?: string; message?: string };
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

  return { status: context.status, message, payload };
}

export async function invokeAuthedFunction<TResponse>(name: string, body: Record<string, unknown>) {
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

export function normalizeGiftErrorType(
  rawType: unknown,
  status: number | null,
  message: string,
): GiftSessionState["errorType"] {
  const explicit = typeof rawType === "string" ? rawType.toUpperCase() : "";
  const upperMessage = message.toUpperCase();

  if (explicit === "NO_CREDITS" || status === 402 || upperMessage.includes("NO_CREDITS") || upperMessage.includes("INSUFFICIENT CREDITS")) {
    return "NO_CREDITS";
  }

  if (explicit === "RATE_LIMITED" || status === 429 || upperMessage.includes("RATE_LIMIT")) {
    return "RATE_LIMITED";
  }

  if (explicit === "AI_PARSE_ERROR" || upperMessage.includes("INVALID RESPONSE") || upperMessage.includes("AI RESPONSE WAS INVALID")) {
    return "AI_PARSE_ERROR";
  }

  if (explicit === "AUTH_REQUIRED" || status === 401 || upperMessage.includes("AUTH") || upperMessage.includes("UNAUTHORIZED")) {
    return "AUTH_REQUIRED";
  }

  if (explicit === "GENERIC") {
    return "GENERIC";
  }

  if (explicit === "NETWORK" || upperMessage.includes("FAILED TO FETCH") || upperMessage.includes("NETWORK")) {
    return "NETWORK";
  }

  return "AI_ERROR";
}

export function isNoCreditError(error: unknown) {
  if (typeof error === "object" && error && "type" in error) {
    const typed = error as { type?: string };
    if (typed.type === "NO_CREDITS") return true;
  }

  const message = getErrorMessage(error).toUpperCase();
  return message.includes("NO_CREDITS") || message.includes("INSUFFICIENT CREDITS");
}

export async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function calculateFeedbackReminderAt(occasionDate: string | null | undefined) {
  if (!occasionDate) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback.toISOString();
  }

  const date = new Date(`${occasionDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback.toISOString();
  }

  date.setDate(date.getDate() + 2);
  return date.toISOString();
}

export async function upsertFeedbackReminder(params: {
  userId: string;
  sessionId: string;
  recipientId?: string | null;
  occasion: string;
  occasionDate?: string | null;
}) {
  const remindAt = calculateFeedbackReminderAt(params.occasionDate);

  const { error } = await supabase
    .from("feedback_reminders")
    .upsert({
      user_id: params.userId,
      session_id: params.sessionId,
      recipient_id: params.recipientId ?? null,
      occasion: params.occasion,
      occasion_date: params.occasionDate ?? null,
      remind_at: remindAt,
      status: "pending",
    }, { onConflict: "session_id" });

  if (error) {
    throw error;
  }
}

function parseRecommendations(value: unknown): GiftRecommendation[] | null {
  if (!value || typeof value !== "object") return null;
  const recommendations = (value as { recommendations?: GiftRecommendation[] }).recommendations;
  return Array.isArray(recommendations) ? recommendations : null;
}

function parseProductResults(value: unknown): ProductResult[] | null {
  return Array.isArray(value) ? (value as ProductResult[]) : null;
}

export function hydrateGiftSessionState(session: GiftSessionRow): Partial<GiftSessionState> {
  const recommendations = parseRecommendations(session.ai_response);
  const avgPersonalizationScore =
    session.ai_response && typeof session.ai_response === "object" && "meta" in (session.ai_response as Record<string, unknown>)
      ? Number(((session.ai_response as { meta?: { avg_personalization_score?: number } }).meta?.avg_personalization_score) ?? null)
      : null;

  return {
    sessionId: session.id,
    recommendations,
    productResults: parseProductResults(session.product_results),
    aiProviderUsed: session.ai_provider_used,
    aiLatencyMs: session.ai_latency_ms,
    aiAttempt: session.ai_attempt_number,
    occasionInsight:
      session.ai_response && typeof session.ai_response === "object"
        ? ((session.ai_response as { occasion_insight?: string | null }).occasion_insight ?? null)
        : null,
    budgetAssessment:
      session.ai_response && typeof session.ai_response === "object"
        ? ((session.ai_response as { budget_assessment?: string | null }).budget_assessment ?? null)
        : null,
    culturalNote:
      session.ai_response && typeof session.ai_response === "object"
        ? ((session.ai_response as { cultural_note?: string | null }).cultural_note ?? null)
        : null,
    engineVersion: session.engine_version ?? null,
    nodeTimings:
      session.node_timings && typeof session.node_timings === "object"
        ? (session.node_timings as Record<string, number>)
        : null,
    avgPersonalizationScore: Number.isFinite(avgPersonalizationScore) ? avgPersonalizationScore : null,
    regenerationCount: session.regeneration_count ?? 0,
    selectedGiftIndex: session.selected_gift_index,
    selectedGiftName: session.selected_gift_name,
    selectedGiftNote: session.selected_gift_note,
    isComplete: session.status === "completed",
    isGenerating: false,
    isSearchingProducts: false,
    error:
      session.status === "errored"
        ? "This session ran into an AI error. You can try again."
        : null,
    errorType: session.status === "errored" ? "AI_ERROR" : null,
    refundIssued: null,
  };
}
