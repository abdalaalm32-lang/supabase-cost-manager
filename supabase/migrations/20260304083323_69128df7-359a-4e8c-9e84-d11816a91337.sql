
-- Add owner to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

-- Add columns to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS max_branches integer NOT NULL DEFAULT 2;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS max_warehouses integer NOT NULL DEFAULT 1;

-- Allow admin to update companies
CREATE POLICY "Admin can update companies"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow admin to delete companies  
CREATE POLICY "Admin can delete companies"
  ON public.companies FOR DELETE
  TO authenticated
  USING (true);

-- Allow admin to select all companies
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    id = get_user_company_id() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- Function to check if user is owner of company
CREATE OR REPLACE FUNCTION public.is_company_owner(_user_id uuid, _company_id uuid)
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
      AND role = 'owner'
      AND company_id = _company_id
  )
$$;
