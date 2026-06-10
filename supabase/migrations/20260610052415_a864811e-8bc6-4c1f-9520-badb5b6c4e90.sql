
CREATE TABLE public.delivery_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commission_percent NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_companies TO authenticated;
GRANT ALL ON public.delivery_companies TO service_role;

ALTER TABLE public.delivery_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view delivery companies"
  ON public.delivery_companies FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company members can insert delivery companies"
  ON public.delivery_companies FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company members can update delivery companies"
  ON public.delivery_companies FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company members can delete delivery companies"
  ON public.delivery_companies FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_delivery_companies_updated_at
  BEFORE UPDATE ON public.delivery_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pos_sales ADD COLUMN delivery_company_id UUID REFERENCES public.delivery_companies(id) ON DELETE SET NULL;
CREATE INDEX idx_pos_sales_delivery_company ON public.pos_sales(delivery_company_id) WHERE delivery_company_id IS NOT NULL;
