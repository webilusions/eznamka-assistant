ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS payment_qr_base64 text,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS payment_amount text;