
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    (NEW.raw_user_meta_data->>'role')::app_role
  );
  
  UPDATE public.project_members 
  SET user_id = NEW.id, status = 'accepted', accepted_at = now()
  WHERE invited_email = NEW.email AND user_id IS NULL;
  
  RETURN NEW;
END;
$function$;
