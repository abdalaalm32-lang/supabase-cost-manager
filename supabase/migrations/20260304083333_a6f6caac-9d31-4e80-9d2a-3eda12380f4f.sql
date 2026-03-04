
-- Fix: restrict company update/delete to admin role only
DROP POLICY IF EXISTS "Admin can update companies" ON public.companies;
CREATE POLICY "Admin can update companies"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin can delete companies" ON public.companies;
CREATE POLICY "Admin can delete companies"
  ON public.companies FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
