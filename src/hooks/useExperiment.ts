import { useEffect, useState } from "react";
import { getExperimentVariant } from "@/lib/experiments";
import { useAnalytics } from "@/hooks/useAnalytics";

export function useExperiment(key: string): { variant: string | undefined; isLoading: boolean } {
  const [variant, setVariant] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const { track } = useAnalytics();

  useEffect(() => {
    const nextVariant = getExperimentVariant(key);
    setVariant(nextVariant);
    setIsLoading(false);

    if (nextVariant) {
      const assignmentKey = `gm_experiment_assigned:${key}:${nextVariant}`;
      if (sessionStorage.getItem(assignmentKey) !== "true") {
        sessionStorage.setItem(assignmentKey, "true");
        track("experiment_assigned", {
          experiment_key: key,
          variant: nextVariant,
        });
      }
    }
  }, [key, track]);

  return { variant, isLoading };
}
