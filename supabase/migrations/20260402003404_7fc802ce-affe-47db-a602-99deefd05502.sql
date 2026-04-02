DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'project_members' 
    AND policyname = 'Users can accept own invitation'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can accept own invitation" ON public.project_members
    FOR UPDATE TO authenticated
    USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;