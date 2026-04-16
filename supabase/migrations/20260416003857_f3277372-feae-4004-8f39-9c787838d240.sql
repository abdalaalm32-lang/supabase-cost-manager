-- Add delivery_fee and driver_id to pos_sales
ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_id uuid NULL;

-- Add phone2 to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone2 text NULL;

-- Create delivery_drivers table
CREATE TABLE public.delivery_drivers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

-- RLS policies for delivery_drivers
CREATE POLICY "Company select" ON public.delivery_drivers FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Company insert" ON public.delivery_drivers FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Company update" ON public.delivery_drivers FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Company delete" ON public.delivery_drivers FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Add FK from pos_sales.driver_id to delivery_drivers
ALTER TABLE public.pos_sales
  ADD CONSTRAINT pos_sales_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.delivery_drivers(id);