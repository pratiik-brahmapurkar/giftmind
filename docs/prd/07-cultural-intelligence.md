# 07 — Cultural Intelligence

---

## The Problem with the Current Approach

Cultural intelligence in v1 is a single sentence in `buildSystemPrompt()`:

> *"Consider cultural context (Diwali, Eid, etc.) if recipient's country implies it"*

This instruction asks the LLM to:
1. Infer the recipient's culture from a country code and a 6-bucket dropdown
2. Recall the relevant cultural rules from its training data
3. Apply those rules correctly under the competing pressures of budget, personalization, and occasion
4. Do all of this in a single pass without any verification

When context is simple — Indian + Diwali — frontier LLMs do reasonably well. When context is nuanced — Jain Hindu + Gujarat + corporate relationship + budget-constrained + Diwali — the model may get 3 of 4 right, missing the Jain leather prohibition while correctly handling Diwali gift norms.

The failure mode is not random noise. It is systematic: the LLM's training data on cultural nuances is uneven. Well-documented cultures (Hindu festivals, Chinese New Year) are covered well. Less-documented contexts (Jain religious restrictions, Parsi traditions, regional South Indian norms) may be underrepresented. And crucially, there is no way to add a missing rule without editing the system prompt — a code change requiring deployment.

---

## The Solution: Cultural Rules as First-Class Data

Cultural rules are stored in the `cultural_rules` table (see [06-vector-memory-design.md](./06-vector-memory-design.md)) and retrieved at query time via pgvector similarity search. Any rule can be added, updated, or deactivated by a superadmin without touching code. A cultural consultant can review and improve rules without engineering involvement.

---

## Rule Taxonomy

### Hard Constraints

These rules represent absolute prohibitions — violations that would cause genuine offense, breach religious principles, or damage trust irreparably. Hard constraints are injected into Node 5 (Gift Generator) as a `MUST NOT include:` system block. The LLM cannot override these.

**Examples:**
- Leather/silk/animal products for Jain recipients
- Alcohol/pork for Muslim recipients
- Clock gifts for Chinese recipients
- Sets of 4 for Chinese/Japanese recipients
- Sharp objects for Japanese workplace gifts
- White flowers for East Asian recipients

### Soft Preferences

These rules represent culturally preferred gift categories — things that are considered auspicious, traditional, or especially appreciated in a given context. Soft preferences are injected as a `STRONGLY PREFER:` block in Node 5.

**Examples:**
- Sweets and dry fruits for Diwali
- Red-wrapped items for Chinese New Year
- Premium dates and attar for Eid
- Beautifully packaged items for Japanese recipients
- Heritage/craft items for traditional Indian occasions

### Regional Notes

These are informational context that helps the LLM calibrate — not directives, but signals about what tends to work well.

**Examples:**
- Bengali recipients appreciate intellectual/artistic gifts
- Gujarati gift culture favors silverware and dry fruits
- UK recipients value quality over quantity
- US recipients tend toward practical/experiential gifts

---

## How Cultural Intelligence Works in the Pipeline

### Step 1: Node 1 Extracts Cultural Markers

Node 1 (Recipient Analyzer) infers specific cultural markers from the recipient's profile. The `cultural_context` enum (`indian_hindu`, `indian_muslim`, etc.) is used as a starting point, but Node 1's Claude Haiku call enriches it:

**Input:** `cultural_context: "indian_hindu"`, `notes: "Priya is Jain, very traditional about her practices"`

**Output from Node 1:**
```json
{
  "cultural_markers": ["indian_hindu", "jain", "vegetarian_lifestyle", "traditional_practices"]
}
```

The key insight: the `cultural_context` enum cannot represent "Jain" (only `indian_hindu` exists), but the `notes` field often contains this information. Node 1 extracts it.

### Step 2: Node 2 Retrieves Rules

Node 2 generates an embedding query:
```
"gift for diwali recipient from india jain vegetarian traditional"
```

This query is embedded and matched against `cultural_rules`. The result:
1. "For Jain recipients, never suggest leather goods..." (similarity: 0.91, hard_constraint)
2. "For Hindu recipients, avoid leather products for auspicious occasions..." (0.88, hard_constraint)
3. "For Diwali, gifts involving light, sweets, dry fruits are auspicious" (0.87, soft_preference)
4. "For Jain recipients, plant-based and natural gifts are strongly preferred" (0.83, soft_preference)

### Step 3: Node 5 Enforces Rules

