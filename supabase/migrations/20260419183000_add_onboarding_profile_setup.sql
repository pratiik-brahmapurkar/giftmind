ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_completion_percentage integer NOT NULL DEFAULT 0
    CHECK (profile_completion_percentage >= 0 AND profile_completion_percentage <= 100),
  ADD COLUMN IF NOT EXISTS onboarding_bonus_granted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    referral_code,
    credits_balance,
    active_plan,
    onboarding_state
  )
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    3,
    'spark',
    jsonb_build_object(
      'status', 'not_started',
      'current_step', 1,
      'completed_steps', '[]'::jsonb,
      'skipped_steps', '[]'::jsonb,
      'audience', '[]'::jsonb,
      'gift_style', '[]'::jsonb,
      'skipped_recipient', false,
      'started_at', null,
      'completed_at', null
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    avatar_url = CASE
      WHEN public.users.avatar_url IS NULL OR public.users.avatar_url = ''
      THEN EXCLUDED.avatar_url
      ELSE public.users.avatar_url
    END,
    onboarding_state = CASE
      WHEN public.users.onboarding_state IS NULL
      THEN EXCLUDED.onboarding_state
      ELSE public.users.onboarding_state
    END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.calculate_profile_completion(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_score integer := 0;
  v_user record;
  v_recipient_count integer := 0;
  v_audience_len integer := 0;
  v_style_len integer := 0;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  IF v_user.full_name IS NOT NULL AND length(trim(v_user.full_name)) >= 2 THEN
    v_score := v_score + 20;
  END IF;

  IF v_user.country IS NOT NULL AND trim(v_user.country) <> '' THEN
    v_score := v_score + 20;
  END IF;

  SELECT count(*) INTO v_recipient_count
  FROM public.recipients
  WHERE user_id = p_user_id;

  IF v_recipient_count >= 1 THEN
    v_score := v_score + 25;
  END IF;

  IF v_user.onboarding_state IS NOT NULL THEN
    v_audience_len := COALESCE(jsonb_array_length(v_user.onboarding_state->'audience'), 0);
    v_style_len := COALESCE(jsonb_array_length(v_user.onboarding_state->'gift_style'), 0);
  END IF;

  IF v_audience_len > 0 THEN
    v_score := v_score + 15;
  END IF;

  IF v_user.birthday IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;

  IF v_style_len > 0 THEN
    v_score := v_score + 10;
  END IF;

  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.calculate_profile_completion(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_profile_completion()
RETURNS trigger AS $$
BEGIN
  NEW.profile_completion_percentage := public.calculate_profile_completion(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_completion_on_user_update ON public.users;
CREATE TRIGGER sync_profile_completion_on_user_update
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_completion();

CREATE OR REPLACE FUNCTION public.refresh_profile_completion_for_user()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF v_user_id IS NOT NULL THEN
    UPDATE public.users
    SET profile_completion_percentage = public.calculate_profile_completion(v_user_id)
    WHERE id = v_user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS refresh_profile_completion_on_recipient_change ON public.recipients;
CREATE TRIGGER refresh_profile_completion_on_recipient_change
  AFTER INSERT OR UPDATE OR DELETE ON public.recipients
  FOR EACH ROW EXECUTE FUNCTION public.refresh_profile_completion_for_user();

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND onboarding_bonus_granted = (
      SELECT onboarding_bonus_granted FROM public.users WHERE id = auth.uid()
    )
    AND credits_balance = (
      SELECT credits_balance FROM public.users WHERE id = auth.uid()
    )
    AND role = (
      SELECT role FROM public.users WHERE id = auth.uid()
    )
    AND active_plan = (
      SELECT active_plan FROM public.users WHERE id = auth.uid()
    )
  );

UPDATE public.users u
SET profile_completion_percentage = public.calculate_profile_completion(u.id);
