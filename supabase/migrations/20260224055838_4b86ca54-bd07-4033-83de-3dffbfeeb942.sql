
-- Create supplier code generator
CREATE OR REPLACE FUNCTION public.generate_supplier_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^SUP_[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM suppliers WHERE company_id = p_company_id;
  RETURN 'SUP_' || LPAD(next_num::text, 4, '0');
END;
$function$;

-- Add code column to suppliers if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'code') THEN
    ALTER TABLE public.suppliers ADD COLUMN code text;
  END IF;
END $$;

-- Create purchase invoice number generator (PU_2026_0001)
CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number(p_company_id uuid)
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
    CASE WHEN invoice_number ~ ('^PU_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(invoice_number FROM LENGTH('PU_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM purchase_orders WHERE company_id = p_company_id;
  RETURN 'PU_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;

-- Add invoice_number column to purchase_orders if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'invoice_number') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN invoice_number text;
  END IF;
END $$;
