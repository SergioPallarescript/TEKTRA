-- Create security definer function to check user email without direct auth.users access
CREATE OR REPLACE FUNCTION public.get_auth_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'auth'
AS $$
  SELECT email FROM auth.users WHERE id = _user_id LIMIT 1;
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can accept own invitation" ON public.project_members;

-- Recreate with security definer function
CREATE POLICY "Users can accept own invitation"
ON public.project_members
FOR UPDATE
TO authenticated
USING (invited_email = public.get_auth_email(auth.uid()))
WITH CHECK (user_id = auth.uid());