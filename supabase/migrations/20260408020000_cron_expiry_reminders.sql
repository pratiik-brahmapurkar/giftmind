-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: run_credit_expiry RPC + cron job setup
-- Run the RPC section immediately in the Supabase SQL Editor.
-- Run the cron section AFTER deploying the edge functions.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add warning_sent column to credit_batches (if not already present) ───
ALTER TABLE public.credit_batches
  ADD COLUMN IF NOT EXISTS warning_sent BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. run_credit_expiry RPC ────────────────────────────────────────────────
-- Called daily by send-expiry-warnings edge function.
-- Marks expired batches is_expired=true and recalculates user credit balances.
CREATE OR REPLACE FUNCTION public.run_credit_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Step 1: Mark batches whose expiry timestamp has passed
  UPDATE public.credit_batches
  SET is_expired = true
  WHERE expires_at < now()
    AND is_expired = false;

  -- Step 2: Recalculate credits_balance for all users affected by
  --         batches that just expired (expired within the last 24h window)
  UPDATE public.users u
  SET credits_balance = COALESCE(
    (
      SELECT SUM(b.credits_remaining)
      FROM public.credit_batches b
      WHERE b.user_id = u.id
        AND b.is_expired = false
        AND b.credits_remaining > 0
        AND b.expires_at > now()
    ),
    0
  )
  WHERE u.id IN (
    SELECT DISTINCT user_id
    FROM public.credit_batches
    WHERE is_expired = true
      AND expires_at >= now() - INTERVAL '1 day'
  );
END;
$$;

-- Grant execute to service role (used by edge function admin client)
GRANT EXECUTE ON FUNCTION public.run_credit_expiry() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- CRON SETUP — Run this section AFTER deploying the edge functions.
-- Replace YOUR_PROJECT_REF with your actual Supabase project reference ID
-- (e.g. abcdefghijklmnop — found in Project Settings → API).
-- Replace YOUR_CRON_SECRET with the value you set as CRON_SECRET env var.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;  -- required for net.http_post

-- Remove existing jobs if re-running this migration
SELECT cron.unschedule('expire-credits-and-warn')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-credits-and-warn');
SELECT cron.unschedule('send-occasion-reminders')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-occasion-reminders');

-- Credit expiry + warning: daily at midnight IST (18:30 UTC)
SELECT cron.schedule(
  'expire-credits-and-warn',
  '30 18 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-expiry-warnings',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Occasion reminders: daily at 9 AM IST (03:30 UTC)
SELECT cron.schedule(
  'send-occasion-reminders',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-occasion-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
