-- Add info-only flag to signature_documents
ALTER TABLE public.signature_documents
ADD COLUMN IF NOT EXISTS is_info_only boolean NOT NULL DEFAULT false;

-- Add read receipt tracking to signature_document_recipients
ALTER TABLE public.signature_document_recipients
ADD COLUMN IF NOT EXISTS viewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS viewed_by uuid;