
CREATE TABLE public.variance_item_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  branch_id uuid,
  period_from date,
  period_to date,
  note text,
  action_status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_variance_notes_lookup ON public.variance_item_notes(company_id, stock_item_id, period_from, period_to, branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variance_item_notes TO authenticated;
GRANT ALL ON public.variance_item_notes TO service_role;

ALTER TABLE public.variance_item_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can view variance notes"
  ON public.variance_item_notes FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "company members can insert variance notes"
  ON public.variance_item_notes FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "company members can update variance notes"
  ON public.variance_item_notes FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "company members can delete variance notes"
  ON public.variance_item_notes FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER update_variance_item_notes_updated_at
  BEFORE UPDATE ON public.variance_item_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
