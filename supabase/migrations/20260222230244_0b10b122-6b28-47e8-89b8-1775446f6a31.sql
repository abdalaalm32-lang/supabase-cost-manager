
-- Create OTP codes table for registration verification
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- No direct client access - only edge functions (service role) can access
CREATE POLICY "No direct select" ON public.otp_codes FOR SELECT USING (false);
CREATE POLICY "No direct insert" ON public.otp_codes FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update" ON public.otp_codes FOR UPDATE USING (false);
CREATE POLICY "No direct delete" ON public.otp_codes FOR DELETE USING (false);
