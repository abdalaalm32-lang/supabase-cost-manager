
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 5;

ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
