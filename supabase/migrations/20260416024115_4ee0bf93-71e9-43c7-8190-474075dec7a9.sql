
-- Shift expenses table
CREATE TABLE public.pos_shift_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.pos_shifts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_shift_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.pos_shift_expenses FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_shift_expenses FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_shift_expenses FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_shift_expenses FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Returns table
CREATE TABLE public.pos_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  return_number text,
  date timestamptz NOT NULL DEFAULT now(),
  total_amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.pos_returns FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_returns FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_returns FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_returns FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Return items table
CREATE TABLE public.pos_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.pos_returns(id) ON DELETE CASCADE,
  pos_item_id uuid REFERENCES public.pos_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.pos_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access select" ON public.pos_return_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM pos_returns r WHERE r.id = pos_return_items.return_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.pos_return_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM pos_returns r WHERE r.id = pos_return_items.return_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.pos_return_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM pos_returns r WHERE r.id = pos_return_items.return_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.pos_return_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM pos_returns r WHERE r.id = pos_return_items.return_id AND r.company_id = get_user_company_id()));

-- Return number generator
CREATE OR REPLACE FUNCTION public.generate_return_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
  current_year text;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  SELECT COALESCE(MAX(
    CASE WHEN return_number ~ ('^RET_' || current_year || '_[0-9]+$')
    THEN CAST(SUBSTRING(return_number FROM LENGTH('RET_' || current_year || '_') + 1) AS integer)
    ELSE 0 END
  ), 0) + 1 INTO next_num
  FROM pos_returns WHERE company_id = p_company_id;
  RETURN 'RET_' || current_year || '_' || LPAD(next_num::text, 4, '0');
END;
$$;

-- Enable realtime for pos_returns
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_returns;
