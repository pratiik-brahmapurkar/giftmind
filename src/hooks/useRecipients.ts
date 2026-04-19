import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPlan } from "@/hooks/useUserPlan";
import { canAddRecipientForPlan, getRecipientLimit, getRecipientLimitMessage } from "@/lib/planLimits";
import {
  buildRecipientInsertPayload,
  buildRecipientUpdatePayload,
  createRecipientAuthError,
  createRecipientMutationError,
  getRecipientRelationship,
  parseRecipientImportantDates,
} from "@/lib/recipients";
import type { ImportantDate, RecipientFormData } from "@/components/recipients/constants";

type RecipientRow = Database["public"]["Tables"]["recipients"]["Row"];
type UserProfileRow = Pick<Tables<"users">, "country" | "active_plan">;

export type RecipientWithIntelligence = RecipientRow & {
  relationship: string;
  interests: string[];
  gift_count: number;
  session_count: number;
  next_important_date: ImportantDate | null;
  next_important_date_days: number | null;
};

function getDaysUntilDate(mmdd: string) {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today.getFullYear(), month - 1, day);

  if (Number.isNaN(target.getTime())) return null;
  if (target < today) {
    target = new Date(today.getFullYear() + 1, month - 1, day);
  }

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isBirthdayOrAnniversary(label: string) {
  const normalized = label.trim().toLowerCase();
  return normalized.includes("birthday") || normalized.includes("anniversary");
}

function getNextImportantDate(value: RecipientRow["important_dates"]) {
  const dated = parseRecipientImportantDates(value)
    .map((entry) => ({
      entry,
      days: getDaysUntilDate(entry.date),
      priority: isBirthdayOrAnniversary(entry.label) ? 0 : 1,
    }))
    .filter((entry): entry is { entry: ImportantDate; days: number; priority: number } => entry.days !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.days - b.days;
    });

  if (dated.length === 0) return null;
  return {
    entry: dated[0].entry,
    days: dated[0].days,
  };
}

export function useRecipients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { plan, limits } = useUserPlan();

  const query = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as RecipientRow[];
    },
    enabled: !!user,
  });

  const profileQuery = useQuery({
    queryKey: ["profile-country", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("country")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data as Pick<Tables<"users">, "country">;
    },
    enabled: !!user,
  });

  const recipients = useMemo(() => query.data ?? [], [query.data]);

  const recipientsWithIntelligence = useMemo<RecipientWithIntelligence[]>(() => {
    return recipients.map((recipient) => {
      const nextDate = getNextImportantDate(recipient.important_dates);

      return {
        ...recipient,
        relationship: getRecipientRelationship(recipient),
        interests: recipient.interests ?? [],
        gift_count: recipient.gift_count_cached ?? 0,
        session_count: recipient.session_count ?? 0,
        next_important_date: nextDate?.entry ?? null,
        next_important_date_days: nextDate?.days ?? null,
      };
    });
  }, [recipients]);

  const maxAllowed = getRecipientLimit(plan);
  const atLimit = maxAllowed !== -1 && recipients.length >= maxAllowed;
  const sortedForAccess = useMemo(
    () => [...recipients].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
    [recipients],
  );
  const activeRecipientIds = useMemo(
    () => new Set((maxAllowed === -1 ? sortedForAccess : sortedForAccess.slice(0, maxAllowed)).map((recipient) => recipient.id)),
    [maxAllowed, sortedForAccess],
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["recipients", user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["profile-completion", user?.id] });
  };

  const createMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to add a person");

      const [{ data: userData }, { count, error: countError }] = await Promise.all([
        supabase.from("users").select("active_plan").eq("id", authUser.id).single(),
        supabase.from("recipients").select("*", { count: "exact", head: true }).eq("user_id", authUser.id),
      ]);

      if (countError) throw countError;

      const activePlan = (userData as UserProfileRow | null)?.active_plan || "spark";
      const insertMaxAllowed = getRecipientLimit(activePlan);
      if (!canAddRecipientForPlan(activePlan, count || 0)) {
        throw createRecipientAuthError(getRecipientLimitMessage(activePlan, insertMaxAllowed));
      }

      const payload = buildRecipientInsertPayload(authUser.id, form);
      const { data, error } = await supabase
        .from("recipients")
        .insert(payload)
        .select()
        .single();

      if (error) throw createRecipientMutationError("insert", error, payload);
      return data as RecipientRow;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: RecipientFormData }) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to update a person");

      const payload = buildRecipientUpdatePayload(form);
      const { error } = await supabase
        .from("recipients")
        .update(payload)
        .eq("id", id)
        .eq("user_id", authUser.id);

      if (error) throw createRecipientMutationError("update", error, payload);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to delete a person");

      const { error } = await supabase
        .from("recipients")
        .delete()
        .eq("id", id)
        .eq("user_id", authUser.id);

      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    query,
    profileQuery,
    recipients,
    recipientsWithIntelligence,
    userCountry: profileQuery.data?.country || "US",
    plan,
    limits,
    atLimit,
    maxAllowed,
    activeRecipientIds,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
