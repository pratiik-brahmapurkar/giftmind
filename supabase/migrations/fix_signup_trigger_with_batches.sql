CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, referral_code, credits_balance)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    lower(substr(md5(random()::text), 1, 8)),
    3
  )
  ON CONFLICT (id) DO UPDATE SET
    credits_balance = CASE 
      WHEN public.users.credits_balance = 0 OR public.users.credits_balance IS NULL 
      THEN 3 
      ELSE public.users.credits_balance 
    END;

  INSERT INTO public.credit_batches (
    user_id, package_name, credits_purchased, credits_remaining,
    price_paid, currency, payment_provider, expires_at
  ) VALUES (
    new.id, 'free_signup', 3, 3,
    0, 'USD', 'system',
    now() + interval '14 days'
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.credit_batches (
  user_id, package_name, credits_purchased, credits_remaining,
  price_paid, currency, payment_provider, expires_at
)
SELECT 
  id, 'free_signup', 3, credits_balance,
  0, 'USD', 'system',
  now() + interval '14 days'
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_batches b WHERE b.user_id = u.id
);
