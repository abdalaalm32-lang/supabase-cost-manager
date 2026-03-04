
-- Add missing columns to waste_records
ALTER TABLE public.waste_records 
ADD COLUMN IF NOT EXISTS record_number text,
ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS creator_name text;

-- Create waste_edit_history table
CREATE TABLE IF NOT EXISTS public.waste_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  waste_record_id uuid NOT NULL REFERENCES public.waste_records(id) ON DELETE CASCADE,
  editor_name text,
  edited_at timestamp with time zone NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.waste_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access select" ON public.waste_edit_history FOR SELECT
USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_edit_history.waste_record_id AND wr.company_id = get_user_company_id()));

CREATE POLICY "Access insert" ON public.waste_edit_history FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_edit_history.waste_record_id AND wr.company_id = get_user_company_id()));

CREATE POLICY "Access delete" ON public.waste_edit_history FOR DELETE
USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_edit_history.waste_record_id AND wr.company_id = get_user_company_id()));

-- Generate waste record number function
CREATE OR REPLACE FUNCTION public.generate_waste_record_number(p_company_id uuid)
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
    CASE WHEN record_number ~ ('^WST_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(record_number FROM LENGTH('WST_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM waste_records WHERE company_id = p_company_id;
  RETURN 'WST_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;

-- Update status constraint to support Arabic statuses
ALTER TABLE public.waste_records DROP CONSTRAINT IF EXISTS waste_records_status_check;
ALTER TABLE public.waste_records ADD CONSTRAINT waste_records_status_check 
CHECK (status IN ('مسودة', 'مكتمل', 'مؤرشف'));
