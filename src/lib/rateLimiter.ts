export interface RateLimitConfig {
  key: string;
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetIn: number;
}

export const RATE_LIMIT_MESSAGE = "You've reached the daily limit. Please try again tomorrow.";

interface StoredRateLimitState {
  requests: number[];
  windowStart: number;
}

const EMPTY_STATE: StoredRateLimitState = {
  requests: [],
  windowStart: 0,
};

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  if (typeof window === "undefined") {
    return {
      allowed: true,
      remainingRequests: config.maxRequests,
      resetIn: config.windowMs,
    };
  }

  const now = Date.now();
  const storageKey = `gm_rl_${config.key}`;

  let stored: StoredRateLimitState = { ...EMPTY_STATE };
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredRateLimitState>;
      stored = {
        requests: Array.isArray(parsed.requests)
          ? parsed.requests.filter((value): value is number => typeof value === "number")
          : [],
        windowStart: typeof parsed.windowStart === "number" ? parsed.windowStart : 0,
      };
    }
  } catch {
    stored = { ...EMPTY_STATE };
  }

  if (!stored.windowStart || now - stored.windowStart > config.windowMs) {
    stored = {
      requests: [],
      windowStart: now,
    };
  }

  if (stored.requests.length >= config.maxRequests) {
    return {
      allowed: false,
      remainingRequests: 0,
      resetIn: Math.max(config.windowMs - (now - stored.windowStart), 0),
    };
  }

  stored.requests.push(now);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Ignore storage failures and allow the request through.
  }

  return {
    allowed: true,
    remainingRequests: Math.max(config.maxRequests - stored.requests.length, 0),
    resetIn: Math.max(config.windowMs - (now - stored.windowStart), 0),
  };
}
