export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'opted_out';

export interface OnboardingState {
  status: OnboardingStatus;
  current_step: 1 | 2 | 3 | 4 | 5;
  completed_steps: number[];
  skipped_steps: number[];
  audience: string[];
  gift_style: string[];
  skipped_recipient: boolean;
  started_at: string | null;
  completed_at: string | null;
}

export const defaultOnboardingState: OnboardingState = {
  status: 'not_started',
  current_step: 1,
  completed_steps: [],
  skipped_steps: [],
  audience: [],
  gift_style: [],
  skipped_recipient: false,
  started_at: null,
  completed_at: null,
};

export type AudienceValue = 'family' | 'friends' | 'partner' | 'work' | 'kids' | 'online';
export type GiftStyleValue =
  | 'thoughtful' | 'practical' | 'extravagant'
  | 'funny' | 'experience' | 'creative';
