import type { GiftRecommendation, Recipient } from "../../hooks/giftSessionTypes";
import type { PastGiftSemanticMatch } from "./memory";

export interface PersonalizationContext {
  recipient: Recipient;
  specialContext?: string | null;
  contextTags?: string[];
  pastGiftNames?: string[];
  semanticRepeatMatchesByGiftName?: Record<string, PastGiftSemanticMatch[]>;
}

export interface PersonalizationScoreEntry {
  gift_index: number;
  score: number;
  was_rewritten: boolean;
  original_score: number | null;
  reasons: string[];
}

interface ValidationResult {
  recommendations: GiftRecommendation[];
  scores: PersonalizationScoreEntry[];
  averageScore: number;
}

const GENERIC_GIFT_PATTERNS = [
  /\bgift card\b/i,
  /\bflowers?\b/i,
  /\bchocolates?\b/i,
  /\bcandles?\b/i,
  /\bmug\b/i,
  /\bvoucher\b/i,
];

function normalize(value: string) {
  return value.toLowerCase();
}

function tokenize(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

function includesPhrase(haystack: string, needle: string) {
  return normalize(haystack).includes(normalize(needle));
}

function hasInterestMatch(rec: GiftRecommendation, interests: string[]) {
  const corpus = [
    rec.name,
    rec.description,
    rec.why_it_works,
    rec.signal_interpretation,
    rec.product_category,
    ...(rec.search_keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return interests.some((interest) => includesPhrase(corpus, interest));
}

function isRepeatGift(rec: GiftRecommendation, pastGiftNames: string[]) {
  const giftName = normalize(rec.name);
  return pastGiftNames.some((pastGift) => normalize(pastGift) === giftName);
}

function getStrongestSemanticMatch(
  recommendation: GiftRecommendation,
  matchesByGiftName: Record<string, PastGiftSemanticMatch[]> | undefined,
) {
  const matches = matchesByGiftName?.[recommendation.name] ?? [];
  return [...matches].sort((left, right) => right.similarity - left.similarity)[0] ?? null;
}

function scoreRecommendation(
  recommendation: GiftRecommendation,
  context: PersonalizationContext,
) {
  const reasons: string[] = [];
  let score = 40;

  const interests = (context.recipient.interests ?? []).map((interest) => interest.trim()).filter(Boolean);
  if (interests.length > 0 && hasInterestMatch(recommendation, interests)) {
    score += 22;
    reasons.push("interest_match");
  }

  if (context.recipient.relationship && includesPhrase(recommendation.why_it_works, context.recipient.relationship)) {
    score += 10;
    reasons.push("relationship_specific");
  }

  if (context.recipient.relationship_depth && includesPhrase(recommendation.signal_interpretation, context.recipient.relationship_depth.replace(/_/g, " "))) {
    score += 6;
    reasons.push("relationship_depth_signal");
  }

  if (context.recipient.cultural_context && includesPhrase(recommendation.why_it_works, context.recipient.cultural_context.replace(/_/g, " "))) {
    score += 8;
    reasons.push("cultural_context");
  }

  if (context.specialContext && tokenize(context.specialContext).some((token) => token.length > 4 && includesPhrase(recommendation.why_it_works, token))) {
    score += 6;
    reasons.push("special_context");
  }

  if (context.contextTags?.length) {
    const joined = [recommendation.description, recommendation.why_it_works, recommendation.signal_interpretation].join(" ").toLowerCase();
    const matchedTag = context.contextTags.some((tag) => includesPhrase(joined, tag.replace(/[_-]/g, " ")));
    if (matchedTag) {
      score += 5;
      reasons.push("context_tag_alignment");
    }
  }

  if (recommendation.product_category && recommendation.product_category !== "general") {
    score += 4;
    reasons.push("specific_category");
  }

  if (GENERIC_GIFT_PATTERNS.some((pattern) => pattern.test(recommendation.name) || pattern.test(recommendation.description))) {
    score -= 20;
    reasons.push("generic_gift_penalty");
  }

  if (isRepeatGift(recommendation, context.pastGiftNames ?? [])) {
    score -= 35;
    reasons.push("repeat_gift_penalty");
  }

  const semanticMatch = getStrongestSemanticMatch(recommendation, context.semanticRepeatMatchesByGiftName);
  if (semanticMatch) {
    score -= semanticMatch.reaction === "didnt_like" ? 24 : 18;
    reasons.push("semantic_repeat_penalty");

    if (semanticMatch.reaction === "didnt_like") {
      reasons.push("negative_feedback_history");
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

function personalizeRecommendation(
  recommendation: GiftRecommendation,
  context: PersonalizationContext,
  score: number,
  reasons: string[],
) {
  if (score >= 70) {
    return {
      recommendation,
      score,
      wasRewritten: false,
      originalScore: null,
      reasons,
    };
  }

  const firstInterest = context.recipient.interests?.find(Boolean);
  const personalizationSentence = compactParts([
    firstInterest ? `It connects directly to their interest in ${firstInterest}.` : null,
    context.recipient.relationship ? `It feels appropriate for a ${context.recipient.relationship}.` : null,
    context.specialContext ? `It also fits the context of ${context.specialContext}.` : null,
  ]).join(" ");

  if (!personalizationSentence) {
    return {
      recommendation,
      score,
      wasRewritten: false,
      originalScore: null,
      reasons,
    };
  }

  const rewritten: GiftRecommendation = {
    ...recommendation,
    why_it_works: compactParts([
      recommendation.why_it_works,
      personalizationSentence,
    ]).join(" "),
  };

  return {
    recommendation: rewritten,
    score: Math.min(100, score + 10),
    wasRewritten: true,
    originalScore: score,
    reasons: [...reasons, "light_rewrite"],
  };
}

export function validateAndRankRecommendations(
  recommendations: GiftRecommendation[],
  context: PersonalizationContext,
): ValidationResult {
  const scored = recommendations.map((recommendation, index) => {
    const base = scoreRecommendation(recommendation, context);
    const rewritten = personalizeRecommendation(recommendation, context, base.score, base.reasons);

    return {
      gift_index: index,
      recommendation: rewritten.recommendation,
      score: rewritten.score,
      was_rewritten: rewritten.wasRewritten,
      original_score: rewritten.originalScore,
      reasons: rewritten.reasons,
    };
  });

  scored.sort((left, right) => right.score - left.score);

  const averageScore =
    scored.length === 0
      ? 0
      : scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length;

  return {
    recommendations: scored.map((entry) => entry.recommendation),
    scores: scored.map((entry, index) => ({
      gift_index: index,
      score: entry.score,
      was_rewritten: entry.was_rewritten,
      original_score: entry.original_score,
      reasons: entry.reasons,
    })),
    averageScore,
  };
}
