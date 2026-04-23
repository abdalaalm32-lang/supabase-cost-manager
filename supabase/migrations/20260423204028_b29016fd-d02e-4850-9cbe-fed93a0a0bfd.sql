-- 1) Create branch-specific costs table
CREATE TABLE IF NOT EXISTS public.stock_item_branch_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  avg_cost numeric NOT NULL DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_item_branch_costs_unique UNIQUE (stock_item_id, branch_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_sibc_company ON public.stock_item_branch_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_sibc_branch ON public.stock_item_branch_costs(branch_id);
CREATE INDEX IF NOT EXISTS idx_sibc_stock_item ON public.stock_item_branch_costs(stock_item_id);

-- 2) Enable RLS
ALTER TABLE public.stock_item_branch_costs ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies (same model as other inventory tables)
CREATE POLICY "Company select"
ON public.stock_item_branch_costs
FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "Company insert"
ON public.stock_item_branch_costs
FOR INSERT
TO authenticated
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Company update"
ON public.stock_item_branch_costs
FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "Company delete"
ON public.stock_item_branch_costs
FOR DELETE
TO authenticated
USING (company_id = get_user_company_id());

-- 4) Auto-update updated_at trigger
CREATE TRIGGER update_sibc_updated_at
BEFORE UPDATE ON public.stock_item_branch_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Seed: copy current global avg_cost as baseline for every branch in each company
INSERT INTO public.stock_item_branch_costs (company_id, stock_item_id, branch_id, avg_cost, current_stock)
SELECT
  si.company_id,
  si.id AS stock_item_id,
  b.id AS branch_id,
  COALESCE(si.avg_cost, 0) AS avg_cost,
  0 AS current_stock
FROM public.stock_items si
JOIN public.branches b ON b.company_id = si.company_id
WHERE si.active = true
  AND b.active = true
ON CONFLICT (stock_item_id, branch_id) DO NOTHING;