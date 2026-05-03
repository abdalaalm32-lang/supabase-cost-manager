
CREATE OR REPLACE FUNCTION public.current_user_has_pos_password()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND COALESCE(pos_password, '') <> ''
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_has_pos_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_pos_password() TO authenticated;
