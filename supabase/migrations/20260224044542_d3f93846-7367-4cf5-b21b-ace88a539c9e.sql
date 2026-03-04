
-- Add code column to departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS code text;

-- Add identifier_code to categories (user-defined prefix like "SA")
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS identifier_code text;

-- Add code column to stock_items
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS code text;

-- Add max_level to stock_items
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS max_level numeric NOT NULL DEFAULT 0;

-- Create storage_types table
CREATE TABLE IF NOT EXISTS public.storage_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.storage_types FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.storage_types FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.storage_types FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.storage_types FOR DELETE USING (company_id = get_user_company_id());

-- Generate department code function
CREATE OR REPLACE FUNCTION public.generate_department_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^DEP_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM departments WHERE company_id = p_company_id;
  RETURN 'DEP_' || LPAD(next_num::text, 3, '0');
END;
$$;

-- Generate stock item code based on category identifier_code
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
