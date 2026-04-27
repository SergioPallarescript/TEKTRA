-- Add soft-delete columns to signature_documents for audit-compliant deletion
ALTER TABLE public.signature_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_signature_documents_deleted_at
  ON public.signature_documents(deleted_at);

-- Replace UPDATE policy to allow project admins (DO/DEM) to soft-delete any document in their project
-- We use UPDATE (not DELETE) because soft-delete sets columns instead of removing the row.
DROP POLICY IF EXISTS "Project admin can soft-delete signature documents" ON public.signature_documents;
CREATE POLICY "Project admin can soft-delete signature documents"
  ON public.signature_documents
  FOR UPDATE
  TO authenticated
  USING (public.is_project_admin(auth.uid(), project_id))
  WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- Allow the original sender to also soft-delete their own documents (UPDATE the deleted_* columns)
DROP POLICY IF EXISTS "Sender can soft-delete own signature documents" ON public.signature_documents;
CREATE POLICY "Sender can soft-delete own signature documents"
  ON public.signature_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);
