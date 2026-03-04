
-- Add missing columns to stocktakes
ALTER TABLE public.stocktakes 
  ADD COLUMN IF NOT EXISTS record_number text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS total_actual_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_name text;

-- Add missing columns to stocktake_items
ALTER TABLE public.stocktake_items
  ADD COLUMN IF NOT EXISTS book_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_cost numeric NOT NULL DEFAULT 0;

-- Generate stocktake record number
CREATE OR REPLACE FUNCTION public.generate_stocktake_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
  current_year text;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  SELECT COALESCE(MAX(
    CASE WHEN record_number ~ ('^STK_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(record_number FROM LENGTH('STK_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM stocktakes WHERE company_id = p_company_id;
  RETURN 'STK_' || current_year || '_' || LPAD(next_num::text, 3, '0');
END;
$function$;
