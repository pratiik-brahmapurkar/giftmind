import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/* ─── Types ───────────────────────────────────────────────────────────────── */
// Note: credit_batches table does not exist in the current schema.
// This hook works with users.credits_balance .
// When credit_batches is added in a future migration, extend this hook.

export interface UseCreditsReturn {
  balance: number;
  isLoading: boolean;
  /** Defined only when credits are LOW (≤ 7 days until expiry) — always null until credit_batches exists */
  nearestExpiry: { credits: number; daysLeft: number } | null;
  /** true when balance ≤ 3 */
  isLow: boolean;
  /** true when balance === 0 */
  isEmpty: boolean;
  /** Re-fetches balance from DB — call after any purchase or deduction */
  refresh: () => Promise<void>;
}

/* ─── Hook ────────────────────────────────────────────────────────────────── */
export function useCredits(): UseCreditsReturn {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  /* ── Fetch current balance from users.credits_balance ── */
  const fetchBalance = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from("users")
      .select("credits_balance")
      .eq("id", user.id)
      .single();

    setBalance(data?.credits_balance ?? 0);
    setIsLoading(false);
  }, [user]);

  /* ── Initial load ── */
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  /* ── Realtime subscription on users row ── */
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`credits-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newCredits = (payload.new as { credits_balance?: number })?.credits_balance;
          if (typeof newCredits === "number") {
            setBalance(newCredits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    balance,
    isLoading,
    // nearestExpiry requires credit_batches table — not yet in schema
    nearestExpiry: null,
    isLow: balance > 0 && balance <= 3,
    isEmpty: balance === 0,
    refresh: fetchBalance,
  };
}
