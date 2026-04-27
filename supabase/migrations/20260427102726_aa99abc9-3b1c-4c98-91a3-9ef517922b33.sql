-- 1) Tighten is_project_member to require accepted status
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = _project_id
      AND status = 'accepted'
      AND (
        user_id = _user_id
        OR invited_email = (SELECT email FROM profiles WHERE user_id = _user_id)
      )
  )
$function$;

-- 2) Storage policy: deny reads when project_id can't be extracted from path
DROP POLICY IF EXISTS "Members can read plan files" ON storage.objects;
DROP POLICY IF EXISTS "Project members can read plans" ON storage.objects;
DROP POLICY IF EXISTS "Members can view plan files" ON storage.objects;
DROP POLICY IF EXISTS "Plans bucket read" ON storage.objects;

-- Recreate read policy without the IS NULL escape hatch
CREATE POLICY "Plans bucket: members can read project files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'plans'
  AND public.extract_project_id_from_path(name) IS NOT NULL
  AND (
    public.is_project_member(auth.uid(), public.extract_project_id_from_path(name))
    OR public.is_project_creator(auth.uid(), public.extract_project_id_from_path(name))
  )
);

-- 3) Revoke EXECUTE on internal admin / queue functions from PUBLIC and authenticated
REVOKE EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_dependencies() FROM PUBLIC, anon, authenticated;

-- Ensure service_role keeps access
GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;