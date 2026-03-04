
-- Junction table to link stock items to branches and warehouses
CREATE TABLE public.stock_item_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_one_location CHECK (
    (branch_id IS NOT NULL AND warehouse_id IS NULL) OR
    (branch_id IS NULL AND warehouse_id IS NOT NULL)
  )
);

ALTER TABLE public.stock_item_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.stock_item_locations FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.stock_item_locations FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.stock_item_locations FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.stock_item_locations FOR DELETE USING (company_id = get_user_company_id());

CREATE INDEX idx_stock_item_locations_item ON public.stock_item_locations(stock_item_id);
CREATE INDEX idx_stock_item_locations_branch ON public.stock_item_locations(branch_id);
CREATE INDEX idx_stock_item_locations_warehouse ON public.stock_item_locations(warehouse_id);
