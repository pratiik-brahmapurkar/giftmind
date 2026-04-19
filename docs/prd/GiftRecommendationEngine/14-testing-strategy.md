# 14 — Testing Strategy

---

## Testing Layers

The v2 engine requires testing at four distinct layers:

1. **Unit tests** — individual functions (budget enforcer, JSON parsers, embedding text builders)
2. **Node tests** — individual LangGraph nodes with mocked LLM calls
3. **Integration tests** — full pipeline with real LLM calls against test fixtures
4. **Evaluation / Golden Set** — human-graded output quality on 100 canonical test cases

---

## Unit Tests

### Budget Enforcer (100% test coverage required)

The budget enforcer is a pure function — ideal for exhaustive unit testing.

```typescript
// __tests__/budget-enforcer.test.ts
describe('enforceBudget', () => {
  // Happy path
  it('passes all recs within budget range', ...)
  it('passes recs at exact budget boundaries (inclusive)', ...)
  it('handles exactly 3 recommendations at budget', ...)

  // Filtering
  it('filters recs above budget max', ...)
  it('filters recs below budget min', ...)
  it('filters recs with no price_anchor', ...)
  it('filters recs with invalid price_anchor (NaN)', ...)
  it('filters recs with string price_anchor that cannot be parsed', ...)

  // Retry logic
  it('sets retryRequired=true when fewer than 3 recs survive', ...)
  it('returns correct filteredOut list with reject reasons', ...)
  it('handles empty input array', ...)
  it('handles all recs failing budget', ...)

  // Edge cases
  it('handles zero budget min (free gifts)', ...)
  it('handles very narrow budget ($5 range)', ...)
  it('handles $500+ luxury budget', ...)
  it('handles string price_anchors like "45.00"', ...)
  it('handles price_anchor as integer vs float', ...)
})
```

### Personalization Score Parser

```typescript
describe('parseValidationResults', () => {
  it('parses valid validation JSON', ...)
  it('handles missing gift_index gracefully', ...)
  it('handles null rewrite gracefully', ...)
  it('handles scores outside 0-100 range (clamps)', ...)
  it('handles empty recommendations array', ...)
})
```

### Embedding Text Builders

```typescript
describe('buildRecipientEmbeddingText', () => {
  it('generates consistent text from full profile', ...)
  it('handles missing optional fields gracefully', ...)
  it('does not exceed 500 tokens', ...)
})

describe('buildGiftEmbeddingText', () => {
  it('generates consistent text from full recommendation', ...)
  it('includes occasion in output', ...)
  it('handles missing description gracefully', ...)
})
```

---

## Node Tests

Each node is tested in isolation with mocked LLM calls. Tests verify:
1. Input transformation (are the right fields extracted from state?)
2. Output shape (does the returned partial state match the expected interface?)
3. Fallback behavior (does node gracefully degrade when LLM fails?)

```typescript
// __tests__/nodes/01-recipient-analyzer.test.ts
describe('recipientAnalyzerNode', () => {
  it('extracts primary interests from interests array', ...)
  it('infers cultural markers from notes field', ...)
  it('falls back to raw data when LLM fails', ...)
  it('sets enrichment_source correctly', ...)
  it('handles empty interests array', ...)
  it('handles very long notes field (truncation)', ...)
})

// __tests__/nodes/02-cultural-retriever.test.ts
describe('culturalContextRetrieverNode', () => {
  it('returns rules for known cultural context (Jain + India + Diwali)', ...)
  it('returns empty array when no rules match', ...)
  it('returns at most 8 rules', ...)
  it('includes hard constraints in results', ...)
  it('handles embedding generation failure', ...)
  it('handles database query failure gracefully', ...)
})

// __tests__/nodes/06-budget-enforcer.test.ts
describe('budgetEnforcerNode', () => {
  it('passes filtered recommendations to state', ...)
  it('increments budgetRetryCount on retry', ...)
  it('does not exceed max 2 retries', ...)
  it('adds warning to metadata on partial results', ...)
})
```

---

## Integration Tests

