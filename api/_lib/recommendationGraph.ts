import { enforceBudget } from "../../src/lib/recommendation-v2/budget";
import { buildGiftEmbeddingText, buildRecipientEmbeddingText } from "../../src/lib/recommendation-v2/embeddings";
import { type RecommendationGraphNodeId } from "../../src/lib/recommendation-v2/graphContract";
import {
  applySemanticMemoryGuard,
  type PastGiftSemanticMatch,
  type SemanticMemoryAssessment,
} from "../../src/lib/recommendation-v2/memory";
import { validateAndRankRecommendations } from "../../src/lib/recommendation-v2/personalization";
import { executeGraph, type GraphNode } from "../../src/lib/recommendation-v2/runtime";
import type { Json } from "../../src/integrations/supabase/types";
import type { GenerateGiftsResponse, GiftRecommendation } from "../../src/hooks/giftSessionTypes";
import { generateEmbedding } from "./openai";
import { createUserSupabaseClient, invokeSupabaseFunction } from "./supabase";

interface SearchProductsResponse {
  results: unknown;
}

export interface StartRequestBody {
  session_id: string;
  recipient_id: string;
  occasion: string;
  occasion_date: string | null;
  budget_min: number;
  budget_max: number;
  currency: string;
  recipient_country: string | null;
  user_country: string;
  special_context: string;
  context_tags: string[];
  user_plan: string;
  is_regeneration?: boolean;
}

export interface RecipientRecord {
  id: string;
  name: string;
  relationship: string | null;
  relationship_depth: string | null;
  age_range: string | null;
  gender: string | null;
  interests: string[] | null;
  cultural_context: string | null;
  country: string | null;
  notes: string | null;
}

export interface CulturalRuleMatch {
  id: string;
  rule_text: string;
  rule_type: string;
  confidence: number;
  similarity: number;
  context_tags: string[];
  avoid_examples: string[];
  suggest_instead: string[];
}

export interface PastGiftRow {
  gift_name: string;
  occasion: string;
  created_at: string;
}

type SupabaseClient = ReturnType<typeof createUserSupabaseClient>;

