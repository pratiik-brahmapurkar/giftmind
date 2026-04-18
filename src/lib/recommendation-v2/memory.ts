import type { GiftRecommendation } from "../../hooks/giftSessionTypes";

export interface PastGiftSemanticMatch {
  gift_name: string;
  gift_description: string | null;
  occasion: string | null;
  reaction: string | null;
  similarity: number;
  gifted_at: string;
}

export interface SemanticMemoryAssessment {
  recommendationName: string;
  highestSimilarity: number | null;
  matchedGiftName: string | null;
  reaction: string | null;
  decision: "keep" | "penalize" | "drop";
  reasons: string[];
}

interface SemanticMemoryGuardResult {
  recommendations: GiftRecommendation[];
  penalizedMatchesByGiftName: Record<string, PastGiftSemanticMatch[]>;
  assessments: SemanticMemoryAssessment[];
  filteredCount: number;
}

export const SEMANTIC_REPEAT_PENALTY_THRESHOLD = 0.82;
export const SEMANTIC_REPEAT_DROP_THRESHOLD = 0.92;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getStrongestMatch(matches: PastGiftSemanticMatch[]) {
  return [...matches].sort((left, right) => right.similarity - left.similarity)[0] ?? null;
}

export function applySemanticMemoryGuard(
  recommendations: GiftRecommendation[],
  matchesByGiftName: Record<string, PastGiftSemanticMatch[]>,
): SemanticMemoryGuardResult {
  const assessments = recommendations.map((recommendation) => {
    const matches = matchesByGiftName[recommendation.name] ?? [];
    const strongestMatch = getStrongestMatch(matches);
    const reasons: string[] = [];
    let decision: SemanticMemoryAssessment["decision"] = "keep";

    if (strongestMatch) {
      const exactNameMatch = normalize(strongestMatch.gift_name) === normalize(recommendation.name);
      if (exactNameMatch) {
        reasons.push("exact_name_repeat");
      }

      if (exactNameMatch || strongestMatch.similarity >= SEMANTIC_REPEAT_DROP_THRESHOLD) {
        decision = "drop";
        reasons.push("semantic_repeat_drop");
      } else if (strongestMatch.similarity >= SEMANTIC_REPEAT_PENALTY_THRESHOLD) {
        decision = "penalize";
        reasons.push("semantic_repeat_penalty");
      }

      if (strongestMatch.reaction === "didnt_like") {
        reasons.push("negative_feedback_history");
      }
    }

    return {
      recommendationName: recommendation.name,
      highestSimilarity: strongestMatch?.similarity ?? null,
      matchedGiftName: strongestMatch?.gift_name ?? null,
      reaction: strongestMatch?.reaction ?? null,
      decision,
      reasons,
    } satisfies SemanticMemoryAssessment;
  });

  const keptRecommendations = recommendations.filter((recommendation) => {
    const assessment = assessments.find((entry) => entry.recommendationName === recommendation.name);
    return assessment?.decision !== "drop";
  });

  const fallbackRecommendations =
    keptRecommendations.length > 0
      ? keptRecommendations
      : (() => {
          const leastRisk = [...recommendations].sort((left, right) => {
            const leftSimilarity = assessments.find((entry) => entry.recommendationName === left.name)?.highestSimilarity ?? 1;
            const rightSimilarity = assessments.find((entry) => entry.recommendationName === right.name)?.highestSimilarity ?? 1;
            return leftSimilarity - rightSimilarity;
          })[0];

          return leastRisk ? [leastRisk] : [];
        })();

  const penalizedMatchesByGiftName = assessments.reduce<Record<string, PastGiftSemanticMatch[]>>((acc, assessment) => {
    if (assessment.decision !== "penalize") return acc;
    const matches = matchesByGiftName[assessment.recommendationName] ?? [];
    if (matches.length > 0) {
      acc[assessment.recommendationName] = matches;
    }
    return acc;
  }, {});

  return {
    recommendations: fallbackRecommendations,
    penalizedMatchesByGiftName,
    assessments,
    filteredCount: Math.max(0, recommendations.length - fallbackRecommendations.length),
  };
}
