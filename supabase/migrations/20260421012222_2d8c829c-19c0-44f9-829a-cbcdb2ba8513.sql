CREATE OR REPLACE FUNCTION public.get_auth_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() = _user_id THEN lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    auth.uid() = _user_id
    AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'info@tektra.es'
  );
$function$;