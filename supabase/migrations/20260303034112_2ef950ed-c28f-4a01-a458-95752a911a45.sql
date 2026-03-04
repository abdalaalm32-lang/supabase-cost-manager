ALTER TABLE public.menu_costing_periods 
ADD COLUMN custom_expenses jsonb NOT NULL DEFAULT '[]'::jsonb;