import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      email,
      password,
      full_name,
      company_id,
      role,
      permissions,
      branch_id,
      job_role_id,
      user_code,
      status,
      subscription_type,
      subscription_minutes,
      subscription_start,
      subscription_end,
    } = await req.json();

    if (!email || !password || !full_name || !company_id) {
      return new Response(
        JSON.stringify({
          error: "يجب تقديم البريد الإلكتروني وكلمة المرور والاسم الكامل ومعرف الشركة",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === email);

    if (existing) {
      // Check if profile exists for this auth user
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", existing.id)
        .maybeSingle();

      if (existingProfile) {
        // User and profile both exist - truly a duplicate
        return new Response(
          JSON.stringify({ error: "المستخدم موجود بالفعل بهذا البريد الإلكتروني" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Auth user exists but no profile - delete old auth user and recreate
      await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }

    // Create the user - pass ALL fields in user_metadata so handle_new_user trigger uses them
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          company_id,
          role: role || "مستخدم",
          permissions: permissions || ["dashboard"],
          branch_id: branch_id || null,
          job_role_id: job_role_id || null,
          user_code: user_code || null,
          status: status || "نشط",
          subscription_type: subscription_type || "unlimited",
          subscription_minutes: subscription_minutes || null,
          subscription_start: subscription_start || null,
          subscription_end: subscription_end || null,
        },
      });

    if (userError) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء المستخدم", details: userError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "تم إنشاء المستخدم بنجاح",
        userId: userData.user.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
