CREATE POLICY "Owner can view own company log"
ON public.company_subscription_log
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);