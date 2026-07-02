
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'نقدي',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_payment_type_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_payment_type_check
  CHECK (payment_type IN ('نقدي','آجل'));

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date date;

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'نقدي',
  notes text,
  creator_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company select" ON public.supplier_payments;
DROP POLICY IF EXISTS "Company insert" ON public.supplier_payments;
DROP POLICY IF EXISTS "Company update" ON public.supplier_payments;
DROP POLICY IF EXISTS "Company delete" ON public.supplier_payments;

CREATE POLICY "Company select" ON public.supplier_payments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.supplier_payments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.supplier_payments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.supplier_payments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_payments_company_idx ON public.supplier_payments(company_id);
CREATE INDEX IF NOT EXISTS supplier_payments_date_idx ON public.supplier_payments(payment_date);

DROP TRIGGER IF EXISTS update_supplier_payments_updated_at ON public.supplier_payments;
CREATE TRIGGER update_supplier_payments_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
