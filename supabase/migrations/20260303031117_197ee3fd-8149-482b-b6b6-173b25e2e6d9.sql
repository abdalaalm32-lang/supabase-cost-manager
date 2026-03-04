
-- Menu costing periods table (stores indirect expenses per period)
CREATE TABLE public.menu_costing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  expected_sales numeric NOT NULL DEFAULT 0,
  capacity integer NOT NULL DEFAULT 0,
  turn_over numeric NOT NULL DEFAULT 0,
  avg_check numeric NOT NULL DEFAULT 0,
  -- Indirect expense categories
  media numeric NOT NULL DEFAULT 0,
  bills numeric NOT NULL DEFAULT 0,
  salaries numeric NOT NULL DEFAULT 0,
  other_expenses numeric NOT NULL DEFAULT 0,
  maintenance numeric NOT NULL DEFAULT 0,
  rent numeric NOT NULL DEFAULT 0,
  -- Default percentages
  default_consumables_pct numeric NOT NULL DEFAULT 1,
  default_packing_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'نشط',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_costing_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.menu_costing_periods FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.menu_costing_periods FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.menu_costing_periods FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.menu_costing_periods FOR DELETE USING (company_id = get_user_company_id());

-- Per-item cost overrides (side cost, consumables, packing for each POS item)
CREATE TABLE public.pos_item_cost_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  pos_item_id uuid NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
  side_cost numeric NOT NULL DEFAULT 0,
  consumables_pct numeric,
  packing_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, pos_item_id)
);

ALTER TABLE public.pos_item_cost_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.pos_item_cost_settings FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_item_cost_settings FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_item_cost_settings FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_item_cost_settings FOR DELETE USING (company_id = get_user_company_id());
