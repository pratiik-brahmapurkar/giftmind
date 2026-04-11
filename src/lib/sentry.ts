import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENABLE_SENTRY_IN_DEV = import.meta.env.VITE_ENABLE_SENTRY_IN_DEV === "true";

function isValidSentryDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    return url.protocol.startsWith("http") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function initSentry() {
  if (!SENTRY_DSN) return;
  if (!import.meta.env.PROD && !ENABLE_SENTRY_IN_DEV) return;
  if (!isValidSentryDsn(SENTRY_DSN)) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export function setSentryUser(userId: string, plan: string) {
  Sentry.setUser({ id: userId, plan });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}
