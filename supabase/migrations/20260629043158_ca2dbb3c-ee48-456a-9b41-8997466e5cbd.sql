ALTER TABLE public.stock_item_supply_pricing 
ADD COLUMN IF NOT EXISTS manual_transport_share numeric NOT NULL DEFAULT 0;