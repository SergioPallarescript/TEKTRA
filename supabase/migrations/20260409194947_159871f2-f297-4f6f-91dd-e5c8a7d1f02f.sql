
-- Allow sender to delete recipient rows for their documents
CREATE POLICY "Sender can delete recipients"
ON public.signature_document_recipients
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.signature_documents sd
    WHERE sd.id = signature_document_recipients.document_id
    AND sd.sender_id = auth.uid()
  )
);
