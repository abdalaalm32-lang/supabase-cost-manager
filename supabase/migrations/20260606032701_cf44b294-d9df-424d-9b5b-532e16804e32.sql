ALTER TABLE public.menu_costing_periods 
ADD COLUMN IF NOT EXISTS venue_type text NOT NULL DEFAULT 'صالة';