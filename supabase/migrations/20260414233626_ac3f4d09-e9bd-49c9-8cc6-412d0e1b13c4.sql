
-- ============================================================
-- 1. Fix permissions self-escalation via prevent_role_change trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_id uuid;
  is_admin boolean := false;
BEGIN
  -- Always prevent role and company_id changes
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    NEW.company_id := OLD.company_id;
  END IF;

  -- Prevent permissions changes unless caller is a company admin or system admin
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    BEGIN
      caller_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      caller_id := NULL;
    END;

    IF caller_id IS NOT NULL AND caller_id != OLD.user_id THEN
      -- Check if caller is company admin or system admin
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = caller_id
          AND (role = 'admin' OR (role IN ('owner') AND company_id = OLD.company_id))
      ) INTO is_admin;

      IF NOT is_admin THEN
        -- Also check is_company_admin
        SELECT public.is_company_admin(caller_id, OLD.company_id) INTO is_admin;
      END IF;
    END IF;

    IF NOT is_admin THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Change all {public} policies to {authenticated} on business tables
-- ============================================================

-- branches
ALTER POLICY "Company delete" ON branches TO authenticated;
ALTER POLICY "Company insert" ON branches TO authenticated;
ALTER POLICY "Company select" ON branches TO authenticated;
ALTER POLICY "Company update" ON branches TO authenticated;

-- categories
ALTER POLICY "Company delete" ON categories TO authenticated;
ALTER POLICY "Company insert" ON categories TO authenticated;
ALTER POLICY "Company select" ON categories TO authenticated;
ALTER POLICY "Company update" ON categories TO authenticated;

-- category_packing_items
ALTER POLICY "Company delete" ON category_packing_items TO authenticated;
ALTER POLICY "Company insert" ON category_packing_items TO authenticated;
ALTER POLICY "Company select" ON category_packing_items TO authenticated;
ALTER POLICY "Company update" ON category_packing_items TO authenticated;

-- departments
ALTER POLICY "Company delete" ON departments TO authenticated;
ALTER POLICY "Company insert" ON departments TO authenticated;
ALTER POLICY "Company select" ON departments TO authenticated;
ALTER POLICY "Company update" ON departments TO authenticated;

-- inventory_categories
ALTER POLICY "Company delete" ON inventory_categories TO authenticated;
ALTER POLICY "Company insert" ON inventory_categories TO authenticated;
ALTER POLICY "Company select" ON inventory_categories TO authenticated;
ALTER POLICY "Company update" ON inventory_categories TO authenticated;

-- job_roles
ALTER POLICY "Company delete" ON job_roles TO authenticated;
ALTER POLICY "Company insert" ON job_roles TO authenticated;
ALTER POLICY "Company select" ON job_roles TO authenticated;
ALTER POLICY "Company update" ON job_roles TO authenticated;

-- menu_costing_periods
ALTER POLICY "Company delete" ON menu_costing_periods TO authenticated;
ALTER POLICY "Company insert" ON menu_costing_periods TO authenticated;
ALTER POLICY "Company select" ON menu_costing_periods TO authenticated;
ALTER POLICY "Company update" ON menu_costing_periods TO authenticated;

-- pos_item_cost_settings
ALTER POLICY "Company delete" ON pos_item_cost_settings TO authenticated;
ALTER POLICY "Company insert" ON pos_item_cost_settings TO authenticated;
ALTER POLICY "Company select" ON pos_item_cost_settings TO authenticated;
ALTER POLICY "Company update" ON pos_item_cost_settings TO authenticated;

-- pos_items
ALTER POLICY "Company delete" ON pos_items TO authenticated;
ALTER POLICY "Company insert" ON pos_items TO authenticated;
ALTER POLICY "Company select" ON pos_items TO authenticated;
ALTER POLICY "Company update" ON pos_items TO authenticated;

-- pos_sales
ALTER POLICY "Company delete" ON pos_sales TO authenticated;
ALTER POLICY "Company insert" ON pos_sales TO authenticated;
ALTER POLICY "Company select" ON pos_sales TO authenticated;
ALTER POLICY "Company update" ON pos_sales TO authenticated;

-- production_records
ALTER POLICY "Company delete" ON production_records TO authenticated;
ALTER POLICY "Company insert" ON production_records TO authenticated;
ALTER POLICY "Company select" ON production_records TO authenticated;
ALTER POLICY "Company update" ON production_records TO authenticated;

