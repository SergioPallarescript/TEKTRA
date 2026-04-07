
-- Add recipient signature fields to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_signed_by uuid,
  ADD COLUMN IF NOT EXISTS recipient_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_signature_type text,
  ADD COLUMN IF NOT EXISTS recipient_signature_hash text,
  ADD COLUMN IF NOT EXISTS recipient_signature_geo text,
  ADD COLUMN IF NOT EXISTS recipient_signature_image text;

-- Add recipient signature fields to incidents table
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_signed_by uuid,
  ADD COLUMN IF NOT EXISTS recipient_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_signature_type text,
  ADD COLUMN IF NOT EXISTS recipient_signature_hash text,
  ADD COLUMN IF NOT EXISTS recipient_signature_geo text,
  ADD COLUMN IF NOT EXISTS recipient_signature_image text;

-- Allow recipients to update orders (to sign them)
CREATE POLICY "Recipient can sign orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Allow recipients to update incidents (to sign them)
CREATE POLICY "Recipient can sign incidents"
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Create signature_document_recipients table for multi-recipient signatures
CREATE TABLE public.signature_document_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.signature_documents(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  signed_at timestamptz,
  signed_file_path text,
  validation_hash text,
  signature_type text DEFAULT 'manual',
  certificate_cn text,
  certificate_serial text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signature_document_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sender or recipient can view"
  ON public.signature_document_recipients FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.signature_documents sd
      WHERE sd.id = document_id AND sd.sender_id = auth.uid()
    )
  );

CREATE POLICY "Sender can insert recipients"
  ON public.signature_document_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.signature_documents sd
      WHERE sd.id = document_id AND sd.sender_id = auth.uid()
    )
  );

CREATE POLICY "Recipient can update own record"
  ON public.signature_document_recipients FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid());