Full pipeline integration tests with real LLM API calls. These run against real APIs (not mocked) but use a fixed set of test inputs.

### Pre-conditions

```typescript
// Test fixtures — deterministic inputs for consistent evaluation
const TEST_FIXTURES = {
  simple: {
    recipient: { name: 'Priya', relationship: 'parent', interests: ['cooking', 'gardening'], ... },
    occasion: 'birthday',
    budget_min: 30,
    budget_max: 60,
  },
  cultural_jain: {
    recipient: { name: 'Meera', cultural_context: 'indian_hindu', notes: 'Jain, very traditional', ... },
    occasion: 'diwali',
    budget_min: 40,
    budget_max: 80,
  },
  tight_budget: {
    recipient: { name: 'Alex', interests: ['reading', 'coffee'], ... },
    occasion: 'birthday',
    budget_min: 20,
    budget_max: 25,
  },
  // ... 10 fixtures total
}
```

### Integration Test Cases

```typescript
describe('full pipeline integration', () => {
  it('completes successfully for simple birthday scenario', async () => {
    const result = await runPipeline(TEST_FIXTURES.simple)
    expect(result.finalRecommendations).toHaveLength(3)
    expect(result.metadata.engineVersion).toBe('v2')
    // All prices within budget
    result.finalRecommendations.forEach(rec => {
      expect(rec.price_anchor).toBeGreaterThanOrEqual(30)
      expect(rec.price_anchor).toBeLessThanOrEqual(60)
    })
  }, 30_000)  // 30s timeout for real LLM call

  it('applies Jain leather prohibition for cultural edge case', async () => {
    const result = await runPipeline(TEST_FIXTURES.cultural_jain)
    const allNames = result.finalRecommendations.map(r => r.name.toLowerCase())
    const allDescriptions = result.finalRecommendations.map(r => r.description.toLowerCase())
    // No leather in names or descriptions
    const combinedText = [...allNames, ...allDescriptions].join(' ')
    expect(combinedText).not.toContain('leather')
    expect(combinedText).not.toContain('silk')
  }, 30_000)

  it('enforces tight budget ($20-25)', async () => {
    const result = await runPipeline(TEST_FIXTURES.tight_budget)
    result.finalRecommendations.forEach(rec => {
      expect(rec.price_anchor).toBeGreaterThanOrEqual(20)
      expect(rec.price_anchor).toBeLessThanOrEqual(25)
    })
  }, 30_000)

  it('completes within 15s P95', async () => {
    const timings: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      await runPipeline(TEST_FIXTURES.simple)
      timings.push(Date.now() - start)
    }
    const p95 = timings.sort()[Math.floor(timings.length * 0.95)]
    expect(p95).toBeLessThan(15_000)
  }, 120_000)
})
```

---

## Golden Set Evaluation

The golden set is 100 canonical test cases, rated by humans on 4 dimensions. It runs weekly during the A/B test period and monthly post-launch.

### Test Case Categories

| Category | Count | Purpose |
|---------|-------|---------|
| Common scenarios | 30 | Establish baseline quality on everyday use cases |
| Cultural edge cases | 20 | Verify cultural intelligence (hard constraints + preferences) |
| Budget edge cases | 10 | Verify budget enforcement across ranges |
| Relationship nuances | 15 | Verify relationship depth is handled correctly |
| Difficult contexts | 15 | Test scenarios where the AI often fails |
| Regression cases | 10 | Known-bad scenarios from v1 that must be fixed in v2 |

### 30 Common Scenarios