-- production_recipes
ALTER POLICY "Company delete" ON production_recipes TO authenticated;
ALTER POLICY "Company insert" ON production_recipes TO authenticated;
ALTER POLICY "Company select" ON production_recipes TO authenticated;
ALTER POLICY "Company update" ON production_recipes TO authenticated;

-- purchase_orders
ALTER POLICY "Company delete" ON purchase_orders TO authenticated;
ALTER POLICY "Company insert" ON purchase_orders TO authenticated;
ALTER POLICY "Company select" ON purchase_orders TO authenticated;
ALTER POLICY "Company update" ON purchase_orders TO authenticated;

-- recipes
ALTER POLICY "Company delete" ON recipes TO authenticated;
ALTER POLICY "Company insert" ON recipes TO authenticated;
ALTER POLICY "Company select" ON recipes TO authenticated;
ALTER POLICY "Company update" ON recipes TO authenticated;

-- stock_items
ALTER POLICY "Company delete" ON stock_items TO authenticated;
ALTER POLICY "Company insert" ON stock_items TO authenticated;
ALTER POLICY "Company select" ON stock_items TO authenticated;
ALTER POLICY "Company update" ON stock_items TO authenticated;

-- stock_item_locations
ALTER POLICY "Company delete" ON stock_item_locations TO authenticated;
ALTER POLICY "Company insert" ON stock_item_locations TO authenticated;
ALTER POLICY "Company select" ON stock_item_locations TO authenticated;
ALTER POLICY "Company update" ON stock_item_locations TO authenticated;

-- stocktakes
ALTER POLICY "Company delete" ON stocktakes TO authenticated;
ALTER POLICY "Company insert" ON stocktakes TO authenticated;
ALTER POLICY "Company select" ON stocktakes TO authenticated;
ALTER POLICY "Company update" ON stocktakes TO authenticated;

-- storage_types
ALTER POLICY "Company delete" ON storage_types TO authenticated;
ALTER POLICY "Company insert" ON storage_types TO authenticated;
ALTER POLICY "Company select" ON storage_types TO authenticated;
ALTER POLICY "Company update" ON storage_types TO authenticated;

-- suppliers
ALTER POLICY "Company delete" ON suppliers TO authenticated;
ALTER POLICY "Company insert" ON suppliers TO authenticated;
ALTER POLICY "Company select" ON suppliers TO authenticated;
ALTER POLICY "Company update" ON suppliers TO authenticated;

-- transfers
ALTER POLICY "Company delete" ON transfers TO authenticated;
ALTER POLICY "Company insert" ON transfers TO authenticated;
ALTER POLICY "Company select" ON transfers TO authenticated;
ALTER POLICY "Company update" ON transfers TO authenticated;

-- cost_adjustments
ALTER POLICY "Company delete" ON cost_adjustments TO authenticated;
ALTER POLICY "Company insert" ON cost_adjustments TO authenticated;
ALTER POLICY "Company select" ON cost_adjustments TO authenticated;
ALTER POLICY "Company update" ON cost_adjustments TO authenticated;

-- waste_records
ALTER POLICY "Company delete" ON waste_records TO authenticated;
ALTER POLICY "Company insert" ON waste_records TO authenticated;
ALTER POLICY "Company select" ON waste_records TO authenticated;
ALTER POLICY "Company update" ON waste_records TO authenticated;

-- warehouses
ALTER POLICY "Company delete" ON warehouses TO authenticated;
ALTER POLICY "Company insert" ON warehouses TO authenticated;
ALTER POLICY "Company select" ON warehouses TO authenticated;
ALTER POLICY "Company update" ON warehouses TO authenticated;

-- ============================================================
-- 3. Child tables (with "Access" policies) - change to authenticated
-- ============================================================

-- pos_sale_items
ALTER POLICY "Access delete" ON pos_sale_items TO authenticated;
ALTER POLICY "Access insert" ON pos_sale_items TO authenticated;
ALTER POLICY "Access select" ON pos_sale_items TO authenticated;
ALTER POLICY "Access update" ON pos_sale_items TO authenticated;

-- purchase_items
ALTER POLICY "Access delete" ON purchase_items TO authenticated;
ALTER POLICY "Access insert" ON purchase_items TO authenticated;
ALTER POLICY "Access select" ON purchase_items TO authenticated;
ALTER POLICY "Access update" ON purchase_items TO authenticated;

-- production_ingredients
ALTER POLICY "Access delete" ON production_ingredients TO authenticated;
ALTER POLICY "Access insert" ON production_ingredients TO authenticated;
ALTER POLICY "Access select" ON production_ingredients TO authenticated;
ALTER POLICY "Access update" ON production_ingredients TO authenticated;