The rules are injected into the Gift Generator prompt as structured blocks:

```
HARD CONSTRAINTS — NEVER suggest these for this recipient:
• Never suggest: leather goods, silk, wool, or animal-derived products (Jain religious requirement)
• Never suggest: leather items (Hindu religious consideration for auspicious occasions)

CULTURAL PREFERENCES — Strongly prefer:
• Suggest dry fruits, sweets, diyas, or items related to light and prosperity (Diwali tradition)
• Prefer plant-based and natural materials (Jain lifestyle preference)
```

The LLM cannot "forget" the Jain leather prohibition — it is hardcoded in the system block that precedes all generation instructions.

---

## Complete Initial Rule Set

### Category 1: Indian Subcontinent

#### Hinduism
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Avoid leather for auspicious Hindu occasions | hard_constraint | 0.90 | india, hindu, diwali, puja |
| Diyas, lamps, and light items are auspicious for Diwali | soft_preference | 0.95 | india, hindu, diwali |
| Gold and silver items are prestigious and auspicious | soft_preference | 0.92 | india, hindu, wedding, diwali |
| Sweets and mithai are traditional for most Hindu festivals | soft_preference | 0.95 | india, hindu, diwali, holi, raksha_bandhan |
| For Navratri: avoid non-vegetarian items and alcohol | hard_constraint | 0.88 | india, hindu, navratri |

#### Jainism
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Never suggest leather, silk, wool, or animal products for Jain recipients | hard_constraint | 0.99 | india, jain |
| Plant-based, natural, vegan alternatives strongly preferred | soft_preference | 0.95 | india, jain, vegetarian |
| Organic foods, natural skincare, and eco-friendly items resonate well | soft_preference | 0.88 | india, jain |

#### Islam
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Never suggest alcohol, pork products, or gambling items | hard_constraint | 0.99 | india, pakistan, uae, muslim, eid |
| Premium dates and attar (non-alcoholic perfume) are traditional Eid gifts | soft_preference | 0.95 | india, muslim, eid |
| Halal food products only for food gifts | hard_constraint | 0.92 | india, muslim |
| Prayer items (Quran, prayer beads) are appropriate for religious occasions | soft_preference | 0.85 | india, muslim, eid, religious |

#### Sikhism
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Avoid tobacco and intoxicants | hard_constraint | 0.95 | india, sikh, punjab |
| Kirpan (ceremonial dagger) is religious — do not gift unless explicitly requested | hard_constraint | 0.90 | india, sikh |
| Sports equipment, practical items, and quality foods are well-received | soft_preference | 0.82 | india, sikh, punjab |

#### Christianity (India)
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Christmas: family-oriented gifts, books, home goods resonate well | soft_preference | 0.80 | india, indian_christian, christmas |
| Avoid overly Hindu-specific items (diyas, idols) for Christian occasions | soft_preference | 0.78 | india, indian_christian |

#### Regional Indian Notes
| Rule | Type | Tags |
|------|------|------|
| Bengali culture values intellect/art — books, music, crafts resonate | regional_note | india, bengali |
| Gujarati culture: dry fruits, silverware, mithai boxes are traditional | regional_note | india, gujarati, gujarat |
| Punjabi culture: abundance and generosity — larger gifts or food hampers appreciated | regional_note | india, punjabi, punjab |
| Tamil culture: traditional crafts (Tanjore painting, brass), sarees, gold valued | regional_note | india, tamil_nadu, south_india |
| Rajasthani culture: handicrafts, block-print textiles, camel leather (not for Jains) | regional_note | india, rajasthan |
| Parsi (Zoroastrian): flowers and natural elements are culturally appropriate | regional_note | india, parsi, zoroastrian |

---

### Category 2: East Asia

#### China
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Never give 4 items (death number) | hard_constraint | 0.97 | china, chinese, chinese_new_year |
| Never give a clock (symbolizes death) | hard_constraint | 0.98 | china, chinese |
| Never give white flowers alone (funeral color) | hard_constraint | 0.90 | china, chinese |
| Never give pears (sounds like "separation") | hard_constraint | 0.85 | china, chinese |
| Never give green hats to men (infidelity connotation) | hard_constraint | 0.82 | china, chinese |
| Numbers 6, 8, 9 are lucky — prefer these quantities | soft_preference | 0.92 | china, chinese_new_year |
| Red and gold packaging for Chinese New Year | soft_preference | 0.92 | china, chinese_new_year |
| Premium tea, quality nuts, high-end spirits (Baijiu) for business gifts | soft_preference | 0.85 | china, chinese, business |

