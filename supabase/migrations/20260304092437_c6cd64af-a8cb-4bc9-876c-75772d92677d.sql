
-- Support tickets table for messaging between company owners and admin
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_code TEXT NOT NULL,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_reply TEXT,
  admin_reply_at TIMESTAMP WITH TIME ZONE,
  is_reply_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Admin can see all tickets
CREATE POLICY "Admin can select all tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Company owner can see their own tickets
CREATE POLICY "Owner can select own tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id() AND is_company_owner(auth.uid(), company_id));

-- Company owner can insert tickets
CREATE POLICY "Owner can insert tickets"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id() AND is_company_owner(auth.uid(), company_id));

-- Admin can update tickets (for replies)
CREATE POLICY "Admin can update tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Owner can update own tickets (for marking reply as read)
CREATE POLICY "Owner can update own tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id() AND is_company_owner(auth.uid(), company_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
