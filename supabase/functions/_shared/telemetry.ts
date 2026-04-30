import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AiTelemetryStatus = "success" | "error" | "timeout" | "rate_limited";

const MODEL_BY_PROVIDER: Record<string, string> = {
  "claude-sonnet": "claude-sonnet-4-20250514",
  "claude-haiku": "claude-haiku-4-5-20251001",
  "gemini-flash": "gemini-2.5-flash-preview-04-17",
  "gemini-pro": "gemini-3-1-pro",
  "groq-llama": "llama-3.3-70b-versatile",
};

const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet": { input: 3, output: 15 },
  "claude-haiku": { input: 0.8, output: 4 },
  "gemini-flash": { input: 0.3, output: 2.5 },
  "gemini-pro": { input: 1.25, output: 10 },
  "groq-llama": { input: 0.59, output: 0.79 },
};

export function resolveModel(provider: string, model?: string | null) {
  return model || MODEL_BY_PROVIDER[provider] || provider;
}

export function estimateCostUsd(
  provider: string,
  tokensInput?: number | null,
  tokensOutput?: number | null,
) {
  const rates = COST_PER_MILLION_TOKENS[provider];
  if (!rates) return null;

  const inputCost = ((tokensInput ?? 0) / 1_000_000) * rates.input;
  const outputCost = ((tokensOutput ?? 0) / 1_000_000) * rates.output;
  return Number((inputCost + outputCost).toFixed(6));
}

export async function logAiCall(
  client: SupabaseClient,
  params: {
    session_id?: string | null;
    function_name: string;
    provider: string;
    model?: string | null;
    attempt_number?: number | null;
    status: AiTelemetryStatus;
    latency_ms?: number | null;
    tokens_input?: number | null;
    tokens_output?: number | null;
    error_type?: string | null;
    error_message?: string | null;
  },
) {
  const estimated_cost_usd = estimateCostUsd(params.provider, params.tokens_input, params.tokens_output);
  const { error } = await client.from("ai_telemetry_log").insert({
    session_id: params.session_id ?? null,
    function_name: params.function_name,
    provider: params.provider,
    model: resolveModel(params.provider, params.model),
    attempt_number: params.attempt_number ?? 1,
    status: params.status,
    latency_ms: params.latency_ms ?? null,
    tokens_input: params.tokens_input ?? null,
    tokens_output: params.tokens_output ?? null,
    estimated_cost_usd,
    error_type: params.error_type ?? null,
    error_message: params.error_message?.substring(0, 500) ?? null,
  });

  if (error) {
    console.error("Failed to write AI telemetry:", error.message);
  }

  return { estimated_cost_usd };
}