```
1. Mom's 60th birthday, India, Diwali coming up, $40-70
2. Best friend's bachelorette, female, 28, loves travel, $30-50
3. Husband's anniversary, 5 years, very close, $100-150
4. Office colleague leaving, professional, not close, $20-40
5. Dad's retirement gift, 60+, loves golf, $50-100
6. Girlfriend's birthday, new relationship (3 months), $40-60
7. Grandmother's Diwali gift, very traditional, vegetarian, $30-60
8. Best man wedding gift, male, 30s, tech enthusiast, $80-120
9. Teacher appreciation, professional, not personal, $20-35
10. New baby arrival, parents are friends, practical, $50-80
11. Housewarming gift, close friend, loves cooking, $40-60
12. Graduation (college), young nephew, 22, first job, $40-70
13. Valentine's Day, partner, 2 years together, bookworm, $30-55
14. Mother's Day, close, 55-65, wellness-focused, $40-70
15. Father's Day, close, 55-65, sports fan, $40-70
16. Christmas, UK, coworker's Secret Santa, $15-25
17. Eid gift, Muslim friend, 30s, values quality, $40-60
18. Chinese New Year, colleague from China, $30-50
19. Rosh Hashanah, Jewish friend, 40s, appreciates tradition, $35-60
20. Sister's birthday, very close, health and fitness, $45-75
21. Long-distance friend's birthday, ship to USA, $25-45
22. "They have everything" — wealthy parent-in-law, $75-120
23. Mentor's farewell, professional relationship, meaningful, $35-60
24. Boss's birthday, professional but warm, $30-50
25. Toddler's birthday (2-year-old), practical for parents, $25-45
26. Teen birthday (16), male, gaming and tech, $40-60
27. Friend going through difficult time (divorce), comfort/support, $30-50
28. New neighbor welcome gift, casual, $20-35
29. Thank you gift for help with a move, helpful friend, $25-45
30. Anniversary gift for parents (25th), sentimental, $60-100
```

### 20 Cultural Edge Cases

```
31. Jain Hindu + Diwali + India → must avoid leather/silk
32. Muslim + Eid + India → must avoid alcohol/pork
33. Sikh + Lohri + Punjab → must avoid tobacco
34. Chinese recipient + Chinese New Year → avoid 4, clocks, white flowers
35. Japanese recipient + birthday → avoid 4, 9, sharp objects
36. Hindu + Navratri + vegetarian → strict vegetarian food only
37. South Indian Tamil + Pongal → traditional crafts preferred
38. Bengali recipient + Durga Puja → intellectual/artistic gifts valued
39. Gujarati + New Year (Diwali) + business contact → dry fruits, silverware
40. Christian Indian + Christmas → appropriate, not Hindu-specific
41. Parsi recipient + Nowruz → natural elements, flowers
42. UAE recipient + Eid → premium dates, oud perfume, no alcohol
43. Saudi Arabia + corporate gift + male → conservative, no feminine items
44. South Korean + birthday → branded goods, health products
45. Brazilian + birthday + close friend → warm, personal, not corporate
46. German + colleague + professional → practical, not extravagant
47. French + birthday + cultural interest → artisanal, quality
48. UK + Secret Santa + office → neutral, professional, not too personal
49. Australian + Christmas (summer) → seasonal appropriateness matters
50. Israeli + Hanukkah → traditional items, no overtly Christian gifts
```

### 10 Budget Edge Cases

```
51. Very tight: $15-20 (what's actually good at this price?)
52. Narrow window: $28-35 (limited $7 spread)
53. Standard: $50-75 (most common range — baseline)
54. Generous: $100-150 (quality over quantity)
55. Luxury: $200-300 (premium items, experiences)
56. "Free" experience: $0 (IOU, homemade, non-purchased)
57. India-priced budget: recipient in India, user sets $20-35 USD → product search finds INR-priced items
58. Round number trap: $50 budget → AI tends toward $50 anchors → must stay at or below $50
59. AI overreach test: explicitly include context that sounds expensive → AI must resist anchoring high
60. Asymmetric: $5-100 (very wide range → AI should anchor middle, not max)
```

### 15 Relationship Nuance Cases

