
-- Add order_type and payment_method columns to pos_sales
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'صالة';
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'كاش';
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS notes text;

-- Create shifts table for shift management
CREATE TABLE public.pos_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  opened_by text,
  closed_by text,
  opening_cash numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'مفتوح',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.pos_shifts FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_shifts FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_shifts FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_shifts FOR DELETE TO authenticated USING (company_id = get_user_company_id());
