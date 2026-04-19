import { z } from "zod";
import type { ImportantDate } from "@/components/recipients/constants";

const importantDateSchema = z.object({
  label: z.string().trim().min(1).max(50),
  date: z.string().trim().regex(/^\d{2}-\d{2}$/),
  recurring: z.boolean(),
});

export const recipientFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  relationship_type: z.string().trim().min(1, "Please select a relationship"),
  relationship_depth: z.string().trim().max(30).optional().default("close"),
  age_range: z.string().trim().max(30).optional().default(""),
  gender: z.string().trim().max(30).optional().default(""),
  interests: z.array(z.string().trim().min(1).max(100)).max(10, "Maximum 10 interests"),
  cultural_context: z.string().trim().max(50).optional().default(""),
  cultural_context_obj: z.object({
    category: z.string().trim().max(50).optional().default(""),
    dietary: z.array(z.string().trim().min(1).max(30)).max(6, "Maximum 6 dietary preferences"),
  }),
  country: z.string().trim().max(10).optional().default(""),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer").optional().default(""),
  important_dates: z.array(importantDateSchema).max(5, "Maximum 5 dates per person").default([]),
});

export function isValidImportantDate(value: string) {
  return /^\d{2}-\d{2}$/.test(value);
}

export function isCustomDateLabel(label: string) {
  return !["Birthday", "Anniversary", "Work Anniversary", "Graduation", "Housewarming"].includes(label);
}

export type RecipientFormSchemaInput = z.input<typeof recipientFormSchema>;
export type RecipientFormSchemaOutput = z.output<typeof recipientFormSchema>;
export type RecipientImportantDate = ImportantDate;
