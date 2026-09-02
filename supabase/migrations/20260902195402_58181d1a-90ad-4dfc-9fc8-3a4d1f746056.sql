CREATE TABLE public.stock_item_branch_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  manual_base_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_item_id, branch_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_branch_prices TO authenticated;
GRANT ALL ON public.stock_item_branch_prices TO service_role;

ALTER TABLE public.stock_item_branch_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage branch prices"
ON public.stock_item_branch_prices
FOR ALL
TO authenticated
USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sibp_updated_at
BEFORE UPDATE ON public.stock_item_branch_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();