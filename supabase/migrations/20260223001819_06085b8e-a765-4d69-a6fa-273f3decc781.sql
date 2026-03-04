
-- Update prevent_role_change to allow permissions updates (admins can set permissions via RLS)
-- Only block role and company_id changes from client-side
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only prevent role and company_id changes (not permissions)
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    NEW.company_id := OLD.company_id;
  END IF;
  RETURN NEW;
END;
$function$;
