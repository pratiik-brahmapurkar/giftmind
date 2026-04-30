export type AnalyticsEventName =
  | "credit_purchase_started"
  | "credit_purchase_completed"
  | "credit_purchase_failed"
  | "referral_link_copied"
  | "referral_signup_completed"
  | "referral_reward_granted"
  | "occasion_reminder_sent"
  | "occasion_reminder_opened"
  | "occasion_reminder_clicked"
  | "gift_history_viewed"
  | "gift_history_detail_viewed"
  | "settings_section_viewed"
  | "cookie_consent_accepted"
  | "cookie_consent_declined"
  | "ai_generation_completed"
  | "ai_generation_failed"
  | "experiment_assigned"
  | string;

export interface GlobalEventProperties {
  user_plan: "spark" | "pro" | null;
  user_country: string | null;
  credits_balance: number;
  onboarding_completed: boolean;
  session_count: number;
  recipient_count: number;
  days_since_signup: number;
  app_version: string;
  experiment_assignments: Record<string, string>;
}

export type AnalyticsProperties = Record<string, unknown>;
