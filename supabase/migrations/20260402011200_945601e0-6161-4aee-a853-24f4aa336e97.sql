-- Allow admin (info@tektra.es) to update any profile
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND lower(trim(email)) = 'info@tektra.es'
  );
$$;

-- Admin can update any profile
CREATE POLICY "Platform admin can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Admin can insert project_members for anyone
CREATE POLICY "Platform admin can insert members"
ON public.project_members FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Admin can update project_members for anyone
CREATE POLICY "Platform admin can update members"
ON public.project_members FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- Admin can delete project_members
CREATE POLICY "Platform admin can delete members"
ON public.project_members FOR DELETE TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- Admin can view all projects (for the assignment dropdown)
CREATE POLICY "Platform admin can view all projects"
ON public.projects FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));