#### Japan
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Never give 4 or 9 items (death/suffering) | hard_constraint | 0.95 | japan, japanese |
| Avoid sharp objects (cutting ties symbolically) | hard_constraint | 0.85 | japan, japanese |
| Gift wrapping and presentation matter as much as the gift | soft_preference | 0.92 | japan, japanese |
| Department store wrapping (Mitsukoshi, Takashimaya) signals prestige | soft_preference | 0.80 | japan, japanese |
| Seasonal and regional specialties (omiyage) are ideal for travel gifts | soft_preference | 0.88 | japan, japanese |
| High-quality food (wagyu, matcha, sake) is always appropriate | soft_preference | 0.85 | japan, japanese |

#### South Korea
| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Branded goods and health products resonate strongly | soft_preference | 0.82 | south_korea, korean |
| Red ginseng, premium Korean food items for health-focused gifts | soft_preference | 0.80 | south_korea, korean |

---

### Category 3: Middle East

| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| Never suggest alcohol or pork products | hard_constraint | 0.99 | uae, saudi_arabia, qatar, middle_east, muslim |
| Premium oud perfume and bakhoor incense are culturally prestige gifts | soft_preference | 0.92 | uae, saudi_arabia, middle_east |
| Medjool dates are a universal hospitality gift | soft_preference | 0.88 | uae, saudi_arabia, middle_east, eid |
| Avoid overly feminine gifts for male recipients in conservative contexts | soft_preference | 0.75 | uae, saudi_arabia, middle_east, conservative |
| Gold and precious metal items signal high regard | soft_preference | 0.85 | uae, saudi_arabia, middle_east |

---

### Category 4: Western Markets

| Rule | Type | Confidence | Tags |
|------|------|-----------|------|
| In professional/workplace contexts, avoid overly personal gifts | hard_constraint | 0.88 | usa, uk, western, colleague, professional |
| UK: quality over quantity — single premium item beats gift sets | soft_preference | 0.82 | uk, british |
| USA: experiential and practical gifts rate higher than decorative | soft_preference | 0.78 | usa, american |
| Germany: punctual, practical gifts — avoid extravagance for professional | soft_preference | 0.78 | germany, german, european |
| France: quality artisanal products and culture-related gifts (wine, books, art) | soft_preference | 0.80 | france, french, european |
| Latin America: warm, personal gifts valued over corporate-style items | soft_preference | 0.75 | brazil, mexico, latin_america |

---

## Rule Management Process

### Adding New Rules (Admin UI)

Rules are added via the Supabase dashboard or a dedicated admin page:
1. Superadmin enters rule text, tags, type, confidence, examples
2. System generates embedding automatically on save (using `AFTER INSERT` trigger + embedding job)
3. Rule becomes active immediately for new queries

### Quality Review Process

1. **Monthly review:** Export all rules with `confidence < 0.80` for human review
2. **Feedback-triggered review:** If a user reports cultural inappropriateness (via feedback form), the relevant rule is flagged for review
3. **A/B testing rules:** High-confidence rules can be A/B tested by toggling `is_active` for a subset

### Rule Versioning

The `embedding_version` field on `recipient_embeddings` tracks which version of the source text was used. When the embedding model changes, increment the version and re-embed.

### Growing to 200+ Rules

Target expansion path:
- Month 1 (launch): 50 rules (this document)
- Month 3: +50 rules (user feedback, support tickets identifying misses)
- Month 6: +100 rules (cultural consultant engagement, market research for new country launches)
- Year 1: 300+ rules across 20+ cultural contexts

---

## Measuring Cultural Intelligence Quality

Since `feedback_rating` exists in `gift_sessions` but the feedback UI is not yet built, we need to add a specific cultural feedback signal:

```sql
-- New feedback fields on gift_sessions
ALTER TABLE public.gift_sessions
  ADD COLUMN IF NOT EXISTS feedback_cultural_fit integer CHECK (feedback_cultural_fit BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS feedback_cultural_note text;
```

**Feedback collection target:** After gift selection, show a 3-question feedback form:
1. "How well did these gifts match your budget?" (1-5 stars)
2. "How culturally appropriate were the suggestions?" (1-5 stars)
3. "Did you find any suggestion inappropriate or offensive?" (yes/no + text)

Cultural appropriateness score (question 2) feeds directly into the `Cultural Appropriateness` primary metric.
