-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Make handle_new_user trigger bulletproof with ON CONFLICT.
-- Even if a row somehow pre-exists with 0 credits, this will fix it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, referral_code, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    3
  )
  ON CONFLICT (id) DO UPDATE SET
    credits_balance = CASE
      WHEN public.users.credits_balance = 0 OR public.users.credits_balance IS NULL
      THEN 3
      ELSE public.users.credits_balance
    END,
    referral_code = CASE
      WHEN public.users.referral_code IS NULL OR public.users.referral_code = ''
      THEN lower(substr(md5(random()::text), 1, 8))
      ELSE public.users.referral_code
    END,
    email = EXCLUDED.email,
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    avatar_url = CASE
      WHEN public.users.avatar_url IS NULL OR public.users.avatar_url = ''
      THEN EXCLUDED.avatar_url
      ELSE public.users.avatar_url
    END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
