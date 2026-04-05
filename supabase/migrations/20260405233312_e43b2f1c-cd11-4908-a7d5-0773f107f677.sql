-- Create a security definer function to check if user is admin (DO/DEM) of a project
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM projects WHERE id = _project_id AND created_by = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = _project_id
        AND user_id = _user_id
        AND role IN ('DO', 'DEM')
    );
$$;

-- Add policy: project admins (DO/DEM) can update members
CREATE POLICY "Project admins can update members"
ON public.project_members
FOR UPDATE
TO authenticated
USING (public.is_project_admin(auth.uid(), project_id));

-- Add policy: project admins (DO/DEM) can insert members
CREATE POLICY "Project admins can insert members"
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_admin(auth.uid(), project_id));