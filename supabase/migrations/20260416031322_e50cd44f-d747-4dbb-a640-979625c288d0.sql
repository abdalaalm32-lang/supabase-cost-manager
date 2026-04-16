
-- Add shift_number to pos_shifts
ALTER TABLE public.pos_shifts ADD COLUMN shift_number text;

-- Add pos_password to profiles for cashier authentication
ALTER TABLE public.profiles ADD COLUMN pos_password text;

-- Create function to generate shift numbers
CREATE OR REPLACE FUNCTION public.generate_shift_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
  current_year text;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  SELECT COALESCE(MAX(
    CASE WHEN shift_number ~ ('^SHF_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(shift_number FROM LENGTH('SHF_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM pos_shifts WHERE company_id = p_company_id;
  RETURN 'SHF_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$$;
