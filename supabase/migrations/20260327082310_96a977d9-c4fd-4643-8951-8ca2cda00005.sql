
-- Add secondary_role column for dual-role support
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS secondary_role public.app_role DEFAULT NULL;

-- Allow project creators to delete members (remove agents)
CREATE POLICY "Admins can delete members"
ON public.project_members
FOR DELETE
TO authenticated
USING (is_project_creator(auth.uid(), project_id));
