
-- Create production_recipes table (references stock_items instead of pos_items)
CREATE TABLE public.production_recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  branch_id UUID REFERENCES public.branches(id)
);

-- Create production_recipe_ingredients table
CREATE TABLE public.production_recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.production_recipes(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id),
  qty NUMERIC NOT NULL DEFAULT 0
);

-- RLS for production_recipes
ALTER TABLE public.production_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company select" ON public.production_recipes FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company insert" ON public.production_recipes FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Company update" ON public.production_recipes FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "Company delete" ON public.production_recipes FOR DELETE USING (company_id = get_user_company_id());

-- RLS for production_recipe_ingredients
ALTER TABLE public.production_recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access select" ON public.production_recipe_ingredients FOR SELECT USING (EXISTS (SELECT 1 FROM production_recipes r WHERE r.id = production_recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access insert" ON public.production_recipe_ingredients FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM production_recipes r WHERE r.id = production_recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access update" ON public.production_recipe_ingredients FOR UPDATE USING (EXISTS (SELECT 1 FROM production_recipes r WHERE r.id = production_recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
CREATE POLICY "Access delete" ON public.production_recipe_ingredients FOR DELETE USING (EXISTS (SELECT 1 FROM production_recipes r WHERE r.id = production_recipe_ingredients.recipe_id AND r.company_id = get_user_company_id()));
