
-- Prevent duplicate item codes within same company/branch scope
CREATE UNIQUE INDEX IF NOT EXISTS pos_items_company_branch_code_uidx
ON public.pos_items (company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- Drop the older single-arg overload to avoid ambiguity; keep the branch-aware version
DROP FUNCTION IF EXISTS public.generate_item_code(uuid);
