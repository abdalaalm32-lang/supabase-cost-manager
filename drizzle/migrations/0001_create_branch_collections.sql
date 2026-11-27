CREATE TABLE public.branch_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  transfer_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_collections TO authenticated;
GRANT ALL ON public.branch_collections TO service_role;
ALTER TABLE public.branch_collections ENABLE ROW LEVEL SECURITY;
CREATE INDEX branch_collections_company_idx ON public.branch_collections(company_id, branch_id);
CREATE POLICY "Company view collections" ON public.branch_collections FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert collections" ON public.branch_collections FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update collections" ON public.branch_collections FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company delete collections" ON public.branch_collections FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());