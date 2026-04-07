-- Allow users to delete their own brain messages (for conversation deletion)
CREATE POLICY "Users can delete own brain messages"
  ON public.brain_messages
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to update their own brain messages (for renaming conversations)
CREATE POLICY "Users can update own brain messages"
  ON public.brain_messages
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());