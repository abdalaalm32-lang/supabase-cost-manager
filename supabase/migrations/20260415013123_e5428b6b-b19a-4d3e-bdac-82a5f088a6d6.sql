
-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique phone per company
CREATE UNIQUE INDEX idx_customers_phone_company ON public.customers(company_id, phone);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.customers FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.customers FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.customers FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Add delivery tracking and customer info columns to pos_sales
ALTER TABLE public.pos_sales
  ADD COLUMN delivery_status TEXT DEFAULT NULL,
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) DEFAULT NULL,
  ADD COLUMN customer_name TEXT DEFAULT NULL,
  ADD COLUMN customer_phone TEXT DEFAULT NULL,
  ADD COLUMN customer_address TEXT DEFAULT NULL;
