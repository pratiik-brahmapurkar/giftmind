-- Platform settings storage and admin maintenance helpers.
-- Run this SQL in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_only" ON public.platform_settings;
CREATE POLICY "superadmin_only"
ON public.platform_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'superadmin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'superadmin'
  )
);

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('site_name', '"GiftMind"', 'Display name of the platform'),
  ('site_tagline', '"AI-Powered Gift Recommendations"', 'Tagline shown on landing page'),
  ('support_email', '"support@giftmind.in"', 'Public support email address'),
  ('default_currency', '"USD"', 'Default currency for new users'),
  ('default_language', '"en"', 'Default language'),
  ('free_credits', '3', 'Credits given to new signups'),
  ('free_credit_validity_days', '14', 'Validity of signup credits in days'),
  ('gift_session_cost', '1', 'Credits deducted per gift session'),
  ('referral_bonus_referred', '2', 'Bonus credits for referred user'),
  ('referral_bonus_referrer', '3', 'Credits awarded to referrer on first session'),
  ('referral_credit_validity_days', '14', 'Validity of referral credits in days'),
  ('max_referrals_per_user', '10', 'Maximum referrals per user'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('signup_enabled', 'true', 'Allow new user signups'),
  ('google_oauth_enabled', 'true', 'Enable Google OAuth login'),
  ('blog_enabled', 'true', 'Enable public blog'),
  ('ai_model_free', '"claude-haiku-4-5-20251001"', 'AI model for free/starter/popular plans'),
  ('ai_model_pro', '"claude-sonnet-4-20250514"', 'AI model for pro plan'),
  ('ai_model_signal', '"claude-sonnet-4-20250514"', 'AI model for Signal Check'),
  ('signal_check_cost', '0.5', 'Credit cost for Signal Check'),
  ('max_gift_sessions_per_hour', '10', 'Rate limit: max sessions per hour per user'),
  ('signal_checks_per_day', '30', 'Rate limit: signal checks per day per user'),
  ('product_clicks_per_hour', '100', 'Rate limit: product clicks per hour per user'),
  ('referrals_per_hour', '3', 'Rate limit: referrals per hour per IP'),
  ('blog_ai_generations_per_day', '50', 'Rate limit: blog AI generations per day for admins'),
  ('posthog_enabled', 'true', 'Enable Posthog analytics'),
  ('cookie_consent_required', 'true', 'Require cookie consent before analytics'),
  ('feature_signup_enabled', 'true', 'Feature flag: allow new signups'),
  ('feature_google_oauth', 'true', 'Feature flag: Google OAuth login'),
  ('feature_blog_enabled', 'true', 'Feature flag: public blog'),
  ('feature_signal_check', 'true', 'Feature flag: Signal Check'),
  ('feature_cross_border_gifting', 'true', 'Feature flag: cross-border gifting'),
  ('feature_occasion_reminders', 'true', 'Feature flag: occasion reminder emails'),
  ('feature_credit_expiry_warnings', 'true', 'Feature flag: credit expiry warnings'),
  ('feature_posthog_enabled', 'true', 'Feature flag: Posthog analytics'),
  ('feature_cookie_consent_required', 'true', 'Feature flag: cookie consent requirement'),
  ('allowed_origins', '["https://giftmind.in", "http://localhost:5173"]', 'CORS allowlist for frontend domains'),
  ('email_from_name', '"GiftMind"', 'Sender name for outbound emails'),
  ('email_from_email', '"noreply@giftmind.in"', 'Sender email for outbound emails'),
  ('email_reply_to', '"support@giftmind.in"', 'Reply-to email address'),
  ('email_subject_expiry_warning', '"⏰ [X] credits expiring in [Y] days!"', 'Subject template for expiry warnings'),
  ('email_subject_reminder_14', '"🎂 [Name]''s [Occasion] is in 2 weeks"', 'Subject template for 14-day reminders'),
  ('email_subject_reminder_3', '"⏰ [Name]''s [Occasion] is in 3 days!"', 'Subject template for 3-day reminders'),
  ('email_subject_welcome', '"Welcome to GiftMind! 🎁"', 'Subject template for welcome email'),
  ('maintenance_last_credit_expiry_run', 'null', 'Last manual run timestamp for credit expiry check'),
  ('maintenance_last_recalculate_run', 'null', 'Last manual run timestamp for balance recalculation'),
  ('maintenance_last_expired_batch_clear_run', 'null', 'Last manual run timestamp for clearing expired batches')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recalculate_all_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Only superadmins can recalculate balances';
  END IF;

  UPDATE public.users u
  SET credits_balance = COALESCE(
    (
      SELECT SUM(b.credits_remaining)
      FROM public.credit_batches b
      WHERE b.user_id = u.id
        AND COALESCE(b.is_expired, false) = false
        AND b.credits_remaining > 0
        AND b.expires_at > now()
    ),
    0
  );

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'users_updated', affected_count,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_all_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances() TO service_role;
