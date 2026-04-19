import type { AudienceOption, GiftStyleOption } from "@/features/onboarding/constants";

export interface OnboardingState {
  status: "not_started" | "in_progress" | "opted_out" | "completed";
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  audience: AudienceOption[];
  gift_style: GiftStyleOption[];
  skipped_recipient: boolean;
  started_at: string | null;
  completed_at: string | null;
}

export interface BirthdayDraft {
  month: string;
  day: string;
  year: string;
}

export interface ProfileCompletionParams {
  fullName: string | null | undefined;
  country: string | null | undefined;
  recipientCount: number;
  birthday: string | null | undefined;
  audience: string[];
  giftStyle: string[];
}