-- production_recipe_ingredients
ALTER POLICY "Access delete" ON production_recipe_ingredients TO authenticated;
ALTER POLICY "Access insert" ON production_recipe_ingredients TO authenticated;
ALTER POLICY "Access select" ON production_recipe_ingredients TO authenticated;
ALTER POLICY "Access update" ON production_recipe_ingredients TO authenticated;

-- production_edit_history
ALTER POLICY "Access delete" ON production_edit_history TO authenticated;
ALTER POLICY "Access insert" ON production_edit_history TO authenticated;
ALTER POLICY "Access select" ON production_edit_history TO authenticated;

-- recipe_ingredients
ALTER POLICY "Access delete" ON recipe_ingredients TO authenticated;
ALTER POLICY "Access insert" ON recipe_ingredients TO authenticated;
ALTER POLICY "Access select" ON recipe_ingredients TO authenticated;
ALTER POLICY "Access update" ON recipe_ingredients TO authenticated;

-- stocktake_items
ALTER POLICY "Access delete" ON stocktake_items TO authenticated;
ALTER POLICY "Access insert" ON stocktake_items TO authenticated;
ALTER POLICY "Access select" ON stocktake_items TO authenticated;
ALTER POLICY "Access update" ON stocktake_items TO authenticated;

-- stocktake_edit_history
ALTER POLICY "Access delete" ON stocktake_edit_history TO authenticated;
ALTER POLICY "Access insert" ON stocktake_edit_history TO authenticated;
ALTER POLICY "Access select" ON stocktake_edit_history TO authenticated;

-- cost_adjustment_items
ALTER POLICY "Access delete" ON cost_adjustment_items TO authenticated;
ALTER POLICY "Access insert" ON cost_adjustment_items TO authenticated;
ALTER POLICY "Access select" ON cost_adjustment_items TO authenticated;
ALTER POLICY "Access update" ON cost_adjustment_items TO authenticated;

-- transfer_items
ALTER POLICY "Access delete" ON transfer_items TO authenticated;
ALTER POLICY "Access insert" ON transfer_items TO authenticated;
ALTER POLICY "Access select" ON transfer_items TO authenticated;
ALTER POLICY "Access update" ON transfer_items TO authenticated;

-- waste_items
ALTER POLICY "Access delete" ON waste_items TO authenticated;
ALTER POLICY "Access insert" ON waste_items TO authenticated;
ALTER POLICY "Access select" ON waste_items TO authenticated;
ALTER POLICY "Access update" ON waste_items TO authenticated;

-- waste_edit_history
ALTER POLICY "Access delete" ON waste_edit_history TO authenticated;
ALTER POLICY "Access insert" ON waste_edit_history TO authenticated;
ALTER POLICY "Access select" ON waste_edit_history TO authenticated;

-- warehouse_branches
ALTER POLICY "Company delete" ON warehouse_branches TO authenticated;
ALTER POLICY "Company insert" ON warehouse_branches TO authenticated;
ALTER POLICY "Company select" ON warehouse_branches TO authenticated;

-- ============================================================
-- 4. profiles - change INSERT, UPDATE, DELETE from public to authenticated
-- ============================================================
ALTER POLICY "Users can insert own profile" ON profiles TO authenticated;
ALTER POLICY "Users can update own or company profile" ON profiles TO authenticated;
ALTER POLICY "Admins can delete company profiles" ON profiles TO authenticated;

-- ============================================================
-- 5. user_roles - change SELECT from public to authenticated
-- ============================================================
ALTER POLICY "Users can view company roles" ON user_roles TO authenticated;
ALTER POLICY "No direct delete" ON user_roles TO authenticated;
ALTER POLICY "No direct insert" ON user_roles TO authenticated;
ALTER POLICY "No direct update" ON user_roles TO authenticated;

-- ============================================================
-- 6. otp_codes - keep as public (all are false anyway, managed by edge functions)
-- ============================================================

-- ============================================================
-- 7. companies INSERT - restrict to authenticated only
-- ============================================================
DROP POLICY "Anyone can create a company" ON companies;
CREATE POLICY "Authenticated users can create a company"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 8. Add missing UPDATE policy on waste_edit_history
-- ============================================================
CREATE POLICY "Access update" ON waste_edit_history
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM waste_records wr
    WHERE wr.id = waste_edit_history.waste_record_id
      AND wr.company_id = get_user_company_id()
  ));
