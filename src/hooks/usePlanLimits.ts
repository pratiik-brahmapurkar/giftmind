import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PLANS, PlanSlug, getUpgradePlan, getUpgradeText } from '@/lib/geoConfig';

export function usePlanLimits() {
  const [plan, setPlan] = useState<PlanSlug>('spark');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('users').select('active_plan')
          .eq('id', user.id).single()
          .then(({ data }) => {
            if (data?.active_plan) setPlan(data.active_plan as PlanSlug);
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  const config = PLANS[plan] || PLANS.spark;

  return {
    plan,
    planName: config.name,
    planEmoji: config.emoji,
    isLoading,
    ...config,
    canAddRecipient: (count: number) => config.maxRecipients === -1 || count < config.maxRecipients,
    canRegenerate: (count: number) => config.maxRegenerations === -1 || count < config.maxRegenerations,
    canUseSignalCheck: () => config.hasSignalCheck,
    canUseBatchMode: () => config.hasBatchMode,
    getStoreLimit: () => config.storesLevel === 'basic' ? 1 : config.storesLevel === 'standard' ? 2 : 99,
    getUpgradePlan: (feature: string) => getUpgradePlan(plan, feature),
    getUpgradeText: (feature: string) => getUpgradeText(plan, feature),
  };
}
