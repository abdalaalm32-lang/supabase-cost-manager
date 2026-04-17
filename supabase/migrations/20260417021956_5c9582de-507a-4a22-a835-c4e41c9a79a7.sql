DROP POLICY IF EXISTS "Authenticated users can create a company" ON public.companies;

CREATE POLICY "System admins can create companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));