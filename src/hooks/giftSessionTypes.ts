import type { ProductResult } from "../lib/productLinks";

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

export interface GiftSessionState {
  sessionId: string | null;
  isGenerating: boolean;
  isSearchingProducts: boolean;
  recommendations: GiftRecommendation[] | null;
  productResults: ProductResult[] | null;
  occasionInsight: string | null;
  budgetAssessment: string | null;
  culturalNote: string | null;
  aiProviderUsed: string | null;
  aiLatencyMs: number | null;
  aiAttempt: number | null;
  engineVersion: string | null;
  currentNode: string | null;
  nodesCompleted: string[];
  nodeTimings: Record<string, number> | null;
  warningCode: string | null;
  warningMessage: string | null;
  avgPersonalizationScore: number | null;
  error: string | null;
  errorType: "NO_CREDITS" | "RATE_LIMITED" | "AI_ERROR" | "AI_PARSE_ERROR" | "AUTH_REQUIRED" | "GENERIC" | null;
  regenerationCount: number;
  selectedGiftIndex: number | null;
  isComplete: boolean;
}

export interface GenerateGiftParams {
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

export interface GenerateGiftsResponse {
  recommendations: GiftRecommendation[];
  occasion_insight: string | null;
  budget_assessment: string | null;
  cultural_note: string | null;
  _warning?: string | null;
  _warning_message?: string | null;
  _meta?: {
    provider?: string | null;
    latency_ms?: number | null;
    attempt?: number | null;
    avg_personalization_score?: number | null;
    semantic_repeat_filtered_count?: number | null;
  };
  error?: string;
  errorType?: string;
  message?: string;
  retry_after?: number;
}
