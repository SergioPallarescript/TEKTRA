
DROP POLICY IF EXISTS "Authenticated users insert notifications" ON notifications;
CREATE POLICY "Authenticated users insert notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    OR (project_id IS NOT NULL AND (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id)))
  );
