-- 1) Warehouse overhead expenses
CREATE TABLE IF NOT EXISTS public.warehouse_overhead_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  expense_name text NOT NULL,
  monthly_amount numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_overhead_expenses TO authenticated;
GRANT ALL ON public.warehouse_overhead_expenses TO service_role;

ALTER TABLE public.warehouse_overhead_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage overhead expenses"
ON public.warehouse_overhead_expenses
FOR ALL
TO authenticated
USING (company_id = public.get_user_company_id())
WITH CHECK (company_id = public.get_user_company_id());

CREATE TRIGGER trg_overhead_updated
BEFORE UPDATE ON public.warehouse_overhead_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Warehouse-level allocation method for overhead
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS overhead_allocation_method text NOT NULL DEFAULT 'value';

-- 3) Stock item supply pricing additions
ALTER TABLE public.stock_item_supply_pricing
  ADD COLUMN IF NOT EXISTS is_available_for_transfer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_overhead_share numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_weight numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_volume numeric NOT NULL DEFAULT 0;

-- 4) Branch supply policy: allocation method for transport/loading
ALTER TABLE public.branch_supply_policies
  ADD COLUMN IF NOT EXISTS allocation_method text NOT NULL DEFAULT 'value';