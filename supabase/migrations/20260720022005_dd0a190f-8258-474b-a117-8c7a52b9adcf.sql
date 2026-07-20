
CREATE TABLE public.pos_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_api_keys_company ON public.pos_api_keys(company_id);
CREATE INDEX idx_pos_api_keys_hash ON public.pos_api_keys(key_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_api_keys TO authenticated;
GRANT ALL ON public.pos_api_keys TO service_role;

ALTER TABLE public.pos_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view api keys"
  ON public.pos_api_keys FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company admins can insert api keys"
  ON public.pos_api_keys FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company admins can update api keys"
  ON public.pos_api_keys FOR UPDATE TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company admins can delete api keys"
  ON public.pos_api_keys FOR DELETE TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pos_api_keys_updated_at BEFORE UPDATE ON public.pos_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
