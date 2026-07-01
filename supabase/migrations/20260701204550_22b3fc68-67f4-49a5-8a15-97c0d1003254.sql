
-- 1) Overhead pools (extensible: warehouse/production/distribution)
CREATE TABLE public.warehouse_overhead_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  pool_type text NOT NULL DEFAULT 'warehouse' CHECK (pool_type IN ('warehouse','production','distribution')),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, pool_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_overhead_pools TO authenticated;
GRANT ALL ON public.warehouse_overhead_pools TO service_role;
ALTER TABLE public.warehouse_overhead_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_all_wop" ON public.warehouse_overhead_pools FOR ALL TO authenticated
  USING (company_id = get_user_company_id() OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (company_id = get_user_company_id() OR has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_wop_updated_at BEFORE UPDATE ON public.warehouse_overhead_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Monthly overhead rates history (per warehouse & optional pool)
CREATE TABLE public.warehouse_overhead_monthly_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  pool_id uuid NULL,
  month text NOT NULL, -- format YYYY-MM
  expenses_total numeric NOT NULL DEFAULT 0,
  transfers_total numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0, -- percentage (e.g. 4.00 => 4%)
  status text NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated','actual','approved')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, pool_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_overhead_monthly_rates TO authenticated;
GRANT ALL ON public.warehouse_overhead_monthly_rates TO service_role;
ALTER TABLE public.warehouse_overhead_monthly_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_all_womr" ON public.warehouse_overhead_monthly_rates FOR ALL TO authenticated
  USING (company_id = get_user_company_id() OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (company_id = get_user_company_id() OR has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_womr_updated_at BEFORE UPDATE ON public.warehouse_overhead_monthly_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Estimated rate per warehouse (default before first actual month)
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS estimated_overhead_rate numeric NOT NULL DEFAULT 0;

-- 4) Link expenses to pool (nullable, uses default warehouse pool if null)
ALTER TABLE public.warehouse_overhead_expenses
  ADD COLUMN IF NOT EXISTS pool_id uuid NULL;

-- 5) Snapshot overhead rate on transfer at issuance time
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS overhead_rate_applied numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_amount numeric NOT NULL DEFAULT 0;

-- 6) Drop legacy allocation_method from branch policies (no longer used)
ALTER TABLE public.branch_supply_policies DROP COLUMN IF EXISTS allocation_method;
