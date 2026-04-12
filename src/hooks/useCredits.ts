import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlan, type PlanKey } from "@/lib/plans";

export interface UseCreditsReturn {
  balance: number;
  isLoading: boolean;
  nearestExpiry: { credits: number; daysLeft: number } | null;
  expiringBatches: Array<{
    id: string;
    credits: number;
    daysLeft: number;
    expiresAt: string;
    packageName: string;
  }>;
  isLow: boolean;
  isEmpty: boolean;
  activePlan: PlanKey;
  refresh: () => Promise<void>;
}

function getDaysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function useCredits(): UseCreditsReturn {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [activePlan, setActivePlan] = useState<PlanKey>("free");
  const [nearestExpiry, setNearestExpiry] = useState<UseCreditsReturn["nearestExpiry"]>(null);
  const [expiringBatches, setExpiringBatches] = useState<UseCreditsReturn["expiringBatches"]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setActivePlan("free");
      setNearestExpiry(null);
      setExpiringBatches([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [{ data: profile }, { data: batches }] = await Promise.all([
      supabase
        .from("users")
        .select("credits_balance, active_plan")
        .eq("id", user.id)
        .single(),
      supabase
        .from("credit_batches")
        .select("id, credits_remaining, expires_at, package_name")
        .eq("user_id", user.id)
        .gt("credits_remaining", 0)
        .not("expires_at", "is", null)
        .gte("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true })
        .limit(5),
    ]);

    setBalance(profile?.credits_balance ?? 0);
    setActivePlan(normalizePlan(profile?.active_plan));

    const activeBatches = (batches || []).map((batch) => ({
      id: batch.id,
      credits: batch.credits_remaining ?? 0,
      daysLeft: getDaysLeft(batch.expires_at),
      expiresAt: batch.expires_at,
      packageName: batch.package_name ?? "credits",
    }));

    const batch = activeBatches[0];
    if (batch?.expiresAt) {
      setNearestExpiry({
        credits: batch.credits,
        daysLeft: batch.daysLeft,
      });
    } else {
      setNearestExpiry(null);
    }
    setExpiringBatches(activeBatches);

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const userChannel = supabase
      .channel(`credits-users-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as { credits_balance?: number; active_plan?: string };
          if (typeof next.credits_balance === "number") setBalance(next.credits_balance);
          if (typeof next.active_plan === "string") setActivePlan(normalizePlan(next.active_plan));
        },
      )
      .subscribe();

    const batchChannel = supabase
      .channel(`credits-batches-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "credit_batches",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(userChannel);
      void supabase.removeChannel(batchChannel);
    };
  }, [refresh, user]);

  return {
    balance,
    isLoading,
    nearestExpiry,
    expiringBatches,
    isLow: balance > 0 && balance <= 3,
    isEmpty: balance === 0,
    activePlan,
    refresh,
  };
}
