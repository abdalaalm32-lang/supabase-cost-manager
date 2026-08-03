ALTER TABLE public.stock_item_supply_pricing
  ADD COLUMN IF NOT EXISTS packaging_type text NOT NULL DEFAULT 'per_unit',
  ADD COLUMN IF NOT EXISTS package_size numeric NOT NULL DEFAULT 1;

ALTER TABLE public.stock_item_supply_pricing
  DROP CONSTRAINT IF EXISTS stock_item_supply_pricing_packaging_type_check;

ALTER TABLE public.stock_item_supply_pricing
  ADD CONSTRAINT stock_item_supply_pricing_packaging_type_check
  CHECK (packaging_type IN ('per_unit','per_transfer','per_package'));