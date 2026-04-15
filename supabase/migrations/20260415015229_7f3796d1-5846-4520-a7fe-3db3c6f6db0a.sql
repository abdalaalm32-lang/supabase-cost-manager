
-- Create customer feedback table for complaints and suggestions
CREATE TABLE public.customer_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  type TEXT NOT NULL DEFAULT 'شكوى',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'جديد',
  reply TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.customer_feedback FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.customer_feedback FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.customer_feedback FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.customer_feedback FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Add customer rating to pos_sales
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS customer_rating INTEGER;
