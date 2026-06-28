
-- 1) Branch supply policies
CREATE TABLE public.branch_supply_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL UNIQUE,
  profit_percentage numeric NOT NULL DEFAULT 0,
  transportation_cost numeric NOT NULL DEFAULT 0,
  loading_cost numeric NOT NULL DEFAULT 0,
  minimum_order_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_supply_policies TO authenticated;
GRANT ALL ON public.branch_supply_policies TO service_role;
ALTER TABLE public.branch_supply_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_all_bsp" ON public.branch_supply_policies
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_bsp_updated_at BEFORE UPDATE ON public.branch_supply_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Stock item supply pricing
CREATE TABLE public.stock_item_supply_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  stock_item_id uuid NOT NULL UNIQUE,
  supply_type text NOT NULL DEFAULT 'cost_plus_profit',
  manufacturing_cost numeric NOT NULL DEFAULT 0,
  packaging_cost numeric NOT NULL DEFAULT 0,
  auto_calculate boolean NOT NULL DEFAULT true,
  manual_base_price numeric,
  last_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_supply_pricing TO authenticated;
GRANT ALL ON public.stock_item_supply_pricing TO service_role;
ALTER TABLE public.stock_item_supply_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_all_sisp" ON public.stock_item_supply_pricing
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sisp_updated_at BEFORE UPDATE ON public.stock_item_supply_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Transfer pricing breakdown
CREATE TABLE public.transfer_pricing_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transfer_item_id uuid NOT NULL UNIQUE,
  base_cost numeric NOT NULL DEFAULT 0,
  manufacturing_cost numeric NOT NULL DEFAULT 0,
  packaging_cost numeric NOT NULL DEFAULT 0,
  transport_cost numeric NOT NULL DEFAULT 0,
  loading_cost numeric NOT NULL DEFAULT 0,
  profit_amount numeric NOT NULL DEFAULT 0,
  final_unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_pricing_breakdown TO authenticated;
GRANT ALL ON public.transfer_pricing_breakdown TO service_role;
ALTER TABLE public.transfer_pricing_breakdown ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_all_tpb" ON public.transfer_pricing_breakdown
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));
