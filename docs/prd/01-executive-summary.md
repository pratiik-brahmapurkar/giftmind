# 01 — Executive Summary

## Overview

GiftMind v2 introduces a multi-agent Gift Recommendation Engine built on LangGraph, replacing the current single-call LLM architecture with a nine-node agentic pipeline. Each node has a discrete, testable responsibility: recipient analysis, cultural context retrieval, occasion interpretation, past gift retrieval, gift generation, budget enforcement, personalization validation, response formatting, and telemetry. Vector memory via pgvector enables the system to learn from every completed session — building up recipient profiles and cultural rule embeddings that improve recommendation quality over time. Budget compliance shifts from a soft prompt instruction to a deterministic code filter that never lets an out-of-budget recommendation reach the user.

---

## The Shift

**Before — v1 Architecture**

A single Supabase Edge Function (`generate-gifts/index.ts`) receives the recipient profile, constructs two strings (system prompt + user message), makes one HTTP request to an LLM, parses the JSON response, and returns it to the frontend. Cultural rules are embedded in the system prompt as one line of text. Budget compliance is a request in the prompt: "Price anchors must fit within the user's budget range." There is no memory of past sessions, no validation that the output is actually personalized, and no feedback loop. The entire intelligence of the product lives inside a ~250-line prompt.

**After — v2 Architecture**

A LangGraph pipeline, hosted as Vercel serverless functions, decomposes the recommendation task across nine focused nodes:

1. **Recipient Analyzer** (Claude Haiku) — extracts structured insights from raw recipient data
2. **Cultural Context Retriever** (pgvector) — fetches relevant cultural rules from a curated database
3. **Occasion Interpreter** (Claude Haiku) — enriches occasion with timing, sentiment, and gift norms
4. **Past Gift Retriever** (pgvector + SQL) — identifies what was gifted before and what to avoid
5. **Gift Generator** (tiered: Groq/Gemini/Claude by plan) — generates candidates with full context
6. **Budget Enforcer** (deterministic code) — hard-filters anything outside the budget range
7. **Personalization Validator** (Claude Haiku) — scores and rewrites weak personalizations
8. **Response Formatter** (deterministic) — assembles the final structured response
9. **Telemetry Node** (deterministic) — fires PostHog events with per-node timing

Cultural rules are stored as vector embeddings in a `cultural_rules` table. Every completed session writes gift embeddings to `gift_embeddings`. Every recipient profile writes to `recipient_embeddings`. Memory compounds.

---

## Why Now

**1. Current generation quality is inconsistent.** The single-pass architecture has no mechanism to detect when an output is generic. A recipient named "Priya who loves cooking and gardening" can receive recommendations for "a nice scented candle" with no connection to her interests. There is no validator. This is not a prompt problem — it is an architecture problem. Without a dedicated personalization check node, there is no reliable way to catch and correct weak outputs before they reach the user.

**2. Cultural awareness is fragile.** The cultural intelligence in v1 is a single English sentence in the system prompt. When the context is straightforward — "India, Diwali" — the model handles it reasonably well. When the context is nuanced — "Jain Hindu recipient from Gujarat, celebrating a business success" — the model may miss the leather prohibition, the vegetarian preference, the significance of dry fruits over sweets for the occasion, and the regional gift-giving norms. A sentence in a prompt cannot carry this weight. Systematic retrieval from a curated cultural rules database can.

**3. No learning from past sessions.** Every GiftMind session begins from zero. If a user has gifted Priya four times in three years, the fifth session has no knowledge of what was previously chosen, what was received well, or what categories have been exhausted. The `selected_gift_name` column exists in `gift_sessions` but the value is never retrieved during a new session. Vector embeddings of past gifts enable semantic similarity search — allowing the system to avoid not just exact repeats but conceptually similar gifts.

**4. Budget overshoot erodes trust.** When a user sets a $30–$50 budget and the AI suggests a $75 item, two things happen: (a) the product link either fails or shows an out-of-budget item, and (b) the user loses confidence in the product. In current production, budget adherence is approximately 70% — roughly 1 in 3 recommendations exceeds the specified range. Node 6 (Budget Enforcer) is pure code. It will be 100%.

**5. The monolithic prompt has hit its ceiling.** The current `buildSystemPrompt()` + `buildUserMessage()` approach is asking one LLM call to simultaneously reason about recipient psychology, cultural taboos, occasion semantics, budget constraints, product searchability, and personalization quality. Any single concern can crowd out another. The LangGraph decomposition gives each concern a focused node, observable inputs/outputs, and independent retry logic.

---

## Key Principles

1. **Every recommendation MUST reference specific recipient details.** "Why it works" is validated by Node 7, not left to the model's judgment.

2. **Cultural rules are systematic, not prompt-engineered.** Rules live in pgvector, retrieved by semantic similarity, applied as hard constraints in Node 5.

3. **Budget is a HARD constraint.** Node 6 is deterministic TypeScript/Python code. If price_anchor > budget_max or < budget_min, the recommendation is discarded. The LLM does not participate in this decision.

4. **Memory compounds.** Each completed session adds to the gift embedding store. Each new session retrieves from it. The product improves with use.

5. **Tiered cost maps to tiered quality.** Spark uses Groq (free, fast). Pro uses Claude Sonnet (best reasoning). The same node architecture runs across all plans; only Node 5's model changes.

6. **Observability first.** Every node logs its input, output, and latency to PostHog. No production debugging blindness.

7. **Backward compatible.** v1 (`generate-gifts` Edge Function) stays live as fallback during migration. v2 launches as `/api/recommend/v2` with a feature flag (`VITE_USE_LANGGRAPH=true`).

---

## Success Looks Like

When v2 ships and reaches 100% traffic, these metrics define success:

| Metric | Target |
|--------|--------|
| **Personalization Rate** | ≥ 90% of recommendations reference ≥2 specific recipient interests |
| **Budget Compliance** | 100% — zero recommendations outside budget range |
| **Cultural Appropriateness** | ≥ 90% (measured via user feedback on cultural_note relevance) |
| **Recommendation Feedback ≥ "Liked it"** | ≥ 70% of feedback events |
| **P95 End-to-End Latency** | < 12 seconds (from API call to final recommendations) |
| **Past-Gift Avoidance Rate** | 100% (never suggest same gift twice for same recipient) |
| **Regeneration Rate** | < 25% (users accept first set) |
| **Session Error Rate** | < 2% |

These are not aspirational numbers. They are the minimum bar for declaring v2 a success and deprecating v1. They will be tracked in PostHog with a dedicated dashboard.

---

## What This Is Not

- This is not a redesign of the frontend. The React components, gift flow steps, and UX remain the same.
- This is not a new pricing model. Credits, plans, and billing are unchanged.
- This is not a replacement for `signal-check`. Signal Check remains as a separate, premium-tier feature.
- This is not a real-time product catalog API. `search-products` remains as the product link layer; v2 improves the gift concepts fed into it, not the product matching itself.
- This is not a multi-tenant or white-label system. GiftMind is the only tenant.

---

## Timeline Summary

Six weeks from kickoff to full v2 rollout. Week 1: database foundations. Weeks 2–3: nine agent nodes. Week 4: Vercel integration + streaming. Week 5: A/B testing + golden set evaluation. Week 6: 100% traffic switch + v1 deprecation.
