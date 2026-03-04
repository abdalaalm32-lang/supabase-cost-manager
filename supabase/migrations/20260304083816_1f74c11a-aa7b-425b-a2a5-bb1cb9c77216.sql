
-- Allow owners to update their own company
DROP POLICY IF EXISTS "Admin can update companies" ON public.companies;
CREATE POLICY "Admin or owner can update companies"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.is_company_owner(auth.uid(), id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    OR public.is_company_owner(auth.uid(), id)
  );
