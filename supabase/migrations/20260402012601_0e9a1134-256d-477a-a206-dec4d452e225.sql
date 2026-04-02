
-- Create a function to delete a user from auth.users (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_auth_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Clean public dependencies first
  DELETE FROM public.push_subscriptions WHERE user_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.brain_messages WHERE user_id = _user_id;
  DELETE FROM public.audit_logs WHERE user_id = _user_id;
  DELETE FROM public.order_validations WHERE user_id = _user_id;
  DELETE FROM public.plan_conformities WHERE user_id = _user_id;
  DELETE FROM public.signature_documents WHERE sender_id = _user_id OR recipient_id = _user_id;
  DELETE FROM public.project_members WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;
  
  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;
