CREATE OR REPLACE FUNCTION public.generate_category_code(p_company_id uuid, p_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^CAT_[0-9]+$'
    THEN CAST(SUBSTRING(code FROM 5) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM categories
  WHERE company_id = p_company_id
    AND ((p_branch_id IS NULL AND branch_id IS NULL) OR branch_id = p_branch_id);
  RETURN 'CAT_' || LPAD(next_num::text, 3, '0');
END;
$function$;