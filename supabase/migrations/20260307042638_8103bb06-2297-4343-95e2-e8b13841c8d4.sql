
-- Create junction table for inventory categories <-> departments (many-to-many)
CREATE TABLE public.inventory_category_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.inventory_categories(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, department_id)
);

-- Enable RLS
ALTER TABLE public.inventory_category_departments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company select" ON public.inventory_category_departments FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.inventory_category_departments FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.inventory_category_departments FOR DELETE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.inventory_category_departments FOR UPDATE TO authenticated USING (company_id = get_user_company_id());

-- Migrate existing department_id data to the junction table
INSERT INTO public.inventory_category_departments (category_id, department_id, company_id)
SELECT id, department_id, company_id
FROM public.inventory_categories
WHERE department_id IS NOT NULL
ON CONFLICT (category_id, department_id) DO NOTHING;
