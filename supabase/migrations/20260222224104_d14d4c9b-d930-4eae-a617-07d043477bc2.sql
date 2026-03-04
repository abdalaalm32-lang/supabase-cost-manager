
-- 1. Create app_role enum (extensible for future roles)
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'manager', 'owner', 'accountant', 'support');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create has_role security definer function (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Create get_user_roles function for frontend to read roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), ARRAY[]::app_role[])
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- 6. Check if user is admin within their company
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND company_id = _company_id
  )
$$;

-- 7. RLS policies for user_roles table
-- Users can view roles within their company
CREATE POLICY "Users can view company roles"
ON public.user_roles
FOR SELECT
USING (company_id = get_user_company_id());

-- Only admins can insert roles (but actual insert goes through edge function)
-- Deny direct insert from client
CREATE POLICY "No direct insert"
ON public.user_roles
FOR INSERT
WITH CHECK (false);

-- Deny direct update from client
CREATE POLICY "No direct update"
ON public.user_roles
FOR UPDATE
USING (false);

-- Deny direct delete from client
CREATE POLICY "No direct delete"
ON public.user_roles
FOR DELETE
USING (false);

-- 8. Migrate existing admin user to user_roles
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT p.user_id, 'admin'::app_role, p.company_id
FROM public.profiles p
WHERE p.role = 'مدير نظام'
ON CONFLICT (user_id, role) DO NOTHING;

-- 9. Migrate existing regular users to user_roles
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT p.user_id, 'user'::app_role, p.company_id
FROM public.profiles p
WHERE p.role != 'مدير نظام'
ON CONFLICT (user_id, role) DO NOTHING;

-- 10. Update handle_new_user trigger to also insert into user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  
  -- Insert profile
  INSERT INTO public.profiles (user_id, company_id, full_name, email, role, permissions)
  VALUES (
    NEW.id,
    v_company_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'مستخدم'),
    ARRAY['dashboard']
  );
  
  -- Insert default user role into user_roles table
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (NEW.id, 'user'::app_role, v_company_id);
  
  RETURN NEW;
END;
$$;

-- 11. Protect profiles table - prevent users from updating their own role
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If role or permissions are being changed, revert to old values
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    NEW.permissions := OLD.permissions;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    NEW.company_id := OLD.company_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_profile_role_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_change();

-- 12. Enable realtime for user_roles
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
