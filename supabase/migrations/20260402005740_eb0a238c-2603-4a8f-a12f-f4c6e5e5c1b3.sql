
CREATE OR REPLACE FUNCTION public.delete_user_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS before_user_delete ON auth.users;
CREATE TRIGGER before_user_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_user_dependencies();
