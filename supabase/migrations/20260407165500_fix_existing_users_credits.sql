-- Fix existing users who have 0 or null credits
-- (they should have gotten 3 free credits on signup)
UPDATE public.users
SET credits_balance = 3
WHERE credits_balance = 0 OR credits_balance IS NULL;

-- Also ensure all users have a referral code
UPDATE public.users
SET referral_code = lower(substr(md5(random()::text), 1, 8))
WHERE referral_code IS NULL;
