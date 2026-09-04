CREATE TABLE public.pos_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  markup_percent numeric NOT NULL DEFAULT 0,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_channels TO authenticated;
GRANT ALL ON public.pos_channels TO service_role;

ALTER TABLE public.pos_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage their channels"
ON public.pos_channels FOR ALL TO authenticated
USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pos_channels_updated_at
BEFORE UPDATE ON public.pos_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX pos_channels_company_name_idx ON public.pos_channels (company_id, name);

CREATE TABLE public.pos_item_channel_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.pos_channels(id) ON DELETE CASCADE,
  pos_item_id uuid NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, pos_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_item_channel_prices TO authenticated;
GRANT ALL ON public.pos_item_channel_prices TO service_role;

ALTER TABLE public.pos_item_channel_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage their channel prices"
ON public.pos_item_channel_prices FOR ALL TO authenticated
USING (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (company_id = public.get_user_company_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pos_item_channel_prices_updated_at
BEFORE UPDATE ON public.pos_item_channel_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX pos_item_channel_prices_item_idx ON public.pos_item_channel_prices (pos_item_id);

ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.pos_channels(id) ON DELETE SET NULL;

INSERT INTO public.pos_channels (company_id, name, code, markup_percent, is_default, sort_order)
SELECT c.id, 'صالة (السعر الأساسي)', 'MAIN', 0, true, 0 FROM public.companies c
ON CONFLICT DO NOTHING;