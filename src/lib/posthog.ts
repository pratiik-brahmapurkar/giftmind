import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const ENABLE_POSTHOG_IN_DEV = import.meta.env.VITE_ENABLE_POSTHOG_IN_DEV === "true";

let initialized = false;

function hasValidPosthogKey(value: string | undefined) {
  if (!value) return false;

  const normalized = value.trim();
  if (!normalized) return false;

  const lowered = normalized.toLowerCase();
  return lowered !== "placeholder" && lowered !== "your_posthog_api_key" && !lowered.includes("placeholder");
}

export function initPosthog() {
  if (!import.meta.env.PROD && !ENABLE_POSTHOG_IN_DEV) return;
  // Only initialize if user has accepted cookies
  const consent = localStorage.getItem('gm_cookie_consent');
  if (consent !== 'accepted') return;
  if (initialized) return;
  if (!hasValidPosthogKey(POSTHOG_KEY)) {
    console.log("PostHog: No API key configured, skipping initialization");
    return;
  }
  
  posthog.init(POSTHOG_KEY.trim(), {
    api_host: POSTHOG_HOST,
    loaded: () => { initialized = true; },
    autocapture: false,  // We'll track manually for precision
    capture_pageview: true,
    capture_pageleave: true,
  });
}

export function identifyUser(userId: string, properties: Record<string, any>) {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, any>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}
