DROP POLICY IF EXISTS "Admins can view pending invitations" ON public.project_members;

CREATE POLICY "Admins can view pending invitations"
ON public.project_members
FOR SELECT
TO authenticated
USING (
  status <> 'accepted'
  AND (
    is_project_creator(auth.uid(), project_id)
    OR is_project_admin(auth.uid(), project_id)
    OR is_platform_admin(auth.uid())
    OR invited_email = get_auth_email(auth.uid())
  )
);