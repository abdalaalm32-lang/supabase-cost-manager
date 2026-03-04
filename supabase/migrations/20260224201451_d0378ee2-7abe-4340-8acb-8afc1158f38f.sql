
-- Add is_edited flag to stocktakes
ALTER TABLE public.stocktakes ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Create edit history table
CREATE TABLE public.stocktake_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stocktake_id uuid NOT NULL REFERENCES public.stocktakes(id) ON DELETE CASCADE,
  edited_at timestamp with time zone NOT NULL DEFAULT now(),
  editor_name text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.stocktake_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access select" ON public.stocktake_edit_history FOR SELECT
USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_edit_history.stocktake_id AND st.company_id = get_user_company_id()));

CREATE POLICY "Access insert" ON public.stocktake_edit_history FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_edit_history.stocktake_id AND st.company_id = get_user_company_id()));

CREATE POLICY "Access delete" ON public.stocktake_edit_history FOR DELETE
USING (EXISTS (SELECT 1 FROM stocktakes st WHERE st.id = stocktake_edit_history.stocktake_id AND st.company_id = get_user_company_id()));

-- Update status constraint to include مكتمل
ALTER TABLE public.stocktakes DROP CONSTRAINT IF EXISTS stocktakes_status_check;
