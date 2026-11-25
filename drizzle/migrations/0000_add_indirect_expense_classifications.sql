ALTER TABLE public.menu_costing_periods
  ADD COLUMN IF NOT EXISTS expense_classifications JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.menu_costing_periods.expense_classifications IS 'Expense category by built-in expense key: fixed, variable, or semi_variable. Missing keys default to fixed.';