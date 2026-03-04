
-- Fix companies policies: drop restrictive, create permissive
DROP POLICY IF EXISTS "Anyone can create a company" ON public.companies;
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;

CREATE POLICY "Anyone can create a company" ON public.companies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users can view own company" ON public.companies FOR SELECT TO authenticated USING (id = get_user_company_id());

-- Fix profiles policies: drop restrictive, create permissive
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view company profiles" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view company profiles" ON public.profiles FOR SELECT TO authenticated USING (company_id = get_user_company_id());

-- Fix all other tables too
DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['branches','categories','departments','pos_items','pos_sales','pos_sale_items','stock_items','stocktakes','stocktake_items','suppliers','purchase_orders','purchase_items','recipes','recipe_ingredients','production_records','production_ingredients','transfers','transfer_items','warehouses','waste_records','waste_items','cost_adjustments','cost_adjustment_items']) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = tbl AND schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

-- Recreate permissive policies for company-scoped tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['branches','categories','departments','pos_items','stock_items','stocktakes','suppliers','purchase_orders','recipes','production_records','transfers','warehouses','waste_records','cost_adjustments']) LOOP
    EXECUTE format('CREATE POLICY "Company select" ON public.%I FOR SELECT TO authenticated USING (company_id = get_user_company_id())', tbl);
    EXECUTE format('CREATE POLICY "Company insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id())', tbl);
    EXECUTE format('CREATE POLICY "Company update" ON public.%I FOR UPDATE TO authenticated USING (company_id = get_user_company_id())', tbl);
    EXECUTE format('CREATE POLICY "Company delete" ON public.%I FOR DELETE TO authenticated USING (company_id = get_user_company_id())', tbl);
  END LOOP;
END $$;

-- pos_sales (no update/delete)
CREATE POLICY "Company select" ON public.pos_sales FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_sales FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());

-- Child tables with parent joins
CREATE POLICY "Access select" ON public.pos_sale_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.pos_sale_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.purchase_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.purchase_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.purchase_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.purchase_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.recipe_ingredients FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.recipe_ingredients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.recipe_ingredients FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.recipe_ingredients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.production_ingredients FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.production_ingredients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.production_ingredients FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.production_ingredients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.transfer_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.transfer_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.transfer_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.transfer_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.stocktake_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.stocktake_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.stocktake_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.stocktake_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.waste_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.waste_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.waste_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.waste_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));

CREATE POLICY "Access select" ON public.cost_adjustment_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.cost_adjustment_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.cost_adjustment_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.cost_adjustment_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
