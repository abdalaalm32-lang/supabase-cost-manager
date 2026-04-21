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

    // Verify caller's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "غير مصرح" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseAdmin.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "غير مصرح" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = claimsData.claims.sub as string;

    // Verify caller is a system admin or company admin/owner
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", callerId)
      .single();

    if (!callerProfile) {
      return new Response(
        JSON.stringify({ error: "لم يتم العثور على الملف الشخصي" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isSysAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });

    const { data: isCompanyAdmin } = await supabaseAdmin.rpc("is_company_admin", {
      _user_id: callerId,
      _company_id: callerProfile.company_id,
    });

    const { data: isOwner } = await supabaseAdmin.rpc("is_company_owner", {
      _user_id: callerId,
      _company_id: callerProfile.company_id,
    });

    if (!isSysAdmin && !isCompanyAdmin && !isOwner) {
      return new Response(
        JSON.stringify({ error: "يجب أن تكون مديراً أو مالكاً لإنشاء مستخدم" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Non-system-admins can only create users in their own company
    if (!isSysAdmin && company_id !== callerProfile.company_id) {
      return new Response(
        JSON.stringify({ error: "لا يمكنك إنشاء مستخدم في شركة أخرى" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side hard limit enforcement (applies to EVERYONE including system admins)
    const { count: currentUserCount } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);

    const { data: companyLimits } = await supabaseAdmin
      .from("companies")
      .select("max_users")
      .eq("id", company_id)
      .single();

    const maxAllowed = (companyLimits as any)?.max_users ?? 5;
    if ((currentUserCount ?? 0) >= maxAllowed) {
      return new Response(
        JSON.stringify({
          error: `لقد وصلت للحد الأقصى المسموح به للمستخدمين (${maxAllowed}). العدد الحالي ${currentUserCount}. يرجى رفع الحد من إدارة الشركات أولاً.`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    return new Response(JSON.stringify({ error: "حدث خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
