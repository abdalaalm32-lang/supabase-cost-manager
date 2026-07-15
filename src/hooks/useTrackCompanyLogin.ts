import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Records a login event once per session for the current company.
 * Increments login_count and updates last_login_at on public.company_activity.
 */
export const useTrackCompanyLogin = () => {
  const { auth } = useAuth();
  useEffect(() => {
    if (!auth.profile?.company_id || !auth.user) return;
    const flag = `activity_logged_${auth.profile.company_id}_${auth.user.id}`;
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");
    (async () => {
      try {
        // Get current row
        const { data: existing } = await supabase
          .from("company_activity" as any)
          .select("*")
          .eq("company_id", auth.profile!.company_id)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("company_activity" as any)
            .update({
              last_login_at: new Date().toISOString(),
              login_count: ((existing as any).login_count || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", auth.profile!.company_id);
        } else {
          await supabase.from("company_activity" as any).insert({
            company_id: auth.profile!.company_id,
            last_login_at: new Date().toISOString(),
            login_count: 1,
          });
        }
      } catch {
        // fail silently
      }
    })();
  }, [auth.profile?.company_id, auth.user?.id]);
};
