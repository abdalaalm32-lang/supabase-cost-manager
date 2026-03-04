
-- Update handle_new_user to read permissions and other fields from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_permissions text[];
  v_branch_id uuid;
  v_job_role_id uuid;
  v_user_code text;
  v_status text;
  v_subscription_type text;
  v_subscription_minutes integer;
  v_subscription_start timestamptz;
  v_subscription_end timestamptz;
BEGIN
  v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  
  -- Read permissions from metadata, default to ['dashboard']
  IF NEW.raw_user_meta_data ? 'permissions' AND NEW.raw_user_meta_data->>'permissions' IS NOT NULL THEN
    SELECT array_agg(val) INTO v_permissions
    FROM jsonb_array_elements_text((NEW.raw_user_meta_data->'permissions')::jsonb) AS val;
  END IF;
  IF v_permissions IS NULL THEN
    v_permissions := ARRAY['dashboard'];
  END IF;

  v_branch_id := (NEW.raw_user_meta_data->>'branch_id')::UUID;
  v_job_role_id := (NEW.raw_user_meta_data->>'job_role_id')::UUID;
  v_user_code := NEW.raw_user_meta_data->>'user_code';
  v_status := COALESCE(NEW.raw_user_meta_data->>'status', 'نشط');
  v_subscription_type := COALESCE(NEW.raw_user_meta_data->>'subscription_type', 'unlimited');
  v_subscription_minutes := (NEW.raw_user_meta_data->>'subscription_minutes')::integer;
  v_subscription_start := (NEW.raw_user_meta_data->>'subscription_start')::timestamptz;
  v_subscription_end := (NEW.raw_user_meta_data->>'subscription_end')::timestamptz;

  -- Insert profile with all fields from metadata
  INSERT INTO public.profiles (user_id, company_id, full_name, email, role, permissions, branch_id, job_role_id, user_code, status, subscription_type, subscription_minutes, subscription_start, subscription_end)
  VALUES (
    NEW.id,
    v_company_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'مستخدم'),
    v_permissions,
    v_branch_id,
    v_job_role_id,
    v_user_code,
    v_status,
    v_subscription_type,
    v_subscription_minutes,
    v_subscription_start,
    v_subscription_end
  );
  
  -- Insert default user role into user_roles table
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (NEW.id, 'user'::app_role, v_company_id);
  
  RETURN NEW;
END;
$function$;
