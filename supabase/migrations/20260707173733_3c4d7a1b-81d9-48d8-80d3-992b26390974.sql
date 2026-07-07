
ALTER TABLE public.inventory_categories 
  ADD COLUMN IF NOT EXISTS permissible_percentage numeric NOT NULL DEFAULT 0.05;

ALTER TABLE public.stock_items 
  ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false;
