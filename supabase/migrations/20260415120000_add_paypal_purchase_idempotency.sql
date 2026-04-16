-- Prevent repeated PayPal capture callbacks from creating duplicate credit batches.
CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_payment_provider_payment_id_unique
ON public.credit_batches (payment_provider, payment_id)
WHERE payment_id IS NOT NULL;
