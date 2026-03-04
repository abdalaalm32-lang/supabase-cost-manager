
-- Fix the function to use record_number column instead of notes
CREATE OR REPLACE FUNCTION public.generate_cost_adjustment_number(p_company_id uuid)
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
    CASE WHEN record_number ~ ('^CADJ_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(record_number FROM LENGTH('CADJ_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM cost_adjustments WHERE company_id = p_company_id;
  RETURN 'CADJ_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;
