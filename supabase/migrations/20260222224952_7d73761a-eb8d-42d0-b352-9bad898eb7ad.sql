
-- Fix profiles INSERT policy to allow admins to insert for their company users
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR is_company_admin(auth.uid(), company_id)
);

-- Also allow admins to update profiles within their company (not just own)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own or company profile"
ON public.profiles
FOR UPDATE
USING (
  user_id = auth.uid()
  OR is_company_admin(auth.uid(), company_id)
);

-- Allow admins to delete profiles within their company
CREATE POLICY "Admins can delete company profiles"
ON public.profiles
FOR DELETE
USING (is_company_admin(auth.uid(), company_id));
