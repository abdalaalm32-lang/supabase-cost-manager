ALTER TABLE public.menu_costing_periods
ADD COLUMN consumables_kitchen_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN consumables_bar_categories jsonb NOT NULL DEFAULT '[]'::jsonb;