
-- Add missing columns to production_records
ALTER TABLE public.production_records 
  ADD COLUMN IF NOT EXISTS record_number text,
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS creator_name text;

-- Create production_edit_history table
CREATE TABLE IF NOT EXISTS public.production_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_record_id uuid NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
  editor_name text,
  edited_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.production_edit_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for production_edit_history
CREATE POLICY "Access select" ON public.production_edit_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_edit_history.production_record_id AND pr.company_id = get_user_company_id()));

CREATE POLICY "Access insert" ON public.production_edit_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_edit_history.production_record_id AND pr.company_id = get_user_company_id()));

CREATE POLICY "Access delete" ON public.production_edit_history FOR DELETE
  USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_edit_history.production_record_id AND pr.company_id = get_user_company_id()));

-- Generate production record number function
CREATE OR REPLACE FUNCTION public.generate_production_record_number(p_company_id uuid)
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
    CASE WHEN record_number ~ ('^PRD_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(record_number FROM LENGTH('PRD_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM production_records WHERE company_id = p_company_id;
  RETURN 'PRD_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$function$;
