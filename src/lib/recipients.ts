import type { PostgrestError } from "@supabase/supabase-js";
import type { CulturalContextFormValue, ImportantDate, RecipientFormData } from "@/components/recipients/constants";
import type { Database, Json } from "@/integrations/supabase/types";

type RecipientInsert = Database["public"]["Tables"]["recipients"]["Insert"];
type RecipientUpdate = Database["public"]["Tables"]["recipients"]["Update"];
type RecipientRow = Database["public"]["Tables"]["recipients"]["Row"];

export type RecipientMutationError = Error & {
  userMessage?: string;
};

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeInterests(value: RecipientFormData["interests"] | string | null | undefined) {
  const seen = new Set<string>();

  if (Array.isArray(value)) {
    return value
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => {
        const normalized = entry.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 10);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => {
        const normalized = entry.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 10);
  }

  return [];
}

function normalizeDietary(value: string[] | null | undefined) {
  const seen = new Set<string>();

  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 6);
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

export function parseRecipientCulturalContext(value: string | null | undefined): CulturalContextFormValue {
  if (!value) {
    return { category: "", dietary: [] };
  }

  try {
    const parsed = JSON.parse(value) as Partial<CulturalContextFormValue>;
    if (parsed && typeof parsed === "object") {
      return {
        category: typeof parsed.category === "string" ? parsed.category : "",
        dietary: normalizeDietary(parsed.dietary),
      };
    }
  } catch {
    return { category: value.trim(), dietary: [] };
  }

  return { category: "", dietary: [] };
}

export function parseRecipientImportantDates(value: Database["public"]["Tables"]["recipients"]["Row"]["important_dates"]): ImportantDate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<ImportantDate>;
      if (typeof candidate.label !== "string" || typeof candidate.date !== "string") return null;
      return {
        label: candidate.label,
        date: candidate.date,
        recurring: Boolean(candidate.recurring),
      };
    })
    .filter((entry): entry is ImportantDate => Boolean(entry));
}

function serializeRecipientCulturalContext(value: RecipientFormData["cultural_context_obj"] | null | undefined) {
  const category = normalizeNullableString(value?.category);
  const dietary = normalizeDietary(value?.dietary);

  if (!category && dietary.length === 0) return null;

  return JSON.stringify({
    category: category ?? "",
    dietary,
  });
}

function buildRecipientWritePayload(formData: RecipientFormData) {
  const culturalContext = serializeRecipientCulturalContext(formData.cultural_context_obj)
    ?? normalizeNullableString(formData.cultural_context);

  return {
    name: formData.name.trim(),
    relationship: normalizeNullableString(formData.relationship_type),
    relationship_depth: normalizeNullableString(formData.relationship_depth),
    age_range: normalizeNullableString(formData.age_range),
    gender: normalizeNullableString(formData.gender),
    interests: normalizeInterests(formData.interests),
    notes: normalizeNullableString(formData.notes),
    cultural_context: culturalContext,
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

export function buildRecipientFormData(recipient: RecipientRow): RecipientFormData {
  return {
    name: recipient.name,
    relationship_type: getRecipientRelationship(recipient),
    relationship_depth: recipient.relationship_depth || "close",
    age_range: recipient.age_range || "",
    gender: recipient.gender || "",
    interests: recipient.interests || [],
    cultural_context: "",
    cultural_context_obj: parseRecipientCulturalContext(recipient.cultural_context),
    country: recipient.country || "",
    notes: recipient.notes || "",
    important_dates: parseRecipientImportantDates(recipient.important_dates),
  };
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
  } else if (lowerMessage.includes("recipient_limit_reached")) {
    userMessage = "You have reached the recipient limit for your current plan.";
  } else if (lowerMessage.includes("null value in column")) {
    userMessage = "Please fill in all required fields.";
  } else if (lowerMessage.includes("invalid input syntax")) {
    userMessage = "One of the fields has an invalid format. Please check your inputs.";
  }

  const wrapped = new Error(error.message) as RecipientMutationError;
  wrapped.userMessage = userMessage;
  return wrapped;
}
