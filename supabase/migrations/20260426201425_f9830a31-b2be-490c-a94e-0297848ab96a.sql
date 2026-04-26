-- Create junction table for stock items <-> inventory categories (many-to-many)
CREATE TABLE IF NOT EXISTS public.stock_item_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID NOT NULL,
  category_id UUID NOT NULL,
  company_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (stock_item_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_sic_stock_item ON public.stock_item_categories(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_sic_category ON public.stock_item_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_sic_company ON public.stock_item_categories(company_id);

ALTER TABLE public.stock_item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company select" ON public.stock_item_categories
  FOR SELECT TO authenticated USING (company_id = get_user_company_id());

CREATE POLICY "Company insert" ON public.stock_item_categories
  FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Company update" ON public.stock_item_categories
  FOR UPDATE TO authenticated USING (company_id = get_user_company_id());

CREATE POLICY "Company delete" ON public.stock_item_categories
  FOR DELETE TO authenticated USING (company_id = get_user_company_id());