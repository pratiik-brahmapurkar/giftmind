import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY;

let initialized = false;

export function initPosthog() {
  // Only initialize if user has accepted cookies
  const consent = localStorage.getItem('gm_cookie_consent');
  if (consent !== 'accepted') return;
  if (initialized) return;
  if (!POSTHOG_KEY) return;
  
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',  // or eu.i.posthog.com
    loaded: (ph) => { initialized = true; },
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
