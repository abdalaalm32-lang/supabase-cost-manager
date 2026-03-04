ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS creator_name text;