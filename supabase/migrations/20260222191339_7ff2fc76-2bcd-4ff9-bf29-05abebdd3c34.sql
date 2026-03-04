
-- Fix ALL policies to be PERMISSIVE (they were created as RESTRICTIVE which blocks everything)

-- companies
DROP POLICY IF EXISTS "Anyone can create a company" ON public.companies;
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Anyone can create a company" ON public.companies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users can view own company" ON public.companies FOR SELECT TO authenticated USING (id = get_user_company_id());

-- profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view company profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view company profiles" ON public.profiles FOR SELECT TO authenticated USING (company_id = get_user_company_id());

-- branches
DROP POLICY IF EXISTS "Company select" ON public.branches;
DROP POLICY IF EXISTS "Company insert" ON public.branches;
DROP POLICY IF EXISTS "Company update" ON public.branches;
DROP POLICY IF EXISTS "Company delete" ON public.branches;
CREATE POLICY "Company select" ON public.branches FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.branches FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.branches FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.branches FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- categories
DROP POLICY IF EXISTS "Company select" ON public.categories;
DROP POLICY IF EXISTS "Company insert" ON public.categories;
DROP POLICY IF EXISTS "Company update" ON public.categories;
DROP POLICY IF EXISTS "Company delete" ON public.categories;
CREATE POLICY "Company select" ON public.categories FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.categories FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.categories FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- departments
DROP POLICY IF EXISTS "Company select" ON public.departments;
DROP POLICY IF EXISTS "Company insert" ON public.departments;
DROP POLICY IF EXISTS "Company update" ON public.departments;
DROP POLICY IF EXISTS "Company delete" ON public.departments;
CREATE POLICY "Company select" ON public.departments FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.departments FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.departments FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.departments FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- stock_items
DROP POLICY IF EXISTS "Company select" ON public.stock_items;
DROP POLICY IF EXISTS "Company insert" ON public.stock_items;
DROP POLICY IF EXISTS "Company update" ON public.stock_items;
DROP POLICY IF EXISTS "Company delete" ON public.stock_items;
CREATE POLICY "Company select" ON public.stock_items FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.stock_items FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.stock_items FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.stock_items FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- suppliers
DROP POLICY IF EXISTS "Company select" ON public.suppliers;
DROP POLICY IF EXISTS "Company insert" ON public.suppliers;
DROP POLICY IF EXISTS "Company update" ON public.suppliers;
DROP POLICY IF EXISTS "Company delete" ON public.suppliers;
CREATE POLICY "Company select" ON public.suppliers FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.suppliers FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.suppliers FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- warehouses
DROP POLICY IF EXISTS "Company select" ON public.warehouses;
DROP POLICY IF EXISTS "Company insert" ON public.warehouses;
DROP POLICY IF EXISTS "Company update" ON public.warehouses;
DROP POLICY IF EXISTS "Company delete" ON public.warehouses;
CREATE POLICY "Company select" ON public.warehouses FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.warehouses FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.warehouses FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- pos_items
DROP POLICY IF EXISTS "Company select" ON public.pos_items;
DROP POLICY IF EXISTS "Company insert" ON public.pos_items;
DROP POLICY IF EXISTS "Company update" ON public.pos_items;
DROP POLICY IF EXISTS "Company delete" ON public.pos_items;
CREATE POLICY "Company select" ON public.pos_items FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_items FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.pos_items FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_items FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- pos_sales
DROP POLICY IF EXISTS "Company select" ON public.pos_sales;
DROP POLICY IF EXISTS "Company insert" ON public.pos_sales;
CREATE POLICY "Company select" ON public.pos_sales FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_sales FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());

