
REVOKE EXECUTE ON FUNCTION public.get_company_profiles_directory(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_shift_definitions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_shift_definition_password(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_own_pos_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_admin_or_owner(uuid, uuid) FROM PUBLIC, anon;
