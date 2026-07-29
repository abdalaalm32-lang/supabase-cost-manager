ALTER TABLE public.production_recipes
  ADD COLUMN IF NOT EXISTS track_waste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptable_waste_min numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptable_waste_max numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_break_qty numeric NOT NULL DEFAULT 0;

ALTER TABLE public.production_recipe_ingredients
  ADD COLUMN IF NOT EXISTS affects_waste boolean NOT NULL DEFAULT true;