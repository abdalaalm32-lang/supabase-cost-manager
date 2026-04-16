-- Add shift_name to pos_shifts
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS shift_name text;

-- Create shift definitions table
CREATE TABLE public.pos_shift_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  definition_code text,
  shift_name text NOT NULL,
  cashier_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pos_password text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_shift_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.pos_shift_definitions FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_shift_definitions FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_shift_definitions FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_shift_definitions FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Auto-generate definition code function
CREATE OR REPLACE FUNCTION public.generate_shift_definition_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN definition_code ~ '^SHFD_[0-9]+$'
    THEN CAST(SUBSTRING(definition_code FROM 6) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM pos_shift_definitions WHERE company_id = p_company_id;
  RETURN 'SHFD_' || LPAD(next_num::text, 3, '0');
END;
$$;