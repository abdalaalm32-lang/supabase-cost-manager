ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS tables_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS table_number text;
CREATE INDEX IF NOT EXISTS idx_pos_sales_table ON public.pos_sales (company_id, branch_id, status, table_number);