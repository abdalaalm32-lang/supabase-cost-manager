
-- Create subscription log table
CREATE TABLE public.company_subscription_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'تجديد',
  previous_type text,
  new_type text NOT NULL,
  previous_end timestamp with time zone,
  new_end timestamp with time zone,
  duration_days integer,
  duration_months integer,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_subscription_log ENABLE ROW LEVEL SECURITY;

-- Only admins can manage subscription logs
CREATE POLICY "Admin select" ON public.company_subscription_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin insert" ON public.company_subscription_log FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete" ON public.company_subscription_log FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
