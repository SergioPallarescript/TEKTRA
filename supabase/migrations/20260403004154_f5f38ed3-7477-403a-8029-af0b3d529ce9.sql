ALTER TABLE public.signature_documents 
  ADD COLUMN IF NOT EXISTS signature_type text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS certificate_cn text,
  ADD COLUMN IF NOT EXISTS certificate_serial text;