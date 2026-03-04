
-- Fix profiles SELECT policy to allow admins to see all profiles
DROP POLICY IF EXISTS "Users can view company profiles" ON public.profiles;
CREATE POLICY "Users can view company profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id()
  OR has_role(auth.uid(), 'admin'::app_role)
);
