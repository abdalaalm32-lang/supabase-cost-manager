
-- Create job_roles table for job titles/positions
CREATE TABLE public.job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.job_roles FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.job_roles FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.job_roles FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.job_roles FOR DELETE USING (company_id = get_user_company_id());

-- Add fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS user_code text,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS job_role_id uuid REFERENCES public.job_roles(id),
  ADD COLUMN IF NOT EXISTS subscription_type text DEFAULT 'unlimited',
  ADD COLUMN IF NOT EXISTS subscription_minutes integer,
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end timestamptz;

-- Function to generate user codes like USR_0001
CREATE OR REPLACE FUNCTION public.generate_user_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN user_code ~ '^USR_[0-9]+$' 
    THEN CAST(SUBSTRING(user_code FROM 5) AS integer) 
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM profiles WHERE company_id = p_company_id;
  RETURN 'USR_' || LPAD(next_num::text, 4, '0');
END;
$function$;
