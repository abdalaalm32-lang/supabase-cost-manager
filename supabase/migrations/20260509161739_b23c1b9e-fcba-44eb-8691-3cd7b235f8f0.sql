
-- Offers pricing tables
CREATE TABLE public.menu_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  code text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'مسودة',
  sale_price numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  order_type text NOT NULL DEFAULT 'صالة',
  packing_cost numeric NOT NULL DEFAULT 0,
  consumables_pct numeric NOT NULL DEFAULT 0,
  side_cost numeric NOT NULL DEFAULT 0,
  indirect_expenses_pct numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company select" ON public.menu_offers FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.menu_offers FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.menu_offers FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.menu_offers FOR DELETE TO authenticated USING (company_id = get_user_company_id());

CREATE TRIGGER trg_menu_offers_updated_at BEFORE UPDATE ON public.menu_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.menu_offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.menu_offers(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_pos_item_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_offer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access select" ON public.menu_offer_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offers o WHERE o.id = menu_offer_items.offer_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.menu_offer_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.menu_offers o WHERE o.id = menu_offer_items.offer_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.menu_offer_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offers o WHERE o.id = menu_offer_items.offer_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.menu_offer_items FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offers o WHERE o.id = menu_offer_items.offer_id AND o.company_id = get_user_company_id()));

CREATE TABLE public.menu_offer_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_item_id uuid NOT NULL REFERENCES public.menu_offer_items(id) ON DELETE CASCADE,
  stock_item_id uuid,
  name text NOT NULL,
  unit text,
  qty numeric NOT NULL DEFAULT 0,
  conversion_factor numeric NOT NULL DEFAULT 1,
  avg_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_offer_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access select" ON public.menu_offer_ingredients FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offer_items i JOIN public.menu_offers o ON o.id = i.offer_id WHERE i.id = menu_offer_ingredients.offer_item_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.menu_offer_ingredients FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.menu_offer_items i JOIN public.menu_offers o ON o.id = i.offer_id WHERE i.id = menu_offer_ingredients.offer_item_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.menu_offer_ingredients FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offer_items i JOIN public.menu_offers o ON o.id = i.offer_id WHERE i.id = menu_offer_ingredients.offer_item_id AND o.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.menu_offer_ingredients FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.menu_offer_items i JOIN public.menu_offers o ON o.id = i.offer_id WHERE i.id = menu_offer_ingredients.offer_item_id AND o.company_id = get_user_company_id()));

CREATE OR REPLACE FUNCTION public.generate_offer_code(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(CASE WHEN code ~ '^OFR_[0-9]+$' THEN CAST(SUBSTRING(code FROM 5) AS integer) ELSE 0 END), 0) + 1
  INTO next_num FROM menu_offers WHERE company_id = p_company_id;
  RETURN 'OFR_' || LPAD(next_num::text, 4, '0');
END;
$$;
