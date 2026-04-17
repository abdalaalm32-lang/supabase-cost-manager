CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_id uuid;
  is_admin boolean := false;
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));

  -- Always prevent direct role/company reassignment from profile edits
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    NEW.company_id := OLD.company_id;
  END IF;

  -- Trusted backend updates may manage permissions safely
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Prevent permissions changes unless caller is a company admin/owner or system admin
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    BEGIN
      caller_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      caller_id := NULL;
    END;

    IF caller_id IS NOT NULL AND caller_id != OLD.user_id THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = caller_id
          AND (role = 'admin' OR (role = 'owner' AND company_id = OLD.company_id))
      ) INTO is_admin;

      IF NOT is_admin THEN
        SELECT public.is_company_admin(caller_id, OLD.company_id) INTO is_admin;
      END IF;
    ELSIF caller_id = OLD.user_id THEN
      is_admin := true;
    END IF;

    IF NOT is_admin THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;