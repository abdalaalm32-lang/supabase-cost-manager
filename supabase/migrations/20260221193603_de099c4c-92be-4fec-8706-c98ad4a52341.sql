
-- =============================================
-- 3M GSC - Global System Cost Database Schema
-- =============================================

-- 1. Companies (Tenants)
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Profiles (Users linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'مستخدم',
  permissions TEXT[] NOT NULL DEFAULT ARRAY['dashboard'],
  status TEXT NOT NULL DEFAULT 'نشط' CHECK (status IN ('نشط', 'موقف')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Branches
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 4. Warehouses
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- 5. Departments
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  manager TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 6. Material Categories
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  storage_type TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 7. Stock Items (Materials)
CREATE TABLE public.stock_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  stock_unit TEXT NOT NULL DEFAULT 'كجم',
  recipe_unit TEXT,
  conversion_factor NUMERIC DEFAULT 1,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  avg_cost NUMERIC NOT NULL DEFAULT 0,
  standard_cost NUMERIC NOT NULL DEFAULT 0,
  min_level NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- 8. Suppliers
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tax_id TEXT,
  address TEXT,
  payment_terms TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 9. Purchase Orders
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'مسودة' CHECK (status IN ('مسودة', 'مكتمل')),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  notes TEXT,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- 10. Purchase Order Items
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- 11. POS Items (Menu Items)
CREATE TABLE public.pos_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_items ENABLE ROW LEVEL SECURITY;

-- 12. POS Sales
CREATE TABLE public.pos_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'مكتمل',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;

-- 13. POS Sale Items
CREATE TABLE public.pos_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.pos_sales(id) ON DELETE CASCADE NOT NULL,
  pos_item_id UUID REFERENCES public.pos_items(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;

-- 14. Recipes
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES public.pos_items(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, branch_id)
);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- 15. Recipe Ingredients
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 16. Production Records
CREATE TABLE public.production_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id UUID REFERENCES public.pos_items(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  produced_qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
  status TEXT NOT NULL DEFAULT 'مسودة' CHECK (status IN ('مسودة', 'مرحل')),
  total_production_cost NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

-- 17. Production Ingredients
CREATE TABLE public.production_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_record_id UUID REFERENCES public.production_records(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  required_qty NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.production_ingredients ENABLE ROW LEVEL SECURITY;

-- 18. Waste Records
CREATE TABLE public.waste_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
  status TEXT NOT NULL DEFAULT 'مسودة' CHECK (status IN ('مسودة', 'مرحل')),
  total_cost NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waste_records ENABLE ROW LEVEL SECURITY;

-- 19. Waste Items
CREATE TABLE public.waste_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  waste_record_id UUID REFERENCES public.waste_records(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  cost NUMERIC NOT NULL DEFAULT 0,
  source_product TEXT
);
ALTER TABLE public.waste_items ENABLE ROW LEVEL SECURITY;

-- 20. Transfers
CREATE TABLE public.transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  source_name TEXT,
  destination_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  destination_name TEXT,
  status TEXT NOT NULL DEFAULT 'مسودة' CHECK (status IN ('مسودة', 'مرحل')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- 21. Transfer Items
CREATE TABLE public.transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

-- 22. Stocktake Records
CREATE TABLE public.stocktakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'مسودة',
  type TEXT NOT NULL DEFAULT 'regular' CHECK (type IN ('opening', 'closing', 'regular')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;

-- 23. Stocktake Items
CREATE TABLE public.stocktake_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stocktake_id UUID REFERENCES public.stocktakes(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  counted_qty NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.stocktake_items ENABLE ROW LEVEL SECURITY;

-- 24. Cost Adjustments
CREATE TABLE public.cost_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
  status TEXT NOT NULL DEFAULT 'مسودة' CHECK (status IN ('مسودة', 'مغلق')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_adjustments ENABLE ROW LEVEL SECURITY;

-- 25. Cost Adjustment Items
CREATE TABLE public.cost_adjustment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_adjustment_id UUID REFERENCES public.cost_adjustments(id) ON DELETE CASCADE NOT NULL,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  old_cost NUMERIC NOT NULL DEFAULT 0,
  new_cost NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.cost_adjustment_items ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies - Company-based access
-- =============================================

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Companies: users can see their own company
CREATE POLICY "Users can view own company" ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id());

-- Profiles: users can see profiles in their company
CREATE POLICY "Users can view company profiles" ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Macro for company-scoped tables
-- Branches
CREATE POLICY "Company access" ON public.branches FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.branches FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.branches FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.branches FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Warehouses
CREATE POLICY "Company access" ON public.warehouses FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.warehouses FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.warehouses FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Departments
CREATE POLICY "Company access" ON public.departments FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.departments FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.departments FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.departments FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Categories
CREATE POLICY "Company access" ON public.categories FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.categories FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.categories FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Stock Items
CREATE POLICY "Company access" ON public.stock_items FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.stock_items FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.stock_items FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.stock_items FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Suppliers
CREATE POLICY "Company access" ON public.suppliers FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.suppliers FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.suppliers FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Purchase Orders
CREATE POLICY "Company access" ON public.purchase_orders FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.purchase_orders FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.purchase_orders FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Purchase Items (access via parent)
CREATE POLICY "Access via order" ON public.purchase_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via order" ON public.purchase_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.company_id = public.get_user_company_id()));
CREATE POLICY "Update via order" ON public.purchase_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via order" ON public.purchase_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.company_id = public.get_user_company_id()));

-- POS Items
CREATE POLICY "Company access" ON public.pos_items FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_items FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.pos_items FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.pos_items FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- POS Sales
CREATE POLICY "Company access" ON public.pos_sales FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.pos_sales FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());

-- POS Sale Items
CREATE POLICY "Access via sale" ON public.pos_sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.id = sale_id AND s.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via sale" ON public.pos_sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.id = sale_id AND s.company_id = public.get_user_company_id()));

-- Recipes
CREATE POLICY "Company access" ON public.recipes FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.recipes FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.recipes FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.recipes FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Recipe Ingredients
CREATE POLICY "Access via recipe" ON public.recipe_ingredients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via recipe" ON public.recipe_ingredients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.company_id = public.get_user_company_id()));
CREATE POLICY "Update via recipe" ON public.recipe_ingredients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via recipe" ON public.recipe_ingredients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.company_id = public.get_user_company_id()));

-- Production Records
CREATE POLICY "Company access" ON public.production_records FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.production_records FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.production_records FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.production_records FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Production Ingredients
CREATE POLICY "Access via production" ON public.production_ingredients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.production_records pr WHERE pr.id = production_record_id AND pr.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via production" ON public.production_ingredients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.production_records pr WHERE pr.id = production_record_id AND pr.company_id = public.get_user_company_id()));
CREATE POLICY "Update via production" ON public.production_ingredients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.production_records pr WHERE pr.id = production_record_id AND pr.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via production" ON public.production_ingredients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.production_records pr WHERE pr.id = production_record_id AND pr.company_id = public.get_user_company_id()));

-- Waste Records
CREATE POLICY "Company access" ON public.waste_records FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.waste_records FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.waste_records FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.waste_records FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Waste Items
CREATE POLICY "Access via waste" ON public.waste_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.waste_records wr WHERE wr.id = waste_record_id AND wr.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via waste" ON public.waste_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.waste_records wr WHERE wr.id = waste_record_id AND wr.company_id = public.get_user_company_id()));
CREATE POLICY "Update via waste" ON public.waste_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.waste_records wr WHERE wr.id = waste_record_id AND wr.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via waste" ON public.waste_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.waste_records wr WHERE wr.id = waste_record_id AND wr.company_id = public.get_user_company_id()));

-- Transfers
CREATE POLICY "Company access" ON public.transfers FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.transfers FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.transfers FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.transfers FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Transfer Items
CREATE POLICY "Access via transfer" ON public.transfer_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via transfer" ON public.transfer_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.company_id = public.get_user_company_id()));
CREATE POLICY "Update via transfer" ON public.transfer_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via transfer" ON public.transfer_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.company_id = public.get_user_company_id()));

-- Stocktakes
CREATE POLICY "Company access" ON public.stocktakes FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.stocktakes FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.stocktakes FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.stocktakes FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Stocktake Items
CREATE POLICY "Access via stocktake" ON public.stocktake_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stocktakes st WHERE st.id = stocktake_id AND st.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via stocktake" ON public.stocktake_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stocktakes st WHERE st.id = stocktake_id AND st.company_id = public.get_user_company_id()));
CREATE POLICY "Update via stocktake" ON public.stocktake_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stocktakes st WHERE st.id = stocktake_id AND st.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via stocktake" ON public.stocktake_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stocktakes st WHERE st.id = stocktake_id AND st.company_id = public.get_user_company_id()));

-- Cost Adjustments
CREATE POLICY "Company access" ON public.cost_adjustments FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company insert" ON public.cost_adjustments FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company update" ON public.cost_adjustments FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "Company delete" ON public.cost_adjustments FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Cost Adjustment Items
CREATE POLICY "Access via adjustment" ON public.cost_adjustment_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cost_adjustments ca WHERE ca.id = cost_adjustment_id AND ca.company_id = public.get_user_company_id()));
CREATE POLICY "Insert via adjustment" ON public.cost_adjustment_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cost_adjustments ca WHERE ca.id = cost_adjustment_id AND ca.company_id = public.get_user_company_id()));
CREATE POLICY "Update via adjustment" ON public.cost_adjustment_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cost_adjustments ca WHERE ca.id = cost_adjustment_id AND ca.company_id = public.get_user_company_id()));
CREATE POLICY "Delete via adjustment" ON public.cost_adjustment_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cost_adjustments ca WHERE ca.id = cost_adjustment_id AND ca.company_id = public.get_user_company_id()));

-- =============================================
-- Allow anon to create companies (for signup)
-- =============================================
CREATE POLICY "Anyone can create a company" ON public.companies FOR INSERT TO anon, authenticated WITH CHECK (true);

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_id, full_name, email, role, permissions)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'company_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'مستخدم'),
    ARRAY['dashboard', 'pos', 'inventory', 'transfers', 'stocktake', 'recipes', 'production', 'waste', 'purchases', 'cost-adjustment', 'costing', 'menu-costing', 'menu-engineering', 'reports', 'settings']
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
