
DROP POLICY "System inserts notifications" ON public.notifications;
CREATE POLICY "Authenticated users insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid())
  );
