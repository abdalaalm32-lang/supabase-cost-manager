
-- ============ pos_sync_configs ============
CREATE TABLE public.pos_sync_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  db_type TEXT NOT NULL CHECK (db_type IN ('sqlserver','mysql','postgres','oracle')),
  server_host TEXT NOT NULL,
  database_name TEXT NOT NULL,
  db_username TEXT NOT NULL,
  db_password_encrypted TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 1433,
  sync_interval_seconds INTEGER NOT NULL DEFAULT 60,
  selected_tables JSONB NOT NULL DEFAULT '["invoices","sales_details","items"]'::jsonb,
  api_key_id UUID REFERENCES public.pos_api_keys(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sync_configs TO authenticated;
GRANT ALL ON public.pos_sync_configs TO service_role;

ALTER TABLE public.pos_sync_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage sync configs"
  ON public.pos_sync_configs FOR ALL
  USING (
    company_id = public.get_user_company_id()
    AND (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND (public.is_company_admin_or_owner(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Company members view sync configs"
  ON public.pos_sync_configs FOR SELECT
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pos_sync_configs_updated_at
  BEFORE UPDATE ON public.pos_sync_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ pos_sync_logs ============
CREATE TABLE public.pos_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('api','db_sync')),
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','warning')),
  records_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pos_sync_logs TO authenticated;
GRANT ALL ON public.pos_sync_logs TO service_role;

ALTER TABLE public.pos_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members view sync logs"
  ON public.pos_sync_logs FOR SELECT
  USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company members insert sync logs"
  ON public.pos_sync_logs FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE INDEX idx_pos_sync_logs_company_created ON public.pos_sync_logs(company_id, created_at DESC);
CREATE INDEX idx_pos_sync_configs_company ON public.pos_sync_configs(company_id);
