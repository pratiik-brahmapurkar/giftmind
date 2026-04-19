import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OnboardingState, defaultOnboardingState } from '../types/onboarding.types';
import { useAuth } from '@/contexts/AuthContext';

export function useOnboarding() {
  const { user } = useAuth();
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultOnboardingState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    }
    const fetchState = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('onboarding_state')
          .eq('id', user.id)
          .single();
        
        if (!error && data?.onboarding_state) {
          setOnboardingState(data.onboarding_state as unknown as OnboardingState);
        }
      } catch (e) {
        console.error("Failed to load onboarding_state", e);
      } finally {
        setLoading(false);
      }
    };
    fetchState();
  }, [user]);

  const saveStep = useCallback(async (step: number, data: Partial<OnboardingState>) => {
    if (!user) return;
    const newState = {
      ...onboardingState,
      ...data,
      current_step: (step >= 1 && step <= 5) ? step : onboardingState.current_step,
    } as OnboardingState;
    setOnboardingState(newState);
    
    await supabase.from('users').update({
      onboarding_state: newState as any
    }).eq('id', user.id);
  }, [onboardingState, user]);

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    
    const newState = {
      ...onboardingState,
      status: 'completed' as const,
      completed_at: new Date().toISOString(),
    } as OnboardingState;
    setOnboardingState(newState);

    await supabase.from('users').update({
      has_completed_onboarding: true,
      onboarding_state: newState as any
    }).eq('id', user.id);
  }, [onboardingState, user]);

  const skipToEnd = useCallback(async () => {
    if (!user) return;
    const newState = {
      ...onboardingState,
      status: 'opted_out' as const,
      skipped_steps: [1,2,3,4],
      current_step: 5 as const,
    } as OnboardingState;
    setOnboardingState(newState);
    
    await supabase.from('users').update({
      onboarding_state: newState as any
    }).eq('id', user.id);
  }, [onboardingState, user]);

  return { onboardingState, setOnboardingState, loading, saveStep, completeOnboarding, skipToEnd };
}
