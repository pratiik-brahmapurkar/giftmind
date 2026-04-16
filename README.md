# GiftMind

## PayPal Checkout

GiftMind uses PayPal Checkout for USD credit purchases. INR checkout is intentionally disabled in the PayPal UI because this flow does not support INR; use a local processor for INR payments.

Frontend environment:

```bash
VITE_PAYPAL_CLIENT_ID=your_paypal_client_id
```

Supabase Edge Function secrets:

```bash
supabase secrets set PAYPAL_CLIENT_ID=your_paypal_client_id
supabase secrets set PAYPAL_CLIENT_SECRET=your_paypal_client_secret
supabase secrets set PAYPAL_ENV=sandbox
```

Use `PAYPAL_ENV=live` for production. The server-side `paypal-checkout` function creates and captures PayPal orders, then writes the matching credit batch and transaction.
