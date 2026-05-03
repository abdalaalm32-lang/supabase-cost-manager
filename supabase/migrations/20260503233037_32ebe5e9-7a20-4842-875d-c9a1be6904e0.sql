
-- 1. Helper: check if user is admin OR owner of a company
CREATE OR REPLACE FUNCTION public.is_company_admin_or_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND role IN ('admin', 'owner')
  )
$$;

-- 2. Tighten profiles SELECT
DROP POLICY IF EXISTS "Users can view company profiles" ON public.profiles;

CREATE POLICY "Users view own profile or admins/owners view all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_company_admin_or_owner(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Safe directory function for company members (returns only non-sensitive fields)
CREATE OR REPLACE FUNCTION public.get_company_profiles_directory(_company_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  user_code text,
  branch_id uuid,
  job_role_id uuid,
  status text,
  company_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.full_name, p.user_code, p.branch_id, p.job_role_id, p.status, p.company_id
  FROM public.profiles p
  WHERE p.company_id = _company_id
    AND (
      p.company_id = public.get_user_company_id()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_company_profiles_directory(uuid) TO authenticated;

-- 4. Tighten pos_shift_definitions SELECT to admins/owners only (contains pos_password)
DROP POLICY IF EXISTS "Company select" ON public.pos_shift_definitions;

CREATE POLICY "Admins/owners view shift definitions"
ON public.pos_shift_definitions
FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id()
  AND public.is_company_admin_or_owner(auth.uid(), company_id)
);

-- 5. Safe directory function for cashiers to list shift definitions (no pos_password)
CREATE OR REPLACE FUNCTION public.get_company_shift_definitions(_company_id uuid)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  definition_code text,
  shift_name text,
  cashier_profile_id uuid,
  active boolean,
  has_password boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.company_id, d.definition_code, d.shift_name, d.cashier_profile_id,
         d.active, (d.pos_password IS NOT NULL AND d.pos_password <> '') AS has_password,
         d.created_at
  FROM public.pos_shift_definitions d
  WHERE d.company_id = _company_id
    AND d.company_id = public.get_user_company_id();
$$;

GRANT EXECUTE ON FUNCTION public.get_company_shift_definitions(uuid) TO authenticated;

-- 6. Function to verify a shift's pos_password without exposing it
CREATE OR REPLACE FUNCTION public.verify_shift_definition_password(_definition_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pos_shift_definitions
    WHERE id = _definition_id
      AND company_id = public.get_user_company_id()
      AND COALESCE(pos_password, '') = COALESCE(_password, '')
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_shift_definition_password(uuid, text) TO authenticated;

-- 7. Function to verify own pos_password (used by PosShiftManager)
CREATE OR REPLACE FUNCTION public.verify_own_pos_password(_password text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND COALESCE(pos_password, '') = COALESCE(_password, '')
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_own_pos_password(text) TO authenticated;
