ALTER TABLE public.transfers 
  ADD COLUMN IF NOT EXISTS transportation_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_cost numeric NOT NULL DEFAULT 0;