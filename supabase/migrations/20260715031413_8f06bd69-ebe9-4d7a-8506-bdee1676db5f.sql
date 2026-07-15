
-- 1. Extend companies with trial fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;

-- Backfill existing companies as 'active' (not trial)
UPDATE public.companies SET subscription_status = 'active' WHERE subscription_status IS NULL;

-- 2. trial_leads table
CREATE TABLE IF NOT EXISTS public.trial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  restaurant_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text,
  email text NOT NULL,
  city text,
  branches_count integer DEFAULT 1,
  current_system text,
  status text NOT NULL DEFAULT 'new_lead',
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  last_contact_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_leads TO authenticated;
GRANT ALL ON public.trial_leads TO service_role;

ALTER TABLE public.trial_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all leads"
  ON public.trial_leads FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert leads"
  ON public.trial_leads FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update leads"
  ON public.trial_leads FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete leads"
  ON public.trial_leads FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_trial_leads_updated_at
  BEFORE UPDATE ON public.trial_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. company_activity table (aggregated activity for admin dashboard)
CREATE TABLE IF NOT EXISTS public.company_activity (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_login_at timestamptz,
  login_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.company_activity TO authenticated;
GRANT ALL ON public.company_activity TO service_role;

ALTER TABLE public.company_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all activity"
  ON public.company_activity FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own company activity"
  ON public.company_activity FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can upsert their own activity"
  ON public.company_activity FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update their own activity"
  ON public.company_activity FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- 4. Function: check if company trial is expired
CREATE OR REPLACE FUNCTION public.is_company_expired(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND (
        subscription_status = 'expired'
        OR (subscription_status = 'trial' AND trial_end_date IS NOT NULL AND trial_end_date < now())
      )
  );
$$;

-- 5. Cron-like function to expire trials (call manually or via scheduled)
CREATE OR REPLACE FUNCTION public.expire_ended_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.companies
  SET subscription_status = 'expired'
  WHERE subscription_status = 'trial'
    AND trial_end_date IS NOT NULL
    AND trial_end_date < now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
