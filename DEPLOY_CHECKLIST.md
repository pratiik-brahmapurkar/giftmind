# GiftMind Pre-Deployment Checklist

## Before First Deploy
- [ ] All environment variables set in Vercel dashboard
- [ ] Custom domain (giftmind.in) configured in Vercel
- [ ] SSL certificate auto-provisioned by Vercel
- [ ] Supabase Auth > URL Configuration > Site URL = https://giftmind.in
- [ ] Supabase Auth > Redirect URLs includes https://giftmind.in/**
- [ ] Google OAuth > Authorized JavaScript origins includes https://giftmind.in
- [ ] Google OAuth > Authorized redirect URIs includes https://YOUR_REF.supabase.co/auth/v1/callback
- [ ] All Edge Functions deployed (run scripts/deploy-functions.sh)
- [ ] All secrets set (ANTHROPIC_API_KEY, RESEND_API_KEY, CRON_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV)
- [ ] Vercel env vars set (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_PAYPAL_CLIENT_ID, VITE_APP_URL)
- [ ] Cron jobs created in Supabase SQL Editor
- [ ] SuperAdmin account created
- [ ] Credit packages seeded (3 packages in credit_packages table)
- [ ] Marketplace stores seeded (30+ stores in marketplace_config)
- [ ] Blog categories seeded (7 categories)
- [ ] Test the full flow on production URL
- [ ] Submit sitemap to Google Search Console
- [ ] Set up Sentry project and add DSN to Vercel env vars
- [ ] Set up Posthog project and add API key to Vercel env vars
