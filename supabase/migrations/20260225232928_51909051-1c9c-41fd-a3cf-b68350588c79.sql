
CREATE OR REPLACE FUNCTION public.generate_transfer_number(p_company_id uuid)
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
    CASE WHEN source_name ~ ('^TRN_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(source_name FROM LENGTH('TRN_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM transfers WHERE company_id = p_company_id;
  RETURN 'TRN_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;

-- Add record_number column to transfers if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='record_number') THEN
    ALTER TABLE public.transfers ADD COLUMN record_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='total_cost') THEN
    ALTER TABLE public.transfers ADD COLUMN total_cost numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='creator_name') THEN
    ALTER TABLE public.transfers ADD COLUMN creator_name text;
  END IF;
END $$;

-- Update generate_transfer_number to use record_number
CREATE OR REPLACE FUNCTION public.generate_transfer_number(p_company_id uuid)
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
    CASE WHEN record_number ~ ('^TRN_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(record_number FROM LENGTH('TRN_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM transfers WHERE company_id = p_company_id;
  RETURN 'TRN_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;

-- Add avg_cost column to transfer_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_items' AND column_name='avg_cost') THEN
    ALTER TABLE public.transfer_items ADD COLUMN avg_cost numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_items' AND column_name='current_stock') THEN
    ALTER TABLE public.transfer_items ADD COLUMN current_stock numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_items' AND column_name='total_cost') THEN
    ALTER TABLE public.transfer_items ADD COLUMN total_cost numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_items' AND column_name='code') THEN
    ALTER TABLE public.transfer_items ADD COLUMN code text;
  END IF;
END $$;

-- Update status constraint
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_status_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_status_check CHECK (status = ANY (ARRAY['مسودة'::text, 'مكتمل'::text, 'مؤرشف'::text]));
