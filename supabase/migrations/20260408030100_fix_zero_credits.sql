-- Fix all users currently stuck at 0 credits
UPDATE public.users
SET credits_balance = 3
WHERE credits_balance = 0 OR credits_balance IS NULL;

-- Ensure everyone has a referral code
UPDATE public.users
SET referral_code = lower(substr(md5(random()::text), 1, 8))
WHERE referral_code IS NULL OR referral_code = '';
