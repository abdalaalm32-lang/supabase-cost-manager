
-- Create junction table for stock items to multiple departments
CREATE TABLE public.stock_item_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_item_id, department_id)
);

-- Enable RLS
ALTER TABLE public.stock_item_departments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company select" ON public.stock_item_departments FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.stock_item_departments FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.stock_item_departments FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.stock_item_departments FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Migrate existing department_id data to junction table
INSERT INTO public.stock_item_departments (stock_item_id, department_id, company_id)
SELECT id, department_id, company_id FROM public.stock_items WHERE department_id IS NOT NULL
ON CONFLICT DO NOTHING;
