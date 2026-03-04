
-- Add code and branch_id to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Add code to pos_items  
ALTER TABLE public.pos_items ADD COLUMN IF NOT EXISTS code text;

-- Add category_id to pos_items (reference to categories)
ALTER TABLE public.pos_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id);

-- Create sequence-like function for category codes
CREATE OR REPLACE FUNCTION public.generate_category_code(p_company_id uuid)
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
  FROM categories WHERE company_id = p_company_id;
  RETURN 'CAT_' || LPAD(next_num::text, 3, '0');
END;
$$;

-- Create sequence-like function for item codes
CREATE OR REPLACE FUNCTION public.generate_item_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^ITM_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM pos_items WHERE company_id = p_company_id;
  RETURN 'ITM_' || LPAD(next_num::text, 3, '0');
END;
$$;
