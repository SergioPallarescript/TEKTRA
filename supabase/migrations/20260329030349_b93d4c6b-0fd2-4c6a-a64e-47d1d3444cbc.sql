CREATE TABLE public.signature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  title TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  signed_file_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  validation_hash TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signature_documents_status_check CHECK (status IN ('pending', 'signed'))
);

ALTER TABLE public.signature_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_signature_documents_project_id ON public.signature_documents(project_id);
CREATE INDEX idx_signature_documents_sender_id ON public.signature_documents(sender_id);
CREATE INDEX idx_signature_documents_recipient_id ON public.signature_documents(recipient_id);
CREATE INDEX idx_signature_documents_status ON public.signature_documents(status);

CREATE POLICY "Sender or recipient can view signature documents"
ON public.signature_documents
FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Project member sender can create private signature documents"
ON public.signature_documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Recipient can sign own private documents"
ON public.signature_documents
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Sender can delete pending private documents"
ON public.signature_documents
FOR DELETE
TO authenticated
USING (auth.uid() = sender_id AND status = 'pending');

CREATE OR REPLACE FUNCTION public.set_signature_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_signature_documents_updated_at
BEFORE UPDATE ON public.signature_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_signature_documents_updated_at();