
-- Add menu engineering classification to stock_items (kitchen or bar)
ALTER TABLE public.stock_items ADD COLUMN menu_engineering_class text DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.stock_items.menu_engineering_class IS 'Menu engineering classification: kitchen or bar';
