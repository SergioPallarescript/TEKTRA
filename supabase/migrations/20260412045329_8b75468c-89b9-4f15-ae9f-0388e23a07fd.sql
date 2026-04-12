
CREATE POLICY "Admins can delete cfo items"
ON public.cfo_items
FOR DELETE
TO authenticated
USING (is_project_admin(auth.uid(), project_id));