```
61. New relationship (1 month) → not too intimate
62. First year married → romantic but appropriate depth
63. Long marriage (20+ years) → can be more personal
64. Acquaintance (met twice) → professional, minimal assumption
65. Close childhood friend (haven't talked in 5 years) → reconnecting tone
66. Boss (friendly but professional boundary) → thoughtful but workplace-safe
67. Mentor (academic) → intellectual, respectful
68. In-law (first gift) → making a good impression
69. Ex-colleague turned friend → hybrid professional+personal
70. Benefactor (someone who helped in need) → gratitude, meaningful
71. Partner (long distance, 3 months) → bridges distance, intimate
72. Parent (very traditional, different generation) → respect + thoughtfulness
73. Sibling rivalry dynamic → something they genuinely want, not show-off
74. Friend's partner (first meeting) → neutral, not too personal
75. Child (your own, 8 years old) → age-appropriate, not patronizing
```

### 15 Difficult Context Cases

```
76. "They have everything" — wealthy, hard to impress
77. "Very picky about what they own"
78. "Doesn't like receiving gifts, prefer experiences"
79. "Recently went through cancer treatment"
80. "Just lost their job"
81. "Just got divorced"
82. "Moving to a new country in 2 weeks"
83. "Training for a marathon, very health-focused"
84. "Retired recently, adjusting to new life"
85. "Minimalist — hates clutter"
86. "Has severe food allergies (nut allergy)"
87. "Is blind / visually impaired"
88. "Environmental activist — nothing with excessive packaging"
89. "Doesn't use tech at all"
90. "Collector of a very specific thing (vintage vinyl records)"
```

### 10 Regression Cases (v1 known failures)

These are based on the problems documented in `02-problem-statement.md`:

```
91. Budget overshoot: $30-50 budget → v1 returned $75 item → v2 must comply
92. Leather for Jain recipient → v1 suggested leather wallet → v2 must prohibit
93. Alcohol for Muslim recipient → v1 suggested wine → v2 must prohibit
94. Generic output: recipient with 8 interests → v1 returned "scented candles" → v2 must personalize
95. Repeat gift: same recipient gifted cooking class before → v2 must not suggest cooking class
96. Clock for Chinese recipient → v1 occasionally suggested → v2 must prohibit
97. White flowers for Japanese recipient → v1 suggested for sympathy → v2 must warn
98. 4 items in a set for Chinese recipient → v2 must avoid
99. Corporate-generic for close family → v1 returned "gift card" → v2 must personalize
100. Wrong cultural occasion: Diwali tips applied to Eid → v2 must correctly context-switch
```

---

## Human Evaluation Rubric

Each golden set test case is rated by a human evaluator on 4 dimensions:

| Dimension | Scale | Description |
|-----------|-------|-------------|
| **Personalization** | 1–10 | Does it feel written for THIS specific person? |
| **Cultural Fit** | 1–10 | Is it culturally appropriate? Avoids taboos? |
| **Budget Compliance** | Pass/Fail | Is every price_anchor within the stated budget? |
| **Overall Quality** | 1–10 | Would you actually use this recommendation? |

**Minimum pass thresholds for v2:**
- Personalization avg ≥ 7.5/10 (vs target ≥ 90% scoring ≥ 70 by Node 7 validator)
- Cultural Fit avg ≥ 8.0/10, with zero hard violations (recs that violate hard taboos = automatic fail)
- Budget Compliance = 100%
- Overall Quality avg ≥ 7.0/10

---

## Testing Schedule

| Phase | When | What |
|-------|------|------|
| Unit tests | Week 1-2 (continuous) | Run on every commit via CI |
| Node tests | Week 2-3 | Run on every commit |
| Integration tests (mocked LLM) | Week 2-4 | Run on every commit |
| Integration tests (real LLM) | Week 4-5 | Run nightly (costs money) |
| Golden set evaluation | Week 5 | Run once before gate check |
| Golden set regression | Post-launch | Run weekly for 4 weeks, then monthly |

---

## CI/CD Configuration

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test -- --testPathPattern="unit|nodes"
      # No API keys needed for unit tests (mocked)

  integration-tests-mocked:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test -- --testPathPattern="integration"
        env:
          USE_MOCK_LLMS: true  # Skip real API calls
      
  # Real LLM integration tests: manual trigger only (cost concern)
  integration-tests-real:
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test -- --testPathPattern="integration"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_API_KEY }}
```
