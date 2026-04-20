
-- 1. Fix is_platform_admin to use auth.users.email (not profiles.email)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
    AND lower(trim(email)) = 'info@tektra.es'
  );
$function$;

-- 2. Restrict profiles UPDATE: users cannot change their own email
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 3. Restrict profiles SELECT: replace overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can always read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can view profiles of members in shared projects
CREATE POLICY "Users can view project member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm1
    JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid()
    AND pm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.project_members pm ON pm.project_id = p.id
    WHERE p.created_by = auth.uid()
    AND pm.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.project_members pm ON pm.project_id = p.id
    WHERE p.created_by = profiles.user_id
    AND pm.user_id = auth.uid()
  )
);

-- Platform admin can view all profiles
CREATE POLICY "Platform admin can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- 4. Fix audit_logs: users can view own audit entries
CREATE POLICY "Users can view own audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 5. Fix plans storage bucket policies
DROP POLICY IF EXISTS "Allow authenticated uploads to plans" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from plans" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to plans" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from plans" ON storage.objects;

-- Also try alternative policy names
DROP POLICY IF EXISTS "plans_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "plans_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "plans_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "plans_bucket_delete" ON storage.objects;

-- Recreate with project membership checks using file path prefix (project_id/...)
CREATE POLICY "Plans bucket: members can read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'plans'
  AND (
    public.is_project_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
    OR public.is_project_creator(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  )
);

CREATE POLICY "Plans bucket: members can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'plans'
  AND (
    public.is_project_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
    OR public.is_project_creator(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  )
);

CREATE POLICY "Plans bucket: members can update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'plans'
  AND (
    public.is_project_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
    OR public.is_project_creator(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  )
);

CREATE POLICY "Plans bucket: members can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'plans'
  AND (
    public.is_project_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
    OR public.is_project_creator(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  )
);

-- 6. Fix mutable search_path on functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_dependencies()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.push_subscriptions WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.brain_messages WHERE user_id = OLD.id;
  DELETE FROM public.audit_logs WHERE user_id = OLD.id;
  DELETE FROM public.order_validations WHERE user_id = OLD.id;
  DELETE FROM public.plan_conformities WHERE user_id = OLD.id;
  DELETE FROM public.signature_documents WHERE sender_id = OLD.id OR recipient_id = OLD.id;
  DELETE FROM public.project_members WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;
