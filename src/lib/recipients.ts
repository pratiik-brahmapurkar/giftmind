import type { PostgrestError } from "@supabase/supabase-js";
import type { ImportantDate, RecipientFormData } from "@/components/recipients/constants";
import type { Database, Json } from "@/integrations/supabase/types";

type RecipientInsert = Database["public"]["Tables"]["recipients"]["Insert"];
type RecipientUpdate = Database["public"]["Tables"]["recipients"]["Update"];

export type RecipientMutationError = Error & {
  userMessage?: string;
};

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeInterests(value: RecipientFormData["interests"] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeImportantDates(value: ImportantDate[] | null | undefined): Json[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const label = normalizeNullableString(entry?.label);
    const date = normalizeNullableString(entry?.date);

    if (!label || !date) return [];

    return [{ label, date, recurring: Boolean(entry?.recurring) }];
  });
}

function buildRecipientWritePayload(formData: RecipientFormData) {
  return {
    name: formData.name.trim(),
    relationship: normalizeNullableString(formData.relationship_type),
    relationship_depth: normalizeNullableString(formData.relationship_depth),
    age_range: normalizeNullableString(formData.age_range),
    gender: normalizeNullableString(formData.gender),
    interests: normalizeInterests(formData.interests),
    notes: normalizeNullableString(formData.notes),
    cultural_context: normalizeNullableString(formData.cultural_context),
    country: normalizeNullableString(formData.country)?.toUpperCase() ?? null,
    important_dates: normalizeImportantDates(formData.important_dates),
  };
}

export function buildRecipientInsertPayload(userId: string, formData: RecipientFormData): RecipientInsert {
  return {
    user_id: userId,
    ...buildRecipientWritePayload(formData),
  };
}

export function buildRecipientUpdatePayload(formData: RecipientFormData): RecipientUpdate {
  return buildRecipientWritePayload(formData);
}

export function getRecipientRelationship(value: { relationship?: string | null; relationship_type?: string | null }) {
  return value.relationship ?? value.relationship_type ?? "";
}

export function createRecipientAuthError(message: string): RecipientMutationError {
  const error = new Error(message) as RecipientMutationError;
  error.userMessage = message;
  return error;
}

export function createRecipientMutationError(
  action: "insert" | "update",
  error: PostgrestError,
  payload: RecipientInsert | RecipientUpdate,
): RecipientMutationError {
  console.error(`=== RECIPIENT ${action.toUpperCase()} ERROR ===`);
  console.error("Error code:", error.code);
  console.error("Error message:", error.message);
  console.error("Error details:", error.details);
  console.error("Error hint:", error.hint);
  console.error("Data sent:", JSON.stringify(payload, null, 2));
  console.error("=== END ERROR ===");

  const lowerMessage = error.message.toLowerCase();
  let userMessage = action === "insert"
    ? "Failed to add person. Please try again."
    : "Failed to update person. Please try again.";

  if (lowerMessage.includes("violates row-level security")) {
    userMessage = "Permission denied. Please log out and log back in.";
  } else if (lowerMessage.includes("null value in column")) {
    userMessage = "Please fill in all required fields.";
  } else if (lowerMessage.includes("invalid input syntax")) {
    userMessage = "One of the fields has an invalid format. Please check your inputs.";
  }

  const wrapped = new Error(error.message) as RecipientMutationError;
  wrapped.userMessage = userMessage;
  return wrapped;
}
