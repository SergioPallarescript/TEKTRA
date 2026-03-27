
-- Create security definer function to check project membership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = _project_id
    AND (user_id = _user_id OR invited_email = (SELECT email FROM profiles WHERE user_id = _user_id))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_project_creator(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE id = _project_id AND created_by = _user_id
  )
$$;

-- Fix projects SELECT policy
DROP POLICY IF EXISTS "Members can view their projects" ON projects;
CREATE POLICY "Members can view their projects" ON projects
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_project_member(auth.uid(), id));

-- Fix project_members SELECT policy
DROP POLICY IF EXISTS "Members can view project members" ON project_members;
CREATE POLICY "Members can view project members" ON project_members
  FOR SELECT TO authenticated
  USING (public.is_project_creator(auth.uid(), project_id) OR public.is_project_member(auth.uid(), project_id));

-- Fix project_members INSERT policy
DROP POLICY IF EXISTS "Admins can manage members" ON project_members;
CREATE POLICY "Admins can manage members" ON project_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_creator(auth.uid(), project_id));

-- Fix project_members UPDATE policy
DROP POLICY IF EXISTS "Admins can update members" ON project_members;
CREATE POLICY "Admins can update members" ON project_members
  FOR UPDATE TO authenticated
  USING (public.is_project_creator(auth.uid(), project_id));

-- Fix audit_logs SELECT policy
DROP POLICY IF EXISTS "Members can view audit logs" ON audit_logs;
CREATE POLICY "Members can view audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));

-- Fix notifications INSERT policy to allow inserting for any user in the project
DROP POLICY IF EXISTS "Authenticated users insert notifications" ON notifications;
CREATE POLICY "Authenticated users insert notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);