-- purchase_orders
DROP POLICY IF EXISTS "Company select" ON public.purchase_orders;
DROP POLICY IF EXISTS "Company insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "Company update" ON public.purchase_orders;
DROP POLICY IF EXISTS "Company delete" ON public.purchase_orders;
CREATE POLICY "Company select" ON public.purchase_orders FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.purchase_orders FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.purchase_orders FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- production_records
DROP POLICY IF EXISTS "Company select" ON public.production_records;
DROP POLICY IF EXISTS "Company insert" ON public.production_records;
DROP POLICY IF EXISTS "Company update" ON public.production_records;
DROP POLICY IF EXISTS "Company delete" ON public.production_records;
CREATE POLICY "Company select" ON public.production_records FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.production_records FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.production_records FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.production_records FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- recipes
DROP POLICY IF EXISTS "Company select" ON public.recipes;
DROP POLICY IF EXISTS "Company insert" ON public.recipes;
DROP POLICY IF EXISTS "Company update" ON public.recipes;
DROP POLICY IF EXISTS "Company delete" ON public.recipes;
CREATE POLICY "Company select" ON public.recipes FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.recipes FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.recipes FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.recipes FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- transfers
DROP POLICY IF EXISTS "Company select" ON public.transfers;
DROP POLICY IF EXISTS "Company insert" ON public.transfers;
DROP POLICY IF EXISTS "Company update" ON public.transfers;
DROP POLICY IF EXISTS "Company delete" ON public.transfers;
CREATE POLICY "Company select" ON public.transfers FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.transfers FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.transfers FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.transfers FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- stocktakes
DROP POLICY IF EXISTS "Company select" ON public.stocktakes;
DROP POLICY IF EXISTS "Company insert" ON public.stocktakes;
DROP POLICY IF EXISTS "Company update" ON public.stocktakes;
DROP POLICY IF EXISTS "Company delete" ON public.stocktakes;
CREATE POLICY "Company select" ON public.stocktakes FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.stocktakes FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.stocktakes FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.stocktakes FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- cost_adjustments
DROP POLICY IF EXISTS "Company select" ON public.cost_adjustments;
DROP POLICY IF EXISTS "Company insert" ON public.cost_adjustments;
DROP POLICY IF EXISTS "Company update" ON public.cost_adjustments;
DROP POLICY IF EXISTS "Company delete" ON public.cost_adjustments;
CREATE POLICY "Company select" ON public.cost_adjustments FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.cost_adjustments FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.cost_adjustments FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.cost_adjustments FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- waste_records
DROP POLICY IF EXISTS "Company select" ON public.waste_records;
DROP POLICY IF EXISTS "Company insert" ON public.waste_records;
DROP POLICY IF EXISTS "Company update" ON public.waste_records;
DROP POLICY IF EXISTS "Company delete" ON public.waste_records;
CREATE POLICY "Company select" ON public.waste_records FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.waste_records FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.waste_records FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.waste_records FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Child tables (join-based)
DROP POLICY IF EXISTS "Access select" ON public.pos_sale_items;
DROP POLICY IF EXISTS "Access insert" ON public.pos_sale_items;
CREATE POLICY "Access select" ON public.pos_sale_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.pos_sale_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM pos_sales s WHERE s.id = pos_sale_items.sale_id AND s.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.purchase_items;
DROP POLICY IF EXISTS "Access insert" ON public.purchase_items;
DROP POLICY IF EXISTS "Access update" ON public.purchase_items;
DROP POLICY IF EXISTS "Access delete" ON public.purchase_items;
CREATE POLICY "Access select" ON public.purchase_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.purchase_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.purchase_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.purchase_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_items.purchase_order_id AND po.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Access insert" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Access update" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Access delete" ON public.recipe_ingredients;
CREATE POLICY "Access select" ON public.recipe_ingredients FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.recipe_ingredients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.recipe_ingredients FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.recipe_ingredients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.production_ingredients;
DROP POLICY IF EXISTS "Access insert" ON public.production_ingredients;
DROP POLICY IF EXISTS "Access update" ON public.production_ingredients;
DROP POLICY IF EXISTS "Access delete" ON public.production_ingredients;
CREATE POLICY "Access select" ON public.production_ingredients FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.production_ingredients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.production_ingredients FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.production_ingredients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM production_records pr WHERE pr.id = production_ingredients.production_record_id AND pr.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.transfer_items;
DROP POLICY IF EXISTS "Access insert" ON public.transfer_items;
DROP POLICY IF EXISTS "Access update" ON public.transfer_items;
DROP POLICY IF EXISTS "Access delete" ON public.transfer_items;
CREATE POLICY "Access select" ON public.transfer_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.transfer_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.transfer_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.transfer_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id AND t.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.stocktake_items;
DROP POLICY IF EXISTS "Access insert" ON public.stocktake_items;
DROP POLICY IF EXISTS "Access update" ON public.stocktake_items;
DROP POLICY IF EXISTS "Access delete" ON public.stocktake_items;
CREATE POLICY "Access select" ON public.stocktake_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.stocktake_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.stocktake_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.stocktake_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_items.stocktake_id AND st.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.cost_adjustment_items;
DROP POLICY IF EXISTS "Access insert" ON public.cost_adjustment_items;
DROP POLICY IF EXISTS "Access update" ON public.cost_adjustment_items;
DROP POLICY IF EXISTS "Access delete" ON public.cost_adjustment_items;
CREATE POLICY "Access select" ON public.cost_adjustment_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.cost_adjustment_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.cost_adjustment_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.cost_adjustment_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM cost_adjustments ca WHERE ca.id = cost_adjustment_items.cost_adjustment_id AND ca.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Access select" ON public.waste_items;
DROP POLICY IF EXISTS "Access insert" ON public.waste_items;
DROP POLICY IF EXISTS "Access update" ON public.waste_items;
DROP POLICY IF EXISTS "Access delete" ON public.waste_items;
CREATE POLICY "Access select" ON public.waste_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.waste_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.waste_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.waste_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM waste_records wr WHERE wr.id = waste_items.waste_record_id AND wr.company_id = get_user_company_id()));

-- Update handle_new_user to set role as 'مدير نظام' for admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_id, full_name, email, role, permissions)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'company_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    CASE 
      WHEN NEW.email = 'abdalaalm32@gmail.com' THEN 'مدير نظام'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'مستخدم')
    END,
    CASE
      WHEN NEW.email = 'abdalaalm32@gmail.com' THEN ARRAY['dashboard', 'pos', 'inventory', 'transfers', 'stocktake', 'recipes', 'production', 'waste', 'purchases', 'cost-adjustment', 'costing', 'menu-costing', 'menu-engineering', 'reports', 'settings']
      ELSE ARRAY['dashboard']
    END
  );
  RETURN NEW;
END;
$$;
