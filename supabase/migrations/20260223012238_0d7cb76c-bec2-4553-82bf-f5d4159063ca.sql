
-- Add address, manager_id, code to branches
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS manager_id uuid;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS code text;

-- Add classification, manager_id, code to warehouses
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS classification text DEFAULT 'مخزن رئيسي';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager_id uuid;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS code text;

-- Create warehouse_branches junction table
CREATE TABLE IF NOT EXISTS public.warehouse_branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, branch_id)
);

ALTER TABLE public.warehouse_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.warehouse_branches FOR SELECT
  USING (EXISTS (SELECT 1 FROM warehouses w WHERE w.id = warehouse_branches.warehouse_id AND w.company_id = get_user_company_id()));

CREATE POLICY "Company insert" ON public.warehouse_branches FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM warehouses w WHERE w.id = warehouse_branches.warehouse_id AND w.company_id = get_user_company_id()));

CREATE POLICY "Company delete" ON public.warehouse_branches FOR DELETE
  USING (EXISTS (SELECT 1 FROM warehouses w WHERE w.id = warehouse_branches.warehouse_id AND w.company_id = get_user_company_id()));

-- Generate branch code function
CREATE OR REPLACE FUNCTION public.generate_branch_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^BRN_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM branches WHERE company_id = p_company_id;
  RETURN 'BRN_' || LPAD(next_num::text, 3, '0');
END;
$function$;

-- Generate warehouse code function
CREATE OR REPLACE FUNCTION public.generate_warehouse_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^WRH_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM warehouses WHERE company_id = p_company_id;
  RETURN 'WRH_' || LPAD(next_num::text, 3, '0');
END;
$function$;
