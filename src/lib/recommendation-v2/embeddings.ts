import type { GiftRecommendation, Recipient } from "../../hooks/giftSessionTypes.js";

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

function joinList(values: string[] | null | undefined, fallback = "unknown") {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : fallback;
}

function limitWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

export function buildRecipientEmbeddingText(recipient: Recipient) {
  const sections = compactParts([
    `Recipient: ${recipient.name}`,
    `Relationship: ${recipient.relationship || "unknown"} (${recipient.relationship_depth || "unspecified closeness"})`,
    `Age range: ${recipient.age_range || "unknown"}`,
    `Gender: ${recipient.gender || "unknown"}`,
    `Cultural context: ${recipient.cultural_context || "unknown"}`,
    `Country: ${recipient.country || "unknown"}`,
    `Interests: ${joinList(recipient.interests)}`,
    recipient.notes ? `Notes: ${recipient.notes}` : null,
  ]);

  return limitWords(sections.join(". "), 220);
}

export function buildGiftEmbeddingText(input: {
  recommendation: GiftRecommendation;
  occasion: string;
  recipient?: Pick<Recipient, "relationship" | "cultural_context" | "country"> | null;
}) {
  const { recommendation, occasion, recipient } = input;

  const sections = compactParts([
    `Gift: ${recommendation.name}`,
    recommendation.description ? `Description: ${recommendation.description}` : null,
    recommendation.why_it_works ? `Why it works: ${recommendation.why_it_works}` : null,
    recommendation.product_category ? `Category: ${recommendation.product_category}` : null,
    typeof recommendation.price_anchor === "number" ? `Price anchor: ${recommendation.price_anchor}` : null,
    occasion ? `Occasion: ${occasion}` : null,
    recipient?.relationship ? `Relationship: ${recipient.relationship}` : null,
    recipient?.cultural_context ? `Cultural context: ${recipient.cultural_context}` : null,
    recipient?.country ? `Country: ${recipient.country}` : null,
  ]);

  return limitWords(sections.join(". "), 220);
}
