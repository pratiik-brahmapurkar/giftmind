export type Provider =
  | "claude-sonnet"
  | "claude-haiku"
  | "gemini-flash"
  | "gemini-pro"
  | "groq-llama";

export type AIErrorType =
  | "api_error"
  | "config"
  | "invalid_response"
  | "network_error"
  | "rate_limit"
  | "timeout";

export interface AICallParams {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "json" | "text";
}

export interface AICallResult {
  text: string;
  provider: Provider;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs: number;
  attemptNumber: number;
}

export interface ProviderFailure {
  provider: Provider;
  error: string;
  status?: number;
  type: AIErrorType;
}

export class AIProviderError extends Error {
  provider: Provider;
  status?: number;
  type: AIErrorType;

  constructor(provider: Provider, type: AIErrorType, message: string, status?: number) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.type = type;
    this.status = status;
  }
}

export class AIFallbackError extends Error {
  errors: ProviderFailure[];
  finalStatus?: number;
  finalType: AIErrorType;

  constructor(errors: ProviderFailure[], finalType: AIErrorType, finalStatus?: number) {
    super(`ALL AI PROVIDERS FAILED. Errors: ${JSON.stringify(errors)}`);
    this.name = "AIFallbackError";
    this.errors = errors;
    this.finalType = finalType;
    this.finalStatus = finalStatus;
  }
}

type JsonRecord = Record<string, unknown>;

function snippet(value: string, maxLength = 200): string {
  return value.substring(0, maxLength);
}

