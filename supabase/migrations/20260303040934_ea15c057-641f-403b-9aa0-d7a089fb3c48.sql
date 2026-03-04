
-- Table to store packing items per category per period
CREATE TABLE public.category_packing_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  period_id UUID NOT NULL REFERENCES public.menu_costing_periods(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  packing_name TEXT NOT NULL,
  cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.category_packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.category_packing_items FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.category_packing_items FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.category_packing_items FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.category_packing_items FOR DELETE USING (company_id = get_user_company_id());
