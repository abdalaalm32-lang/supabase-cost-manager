
-- Create separate inventory_categories table
CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  code text,
  storage_type text,
  department_id uuid REFERENCES public.departments(id),
  identifier_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.inventory_categories FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.inventory_categories FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.inventory_categories FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.inventory_categories FOR DELETE USING (company_id = get_user_company_id());

-- Generate code function for inventory categories
CREATE OR REPLACE FUNCTION public.generate_inventory_category_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^CAT_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM inventory_categories WHERE company_id = p_company_id;
  RETURN 'CAT_' || LPAD(next_num::text, 3, '0');
END;
$$;

-- Update stock_items to reference inventory_categories instead of categories
ALTER TABLE public.stock_items
  DROP CONSTRAINT IF EXISTS stock_items_category_id_fkey,
  ADD CONSTRAINT stock_items_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);

-- Update generate_stock_item_code to use inventory_categories
CREATE OR REPLACE FUNCTION public.generate_stock_item_code(p_company_id uuid, p_identifier_code text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
  prefix text;
BEGIN
  prefix := COALESCE(p_identifier_code, 'ITM');
  SELECT COALESCE(MAX(
    CASE WHEN code ~ ('^' || prefix || '_[0-9]+$')
    THEN CAST(SUBSTRING(code FROM LENGTH(prefix) + 2) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM stock_items WHERE company_id = p_company_id;
  RETURN prefix || '_' || next_num::text;
END;
$$;
