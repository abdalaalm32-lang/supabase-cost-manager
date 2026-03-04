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

    // Get the requesting user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the requesting user
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "توكن غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the requesting user's company
    const { data: reqProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", requestingUser.id)
      .single();

    if (!reqProfile) {
      return new Response(JSON.stringify({ error: "بروفايل غير موجود" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user is admin or owner in their company
    const { data: isAdmin } = await supabaseAdmin.rpc("is_company_admin", {
      _user_id: requestingUser.id,
      _company_id: reqProfile.company_id,
    });

    const { data: isOwner } = await supabaseAdmin.rpc("is_company_owner", {
      _user_id: requestingUser.id,
      _company_id: reqProfile.company_id,
    });

    if (!isAdmin && !isOwner) {
      return new Response(
        JSON.stringify({ error: "فقط المدير أو المالك يمكنه تعديل الأدوار" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { action, target_user_id, role } = await req.json();

    // Verify target user is in the same company
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", target_user_id)
      .single();

    if (!targetProfile || targetProfile.company_id !== reqProfile.company_id) {
      return new Response(
        JSON.stringify({ error: "المستخدم ليس في نفس الشركة" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent admin from removing their own admin role
    if (
      action === "remove" &&
      role === "admin" &&
      target_user_id === requestingUser.id
    ) {
      return new Response(
        JSON.stringify({ error: "لا يمكنك إزالة دور المدير من نفسك" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "assign") {
      const { error } = await supabaseAdmin.from("user_roles").upsert(
        {
          user_id: target_user_id,
          role,
          company_id: reqProfile.company_id,
        },
        { onConflict: "user_id,role" }
      );
      if (error) throw error;

      // Also update profile.role for display purposes
      const roleMap: Record<string, string> = {
        admin: "مدير نظام",
        manager: "مدير",
        user: "مستخدم",
        owner: "مالك",
        accountant: "محاسب",
        support: "دعم فني",
      };
      await supabaseAdmin
        .from("profiles")
        .update({ role: roleMap[role] || "مستخدم" })
        .eq("user_id", target_user_id);

      return new Response(
        JSON.stringify({ success: true, message: "تم تعيين الدور بنجاح" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "remove") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", target_user_id)
        .eq("role", role);
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: "تم إزالة الدور بنجاح" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
