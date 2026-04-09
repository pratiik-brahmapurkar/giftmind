#!/bin/bash
echo "Deploying all GiftMind Edge Functions..."

supabase functions deploy generate-gifts --no-verify-jwt
supabase functions deploy search-products --no-verify-jwt
supabase functions deploy deduct-credit --no-verify-jwt
supabase functions deploy signal-check --no-verify-jwt
supabase functions deploy process-referral --no-verify-jwt
supabase functions deploy award-referral-credits --no-verify-jwt
supabase functions deploy send-expiry-warnings --no-verify-jwt
supabase functions deploy send-occasion-reminders --no-verify-jwt
supabase functions deploy blog-ai-assistant --no-verify-jwt
supabase functions deploy generate-sitemap --no-verify-jwt
supabase functions deploy generate-rss --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
supabase functions deploy export-user-data --no-verify-jwt

echo "Setting secrets..."
echo "Run manually:"
echo "supabase secrets set ANTHROPIC_API_KEY=sk-ant-..."
echo "supabase secrets set RESEND_API_KEY=re_..."
echo "supabase secrets set CRON_SECRET=your_random_secret"

echo "Done! Verify with: supabase functions list"
