# 09 — Personalization Engine

---

## The Personalization Problem

GiftMind's value proposition is that it generates gifts that feel like they were chosen by someone who truly knows the recipient. The current system cannot reliably deliver on this because there is no mechanism to verify that a recommendation is actually personalized.

A recommendation can pass `validateAIResponse()` (v1's only quality check) while containing:
- No mention of the recipient's name
- No reference to their specific interests
- Generic phrases like "thoughtful and perfect for any occasion"
- A `why_it_works` paragraph that could apply to literally any recipient

The personalization validator (Node 7) closes this gap. It acts as a quality gate between raw generation and final output.

---

## Defining Personalization

A recommendation is "personalized" for GiftMind's purposes when the `why_it_works` field demonstrably connects the gift to THIS specific recipient in THIS specific context.

### What Personalization Looks Like

**Generic (fails validation):**
> "This beautiful scented candle set makes for a wonderful gift for any occasion. The recipient will surely appreciate this thoughtful gesture."

**Personalized (passes validation):**
> "Priya's deep love of home cooking and her recent move to a new apartment in London make this regional Indian spice subscription perfect timing — she's been exploring British curry traditions and these single-origin South Indian spices would let her recreate the flavors she grew up with."

The difference is not length — it is specificity. The personalized version contains:
- Recipient's name ("Priya")
- Two specific interests ("home cooking", "move to London")
- Occasion relevance ("recent move" + timing)
- Specific gift mechanism ("single-origin South Indian spices")
- Cultural connection ("recreate the flavors she grew up with")

---

## Scoring Rubric

Node 7 uses Claude Haiku to score each `why_it_works` on a 0–100 scale:

| Dimension | Max Points | Criteria |
|-----------|-----------|----------|
| **Interest references** | 30 | Mentions ≥2 specific interests from the recipient profile. Named interests, not just categories. |
| **Occasion connection** | 25 | Connects the gift to the specific occasion in a meaningful way (not just "perfect for birthdays") |
| **Generic phrase avoidance** | 25 | No phrases like "any occasion", "anyone who loves X", "thoughtful gesture", "surely appreciate" |
| **Relationship/context specificity** | 20 | References something about the relationship depth, history, or special context |
| **Total** | 100 | Score ≥ 70 required to pass without rewrite |

### Score Interpretation

| Score | Action |
|-------|--------|
| 85–100 | Pass, no changes needed |
| 70–84 | Pass, minor improvement possible but not required |
| 50–69 | Rewrite `why_it_works` using Node 7's rewrite suggestion |
| < 50 | Reject recommendation; replace with next candidate from Node 5's output (or re-run Node 5) |

---

## Node 7 Implementation

### Prompt Design

```typescript
const VALIDATOR_SYSTEM_PROMPT = `You are a personalization quality validator for gift recommendations.

Your job: score whether each "why_it_works" paragraph is genuinely personalized OR generic.

SCORING RUBRIC (total: 100 points):
+30 points — Mentions ≥2 SPECIFIC interests from the recipient profile (named, not just categories)
+25 points — Connects to the SPECIFIC occasion in a meaningful way (not just "great for X occasion")
+25 points — Avoids generic phrases (no: "perfect for anyone", "great choice", "surely appreciate", "thoughtful gesture")
+20 points — References something specific about the relationship, history, or context provided

REWRITE RULES (when score < 70):
- Keep the gift name and basic description unchanged
- Rewrite ONLY the why_it_works paragraph
- Use specific details from the profile
- First sentence must name a specific interest
- Second sentence must connect to the occasion
- Never use generic filler phrases
- Maximum 3 sentences

Return strict JSON only.`

const buildValidatorMessage = (
  recipientName: string,
  primaryInterests: string[],
  lifestyle: string,
  relationship: string,
  occasion: string,
  occasionContext: OccasionContext | null,
  specialContext: string,
  recommendations: GiftRecommendation[]
) => `
RECIPIENT PROFILE:
Name: ${recipientName}
Specific interests (use these!): ${primaryInterests.slice(0, 5).join(', ')}
Lifestyle: ${lifestyle}
Relationship: ${relationship}
Occasion: ${occasion}
Occasion context: ${occasionContext?.gift_norms ?? 'Not specified'}
Special context: ${specialContext || 'None'}

RECOMMENDATIONS TO VALIDATE:
${JSON.stringify(recommendations.map((r, i) => ({
  index: i,
  gift_name: r.name,
  why_it_works: r.why_it_works
})), null, 2)}

Validate each recommendation and return:
[
  {
    "gift_index": 0,
    "score": 85,
    "dimensions": {
      "interest_references": 30,
      "occasion_connection": 20,
      "generic_avoidance": 20,
      "context_specificity": 15
    },
    "issues": [],
    "rewrite": null
  },
  {
    "gift_index": 1,
    "score": 48,
    "dimensions": {
      "interest_references": 0,
      "occasion_connection": 15,
      "generic_avoidance": 18,
      "context_specificity": 15
    },
    "issues": ["no specific interests mentioned", "generic phrase: 'perfect for any occasion'"],
    "rewrite": "Given ${recipientName}'s love of [specific interest] and [specific interest], this [gift] is particularly fitting because [occasion-specific reason]."
  }
]`
```

### Node Implementation

```typescript
export async function personalizationValidatorNode(
  state: RecommendationState
): Promise<Partial<RecommendationState>> {
  const startMs = Date.now()
  const warnings = [...state.metadata.warnings]

  let validationResults: ValidationResult[] = []

  try {
    const result = await callAIWithFallback(
      ['claude-haiku'],  // All plans use same validator
      {
        systemPrompt: VALIDATOR_SYSTEM_PROMPT,
        userMessage: buildValidatorMessage(
          state.recipientName,
          state.recipientAnalysis?.primary_interests ?? state.recipientInterests,
          state.recipientAnalysis?.lifestyle ?? 'not specified',
          state.recipientRelationship,
          state.occasion,
          state.occasionContext,
          state.specialContext,
          state.budgetFilteredRecommendations,
        ),
        maxTokens: 1500,
        temperature: 0.2,  // Low temperature for consistent scoring
        responseFormat: 'json',
      }
    )

    validationResults = parseAIJson(result.text) as ValidationResult[]
  } catch (error) {
    // Fallback: skip validation, proceed with unvalidated recommendations
    warnings.push('PERSONALIZATION_VALIDATION_SKIPPED: ' + getErrorMessage(error))
    return {
      validatedRecommendations: state.budgetFilteredRecommendations.map(r => ({
        ...r,
        personalization_score: undefined,
      })),
      metadata: {
        ...state.metadata,
        nodeTimings: { ...state.metadata.nodeTimings, personalization_validator: Date.now() - startMs },
        warnings,
      },
    }
  }

  // Apply validation results
  const validated = state.budgetFilteredRecommendations.map((rec, i) => {
    const validation = validationResults.find(v => v.gift_index === i)
    if (!validation) return { ...rec, personalization_score: 70 }  // Default if missing

    let finalRec = { ...rec, personalization_score: validation.score }

    if (validation.score < 70 && validation.rewrite) {
      // Rewrite the why_it_works
      finalRec = { ...finalRec, why_it_works: validation.rewrite }
    }

    return finalRec
  })

  // Filter out recs with score < 50 if we have enough alternatives
  const passing = validated.filter(r => (r.personalization_score ?? 0) >= 50)
  const finalRecs = passing.length >= 3 ? passing : validated  // Fallback: keep all if not enough pass

  return {
    validatedRecommendations: finalRecs,
    metadata: {
      ...state.metadata,
      nodeTimings: {
        ...state.metadata.nodeTimings,
        personalization_validator: Date.now() - startMs,
      },
      warnings,
    },
  }
}
```

---

## Common Failure Patterns and Fixes

### Pattern 1: Generic "Why It Works"

**Raw generation output:**
> "This wonderful cookbook would make a lovely addition to any kitchen and is sure to be appreciated by food lovers."

**Validator score:** 12/100 (mentions no interests, no occasion connection, all generic phrases)

**Node 7 rewrite:**
> "Priya's passion for home cooking and her ongoing exploration of regional South Indian cuisine makes this collection of Kerala recipes particularly relevant right now — especially as she's just set up her own kitchen in London and mentioned wanting to recreate coastal dishes from her childhood."

**Score after rewrite:** 88/100

---

### Pattern 2: Interest-Adjacent But Not Specific

**Raw generation output:**
> "As someone who loves cooking, this premium knife set is the perfect gift for culinary enthusiasts."

**Validator score:** 42/100 (mentions 1 interest but generically, contains "culinary enthusiasts" = generic, no occasion connection)

**Node 7 rewrite:**
> "Priya's focus on Indian home cooking and her recent interest in learning knife techniques (mentioned in her notes) makes this Damascus chef's knife a meaningful upgrade — and at her current cooking skill level, a quality knife would transform her daily practice more than any cookbook."

**Score after rewrite:** 81/100

---

### Pattern 3: Correct But Overlong

**Raw generation output:**
> "Priya loves cooking, gardening, and reading, and this gift relates to all three of these interests. As someone who gardens, she would appreciate the natural ingredients, and as a cook, she would use this in the kitchen, and since she reads, the accompanying recipe booklet would give her something to read. This is truly a perfect gift for her diwali celebration and for any other occasion too."

**Validator score:** 58/100 (mentions interests but repetitively, contains "perfect for any other occasion" → -25)

**Node 7 rewrite:**
> "The herb-growing kit speaks directly to Priya's twin loves of gardening and cooking — starting windowsill herbs in her new London flat would let her bridge both hobbies while sourcing fresh ingredients she'd actually use in her Indian cooking repertoire."

**Score after rewrite:** 90/100

---

## Personalization Data Pipeline

### Tracking Scores

Every completed session writes personalization scores to `gift_sessions.personalization_scores`:

```sql
-- Structure stored in gift_sessions.personalization_scores (jsonb)
[
  {"gift_index": 0, "score": 88, "was_rewritten": false},
  {"gift_index": 1, "score": 62, "was_rewritten": true, "original_score": 42},
  {"gift_index": 2, "score": 91, "was_rewritten": false}
]
```

### Monitoring

```typescript
// PostHog event after Node 7
posthog.capture('personalization_validation_complete', {
  session_id,
  scores: validatedRecs.map(r => r.personalization_score),
  avg_score: avg(validatedRecs.map(r => r.personalization_score ?? 0)),
  rewrites_applied: validatedRecs.filter(r => r._was_rewritten).length,
  rejections: originalCount - validatedRecs.length,
  provider_used: 'claude-haiku',
  duration_ms: nodeTime,
})
```

**Alert:** If average personalization score drops below 75 for a rolling 7-day window, investigate:
1. Has the recipient profile input quality changed? (Are users adding fewer interests?)
2. Has the generator prompt degraded?
3. Is Node 1's analysis being passed correctly to Node 5?

---

## The Feedback Loop

Personalization validation is self-improving. When users provide feedback:

```
"Was this gift recommendation personalized to your recipient?" → 1-5 stars
```

This feedback (stored in `gift_sessions.feedback_rating`) can be correlated with `personalization_scores` to calibrate the scoring rubric over time:

- If users consistently rate 4-5 stars on sessions where scores were 70+, the threshold is well-calibrated.
- If users rate 2-3 stars on sessions where scores were 80+, the scoring rubric needs adjustment.

This correlation analysis should run monthly and inform rubric updates.

---

## Cost Impact of Node 7

Node 7 adds one Claude Haiku call per session. Claude Haiku pricing: $0.25 per million input tokens, $1.25 per million output tokens.

**Typical Node 7 call:**
- Input: ~800 tokens (system prompt + recipient profile + 3 recommendations)
- Output: ~400 tokens (validation JSON for 3 recs)
- Cost: ($0.25 × 0.0008) + ($1.25 × 0.0004) = $0.00020 + $0.00050 = **~$0.0007 per session**

For 1,000 sessions/month: $0.70. Completely negligible.