export interface RecommendationGraphState {
  accessToken: string;
  userId: string;
  body: StartRequestBody;
  recipient: RecipientRecord;
  supabase: SupabaseClient;
  nodeTimings: Record<string, number>;
  recipientEmbeddingSource: string | null;
  queryEmbeddingVector: string | null;
  culturalRules: CulturalRuleMatch[];
  pastGifts: PastGiftRow[];
  augmentedSpecialContext: string;
  generateResult: GenerateGiftsResponse | null;
  normalizedResponse: GenerateGiftsResponse | null;
  personalization:
    | ReturnType<typeof validateAndRankRecommendations>
    | null;
  productResults: Json | null;
  topConfidence: number | null;
  semanticAssessments: SemanticMemoryAssessment[];
  semanticFilteredCount: number;
  semanticPastGiftChecks: number;
  semanticRepeatMatchesByGiftName: Record<string, PastGiftSemanticMatch[]>;
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

function buildAugmentedSpecialContext(input: {
  baseSpecialContext: string;
  culturalRules: CulturalRuleMatch[];
  pastGifts: PastGiftRow[];
}) {
  const ruleSummary = input.culturalRules.length
    ? `CULTURAL RULES:\n${input.culturalRules
        .map((rule, index) => `${index + 1}. [${rule.rule_type}] ${rule.rule_text}`)
        .join("\n")}`
    : null;

  const giftSummary = input.pastGifts.length
    ? `PAST GIFTS FOR THIS RECIPIENT:\n${input.pastGifts
        .map((gift, index) => `${index + 1}. ${gift.gift_name} (${gift.occasion})`)
        .join("\n")}\nAvoid repeating the same gift or near-duplicate ideas.`
    : null;

  return compactParts([input.baseSpecialContext, ruleSummary, giftSummary]).join("\n\n");
}

function createGraphNodes(): Array<GraphNode<RecommendationGraphState, RecommendationGraphNodeId>> {
  return [
    {
      id: "recipient_analyzer",
      run: async (state) => {
        const recipientEmbeddingSource = buildRecipientEmbeddingText({
          id: state.recipient.id,
          name: state.recipient.name,
          relationship: state.recipient.relationship ?? "",
          relationship_depth: state.recipient.relationship_depth ?? "",
          age_range: state.recipient.age_range ?? "",
          gender: state.recipient.gender ?? "",
          interests: state.recipient.interests ?? [],
          cultural_context: state.recipient.cultural_context ?? "",
          country: state.body.recipient_country || state.recipient.country,
          notes: state.recipient.notes ?? "",
        });

        let queryEmbeddingVector: string | null = null;

        try {
          const queryText = compactParts([
            recipientEmbeddingSource,
            state.body.occasion ? `Occasion: ${state.body.occasion}` : null,
            state.body.special_context ? `Special context: ${state.body.special_context}` : null,
            state.body.context_tags.length ? `Context tags: ${state.body.context_tags.join(", ")}` : null,
          ]).join(". ");

          const embedding = await generateEmbedding(queryText);
          queryEmbeddingVector = embedding.vectorLiteral;

          await state.supabase
            .from("recipient_embeddings")
            .upsert({
              recipient_id: state.recipient.id,
              user_id: state.userId,
              embedding: embedding.vectorLiteral,
              embedding_model: "text-embedding-3-small",
              embedding_version: 1,
              source_text: recipientEmbeddingSource,
            }, { onConflict: "recipient_id" });
        } catch (error) {
          console.error("Failed to analyze recipient for recommendation graph:", error);
        }

        return {
          ...state,
          recipientEmbeddingSource,
          queryEmbeddingVector,
        };
      },
    },
    {
      id: "cultural_context_retriever",
      run: async (state) => {
        if (!state.queryEmbeddingVector) {
          return state;
        }

        try {
          const culturalResponse = await state.supabase.rpc("match_cultural_rules", {
            query_embedding: state.queryEmbeddingVector,
            filter_tags: state.body.context_tags,
            match_threshold: 0.55,
            match_count: 8,
          });

          return {
            ...state,
            culturalRules: culturalResponse.data ?? [],
          };
        } catch (error) {
          console.error("Failed to retrieve cultural rules:", error);
          return state;
        }
      },
    },
    {
      id: "past_gift_retriever",
      run: async (state) => {
        try {
          const pastGiftResponse = await state.supabase.rpc("get_recent_past_gifts", {
            p_recipient_id: state.recipient.id,
            p_limit: 10,
          });

          return {
            ...state,
            pastGifts: pastGiftResponse.data ?? [],
          };
        } catch (error) {
          console.error("Failed to retrieve recent past gifts:", error);
          return state;
        }
      },
    },
    {
      id: "gift_generator",
      run: async (state) => {
        const augmentedSpecialContext = buildAugmentedSpecialContext({
          baseSpecialContext: state.body.special_context,
          culturalRules: state.culturalRules,
          pastGifts: state.pastGifts,
        });

        const generateResult = await invokeSupabaseFunction<GenerateGiftsResponse>(
          "generate-gifts",
          state.accessToken,
          {
            recipient: {
              name: state.recipient.name,
              relationship: state.recipient.relationship,
              relationship_depth: state.recipient.relationship_depth,
              age_range: state.recipient.age_range,
              gender: state.recipient.gender,
              interests: state.recipient.interests || [],
              cultural_context: state.recipient.cultural_context,
              country: state.body.recipient_country || state.recipient.country,
              notes: state.recipient.notes,
            },
            occasion: state.body.occasion,
            occasion_date: state.body.occasion_date,
            budget_min: state.body.budget_min,
            budget_max: state.body.budget_max,
            currency: state.body.currency,
            recipient_country: state.body.recipient_country,
            special_context: augmentedSpecialContext,
            context_tags: state.body.context_tags,
            user_plan: state.body.user_plan,
            session_id: state.body.session_id,
            is_regeneration: Boolean(state.body.is_regeneration),
          },
        );

        if (!generateResult.ok || !generateResult.data?.recommendations) {
          const error = generateResult.data ?? { message: "Gift generation failed", errorType: "AI_ERROR" };
          throw Object.assign(new Error(String(error.message ?? "Gift generation failed")), {
            status: generateResult.status || 500,
            payload: error,
          });
        }

        return {
          ...state,
          augmentedSpecialContext,
          generateResult: generateResult.data,
        };
      },
    },
    {
      id: "budget_enforcer",
      run: async (state) => {
        if (!state.generateResult) {
          throw new Error("Graph budget node ran without generation output.");
        }

        const budgeted = enforceBudget<GiftRecommendation>(
          state.generateResult.recommendations,
          state.body.budget_min,
          state.body.budget_max,
        );

        const normalizedResponse: GenerateGiftsResponse = {
          ...state.generateResult,
          recommendations: budgeted.filtered,
          _warning: budgeted.warning?.code ?? null,
          _warning_message: budgeted.warning?.message ?? null,
        };

        let semanticAssessments: SemanticMemoryAssessment[] = [];
        let semanticFilteredCount = 0;
        let semanticPastGiftChecks = 0;
        let semanticRepeatMatchesByGiftName: Record<string, PastGiftSemanticMatch[]> = {};

        try {
          const semanticEntries = await Promise.all(
            normalizedResponse.recommendations.map(async (recommendation) => {
              const sourceText = buildGiftEmbeddingText({
                recommendation,
                occasion: state.body.occasion,
                recipient: {
                  relationship: state.recipient.relationship ?? "",
                  cultural_context: state.recipient.cultural_context ?? "",
                  country: state.body.recipient_country || state.recipient.country,
                },
              });

              const embedding = await generateEmbedding(sourceText);
              const pastGiftMatches = await state.supabase.rpc("match_past_gifts", {
                p_recipient_id: state.recipient.id,
                query_embedding: embedding.vectorLiteral,
                match_threshold: 0.78,
                match_count: 3,
              });

              return [recommendation.name, pastGiftMatches.data ?? []] as const;
            }),
          );

          const semanticMatchesByGiftName = Object.fromEntries(semanticEntries);
          const semanticMemory = applySemanticMemoryGuard(
            normalizedResponse.recommendations,
            semanticMatchesByGiftName,
          );

          normalizedResponse.recommendations = semanticMemory.recommendations;
          semanticAssessments = semanticMemory.assessments;
          semanticFilteredCount = semanticMemory.filteredCount;
          semanticPastGiftChecks = semanticMemory.assessments.filter((assessment) => assessment.highestSimilarity != null).length;
          semanticRepeatMatchesByGiftName = semanticMemory.penalizedMatchesByGiftName as typeof semanticRepeatMatchesByGiftName;

          if (semanticFilteredCount > 0) {
            const semanticNote = `Filtered ${semanticFilteredCount} recommendation${semanticFilteredCount === 1 ? "" : "s"} because they were too similar to previous gifts for this recipient.`;
            normalizedResponse.budget_assessment = compactParts([
              normalizedResponse.budget_assessment,
              semanticNote,
            ]).join("\n\n");
          }
        } catch (error) {
          console.error("Failed to apply semantic past gift filtering:", error);
        }

        return {
          ...state,
          normalizedResponse,
          semanticAssessments,
          semanticFilteredCount,
          semanticPastGiftChecks,
          personalization: null,
          semanticRepeatMatchesByGiftName,
        };
      },
    },
    {
      id: "personalization_validator",
      run: (state) => {
        if (!state.normalizedResponse) {
          throw new Error("Graph personalization node ran without normalized recommendations.");
        }

        const personalization = validateAndRankRecommendations(state.normalizedResponse.recommendations, {
          recipient: {
            id: state.recipient.id,
            name: state.recipient.name,
            relationship: state.recipient.relationship ?? "",
            relationship_depth: state.recipient.relationship_depth ?? "",
            age_range: state.recipient.age_range ?? "",
            gender: state.recipient.gender ?? "",
            interests: state.recipient.interests ?? [],
            cultural_context: state.recipient.cultural_context ?? "",
            country: state.body.recipient_country || state.recipient.country,
            notes: state.recipient.notes ?? "",
          },
          specialContext: state.augmentedSpecialContext,
          contextTags: state.body.context_tags,
          pastGiftNames: state.pastGifts.map((gift) => gift.gift_name),
          semanticRepeatMatchesByGiftName: state.semanticRepeatMatchesByGiftName,
        });

        return {
          ...state,
          personalization,
          normalizedResponse: {
            ...state.normalizedResponse,
            recommendations: personalization.recommendations,
            _meta: {
              ...(state.normalizedResponse._meta ?? {}),
              avg_personalization_score: personalization.averageScore,
              semantic_repeat_filtered_count: state.semanticFilteredCount,
            },
          },
        };
      },
    },
    {
      id: "response_formatter",
      run: async (state) => {
        if (!state.normalizedResponse) {
          throw new Error("Graph response formatter ran without recommendations.");
        }

        const productSearchResult = await invokeSupabaseFunction<SearchProductsResponse>(
          "search-products",
          state.accessToken,
          {
            gift_concepts: state.normalizedResponse.recommendations.map((recommendation) => ({
              name: recommendation.name,
              search_keywords: recommendation.search_keywords,
              product_category: recommendation.product_category,
              price_anchor: recommendation.price_anchor,
            })),
            recipient_country: state.body.recipient_country || "",
            user_country: state.body.user_country,
            currency: state.body.currency,
            budget_min: state.body.budget_min,
            budget_max: state.body.budget_max,
            user_plan: state.body.user_plan,
          },
        );

        const topConfidence = state.normalizedResponse.recommendations.reduce(
          (max, recommendation) => Math.max(max, recommendation.confidence_score ?? 0),
          0,
        );

        return {
          ...state,
          productResults: (productSearchResult.ok ? productSearchResult.data?.results ?? null : null) as Json,
          topConfidence: topConfidence || null,
        };
      },
    },
  ];
}

export function createInitialRecommendationGraphState(input: {
  accessToken: string;
  userId: string;
  body: StartRequestBody;
  recipient: RecipientRecord;
  supabase: SupabaseClient;
}): RecommendationGraphState {
  return {
    accessToken: input.accessToken,
    userId: input.userId,
    body: input.body,
    recipient: input.recipient,
    supabase: input.supabase,
    nodeTimings: {},
    recipientEmbeddingSource: null,
    queryEmbeddingVector: null,
    culturalRules: [],
    pastGifts: [],
    augmentedSpecialContext: "",
    generateResult: null,
    normalizedResponse: null,
    personalization: null,
    productResults: null,
    topConfidence: null,
    semanticAssessments: [],
    semanticFilteredCount: 0,
    semanticPastGiftChecks: 0,
    semanticRepeatMatchesByGiftName: {},
  };
}

export async function executeRecommendationGraph(
  initialState: RecommendationGraphState,
  options?: {
    onNodeComplete?: (state: RecommendationGraphState, nodeId: RecommendationGraphNodeId) => Promise<void> | void;
  },
) {
  const nodes = createGraphNodes();

  return executeGraph(initialState, nodes, {
    applyNodeTiming: (state, nodeId, durationMs) => ({
      ...state,
      nodeTimings: {
        ...state.nodeTimings,
        [nodeId]: durationMs,
      },
    }),
    onNodeComplete: async ({ nodeId, state }) => {
      await options?.onNodeComplete?.(state, nodeId);
    },
  });
}

export function buildRecommendationGraphProgressUpdate(state: RecommendationGraphState) {
  return {
    node_timings: state.nodeTimings as unknown as Json,
    engine_version: "v2",
    status: "in_progress",
    personalization_scores: state.personalization?.scores as unknown as Json ?? null,
    cultural_rules_applied: state.culturalRules.length,
    past_gifts_checked: state.pastGifts.length + state.semanticPastGiftChecks,
  };
}
