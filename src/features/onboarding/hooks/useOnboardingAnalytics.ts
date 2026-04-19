import { useRef } from 'react';
import { trackEvent } from '@/lib/posthog';

export function useOnboardingAnalytics() {
  const stepStartTime = useRef<number>(Date.now());

  const trackStepViewed = (step: number) => {
    stepStartTime.current = Date.now();
    trackEvent('onboarding_step_viewed', { step });
  };

  const trackStepCompleted = (step: number, wasSkipped = false) => {
    trackEvent('onboarding_step_completed', {
      step,
      duration_ms: Date.now() - stepStartTime.current,
      was_skipped: wasSkipped,
    });
  };

  return { trackStepViewed, trackStepCompleted };
}
