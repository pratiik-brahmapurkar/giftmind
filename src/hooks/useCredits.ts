import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface CreditBatch {
  id: string;
  package_name: string;
  credits_purchased: number;
  credits_remaining: number;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  type: "purchase" | "usage" | "bonus" | "refund" | "admin_grant" | "referral" | "used" | "expired";
  amount: number;
  metadata: Json;
  created_at: string;
}

export interface UseCreditsReturn {
  balance: number;
  batches: CreditBatch[];
  transactions: CreditTransaction[];
  isLoading: boolean;
  nearestExpiry: { credits: number; daysLeft: number } | null;
  isLow: boolean;
  isEmpty: boolean;
  refresh: () => Promise<void>;
}

export function useCredits(): UseCreditsReturn {
  const [balance, setBalance] = useState(0);
  const [batches, setBatches] = useState<CreditBatch[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && user) {
        setUserId(user.id);
      }
      if (active && !user) {
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const fetchCredits = useCallback(async () => {
    if (!userId) {
      setBalance(0);
      setBatches([]);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [{ data: userData }, { data: batchData }, { data: txData }] = await Promise.all([
        supabase
          .from("users")
          .select("credits_balance")
          .eq("id", userId)
          .single(),
        supabase
          .from("credit_batches")
          .select("id, package_name, credits_purchased, credits_remaining, expires_at, is_expired, created_at")
          .eq("user_id", userId)
          .eq("is_expired", false)
          .gt("credits_remaining", 0)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: true }),
        supabase
          .from("credit_transactions")
          .select("id, type, amount, metadata, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setBalance(userData?.credits_balance ?? 0);
      setBatches((batchData ?? []).map((batch) => ({
        ...batch,
        is_expired: batch.is_expired ?? false,
        created_at: batch.created_at ?? new Date().toISOString(),
      })));
      setTransactions((txData ?? []).map((tx) => ({
        ...tx,
        type: tx.type as CreditTransaction["type"],
        metadata: tx.metadata ?? null,
        created_at: tx.created_at ?? new Date().toISOString(),
      })));
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void fetchCredits();
    }
  }, [userId, fetchCredits]);

  useEffect(() => {
    if (!userId) return;

    // Use a unique channel name per mount to prevent hot-reloading & StrictMode collisions
    // where `.on()` is added to an already-subscribed global channel
    const channel = supabase
      .channel(`credits-user-${userId}-${Math.random().toString(36).substring(7)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new && "credits_balance" in payload.new) {
            setBalance((payload.new as { credits_balance?: number }).credits_balance ?? 0);
          }

          void fetchCredits();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchCredits]);

  const nearestExpiry = useMemo(() => {
    if (batches.length === 0) return null;

    const nearest = batches[0];
    const daysLeft = Math.ceil(
      (new Date(nearest.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return {
      credits: nearest.credits_remaining,
      daysLeft,
    };
  }, [batches]);

  return {
    balance,
    batches,
    transactions,
    isLoading,
    nearestExpiry,
    isLow: balance > 0 && balance <= 3,
    isEmpty: balance === 0,
    refresh: fetchCredits,
  };
}