function parseTextResponse(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createProviderError(
  provider: Provider,
  type: AIErrorType,
  message: string,
  status?: number,
): AIProviderError {
  return new AIProviderError(provider, type, message, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapHttpError(provider: Provider, status: number, body: string): AIProviderError {
  const truncatedBody = snippet(body);

  if (status === 408 || status === 504) {
    return createProviderError(provider, "timeout", `${provider} ${status}: ${truncatedBody}`, status);
  }

  if (status === 429) {
    return createProviderError(provider, "rate_limit", `${provider} ${status}: ${truncatedBody}`, status);
  }

  if (status === 401 || status === 403) {
    return createProviderError(provider, "config", `${provider} ${status}: ${truncatedBody}`, status);
  }

  return createProviderError(provider, "api_error", `${provider} ${status}: ${truncatedBody}`, status);
}

async function fetchJson(
  provider: Provider,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("aborted") || message.includes("timeout")) {
      throw createProviderError(provider, "timeout", `${provider} timeout after ${timeoutMs}ms`);
    }
    throw createProviderError(provider, "network_error", `${provider} network error: ${snippet(message)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw mapHttpError(provider, response.status, text);
  }

  try {
    return await response.json();
  } catch (error) {
    throw createProviderError(provider, "invalid_response", `${provider} returned invalid JSON: ${snippet(getErrorMessage(error))}`);
  }
}

function pickClaudeText(data: unknown): string {
  const record = getRecord(data);
  const content = getArray(record?.content);
  const text =
    content.find((part) => isRecord(part) && typeof part.text === "string" && part.text.trim()) &&
    isRecord(content.find((part) => isRecord(part) && typeof part.text === "string"))
      ? getString((content.find((part) => isRecord(part) && typeof part.text === "string") as JsonRecord).text)
      : getString(getRecord(content[0])?.text);

  return text?.trim() ?? "";
}

function pickGeminiText(data: unknown): string {
  const record = getRecord(data);
  const firstCandidate = getRecord(getArray(record?.candidates)[0]);
  const content = getRecord(firstCandidate?.content);
  const parts = getArray(content?.parts);

  return parts
    .map((part) => getString(getRecord(part)?.text) ?? "")
    .join("")
    .trim();
}

// ── Claude (Anthropic) ──

async function callClaude(
  model: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001",
  params: AICallParams,
): Promise<AICallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const provider: Provider = model.includes("sonnet") ? "claude-sonnet" : "claude-haiku";

  if (!apiKey) {
    throw createProviderError(provider, "config", "ANTHROPIC_API_KEY not configured");
  }

  const start = Date.now();
  const data = await fetchJson(
    provider,
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens || 2000,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userMessage }],
      }),
    },
    45_000,
  );

  const text = pickClaudeText(data);
  const payload = getRecord(data);
  const usage = getRecord(payload?.usage);
  if (!text) {
    throw createProviderError(provider, "invalid_response", "Empty Claude response");
  }

  return {
    text,
    provider,
    tokensInput: getNumber(usage?.input_tokens),
    tokensOutput: getNumber(usage?.output_tokens),
    latencyMs: Date.now() - start,
    attemptNumber: 1,
  };
}

// ── Google Gemini ──

async function callGemini(
  model: "gemini-2.5-flash-preview-04-17" | "gemini-3-1-pro",
  params: AICallParams,
): Promise<AICallResult> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  const provider: Provider = model.includes("flash") ? "gemini-flash" : "gemini-pro";

  if (!apiKey) {
    throw createProviderError(provider, "config", "GOOGLE_AI_API_KEY not configured");
  }

  const start = Date.now();
  const data = await fetchJson(
    provider,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ parts: [{ text: params.userMessage }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens || 2000,
          responseMimeType: params.responseFormat === "json" ? "application/json" : "text/plain",
        },
      }),
    },
    45_000,
  );

  const text = pickGeminiText(data);
  const payload = getRecord(data);
  const usageMetadata = getRecord(payload?.usageMetadata);
  if (!text) {
    throw createProviderError(provider, "invalid_response", `Empty Gemini response: ${snippet(parseTextResponse(data), 300)}`);
  }

  return {
    text,
    provider,
    tokensInput: getNumber(usageMetadata?.promptTokenCount),
    tokensOutput: getNumber(usageMetadata?.candidatesTokenCount),
    latencyMs: Date.now() - start,
    attemptNumber: 1,
  };
}

// ── Groq (Llama 70B) ──

async function callGroq(params: AICallParams): Promise<AICallResult> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw createProviderError("groq-llama", "config", "GROQ_API_KEY not configured");
  }

  const start = Date.now();
  const data = await fetchJson(
    "groq-llama",
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userMessage },
        ],
        max_tokens: params.maxTokens || 2000,
        temperature: params.temperature ?? 0.7,
        response_format: params.responseFormat === "json" ? { type: "json_object" } : undefined,
      }),
    },
    30_000,
  );

  const payload = getRecord(data);
  const firstChoice = getRecord(getArray(payload?.choices)[0]);
  const message = getRecord(firstChoice?.message);
  const usage = getRecord(payload?.usage);
  const text = getString(message?.content)?.trim() ?? "";
  if (!text) {
    throw createProviderError("groq-llama", "invalid_response", `Empty Groq response: ${snippet(parseTextResponse(data), 300)}`);
  }

  return {
    text,
    provider: "groq-llama",
    tokensInput: getNumber(usage?.prompt_tokens),
    tokensOutput: getNumber(usage?.completion_tokens),
    latencyMs: Date.now() - start,
    attemptNumber: 1,
  };
}

// ── Provider router with fallback chain ──

export async function callAIWithFallback(
  chain: Provider[],
  params: AICallParams,
): Promise<AICallResult> {
  const errors: ProviderFailure[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const provider = chain[i];

    try {
      let result: AICallResult;

      switch (provider) {
        case "claude-sonnet":
          result = await callClaude("claude-sonnet-4-20250514", params);
          break;
        case "claude-haiku":
          result = await callClaude("claude-haiku-4-5-20251001", params);
          break;
        case "gemini-flash":
          result = await callGemini("gemini-2.5-flash-preview-04-17", params);
          break;
        case "gemini-pro":
          result = await callGemini("gemini-3-1-pro", params);
          break;
        case "groq-llama":
          result = await callGroq(params);
          break;
        default:
          throw createProviderError(provider, "config", `Unknown provider: ${provider}`);
      }

      result.attemptNumber = i + 1;

      if (i > 0) {
        console.log(`AI FALLBACK SUCCESS: used ${provider} after ${i} failure(s)`);
        console.log("AI FALLBACK FAILURES:", JSON.stringify(errors));
      }

      return result;
    } catch (error) {
      if (error instanceof AIProviderError) {
        errors.push({
          provider,
          error: snippet(error.message),
          status: error.status,
          type: error.type,
        });
      } else {
        errors.push({
          provider,
          error: snippet(getErrorMessage(error)),
          type: "api_error",
        });
      }

      console.error(`AI provider ${provider} failed:`, getErrorMessage(error));

      if (i === chain.length - 1) {
        const lastError = errors[errors.length - 1];
        throw new AIFallbackError(errors, lastError?.type ?? "api_error", lastError?.status);
      }
    }
  }

  throw new AIFallbackError(errors, "api_error");
}

// ── Plan → provider chain mapping ──

export function getProviderChain(
  plan: string,
  operation: "gift-generation" | "signal-check" | "message-draft" | "relationship-insight",
): Provider[] {
  const freeTierChain: Provider[] = ["groq-llama", "gemini-flash", "claude-haiku"];

  if (operation === "relationship-insight") {
    return freeTierChain;
  }

  if (operation === "signal-check") {
    if (plan === "gifting-pro") return ["claude-sonnet", "claude-haiku", "gemini-flash"];
    if (plan === "confident") return ["claude-haiku", "gemini-flash", "groq-llama"];
    return freeTierChain;
  }

  switch (plan) {
    case "gifting-pro":
      return ["claude-sonnet", "claude-haiku", "gemini-pro"];
    case "confident":
      return ["claude-haiku", "gemini-flash", "groq-llama"];
    case "thoughtful":
      return ["gemini-flash", "claude-haiku", "groq-llama"];
    case "spark":
    default:
      return freeTierChain;
  }
}

// ── Safe JSON parser ──

export function parseAIJson(text: string): unknown {
  let cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse AI JSON response: ${message}. Raw: ${text.substring(0, 300)}`);
  }
}
