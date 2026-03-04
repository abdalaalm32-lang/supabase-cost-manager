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

    // Verify caller is authenticated and is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's company
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", callerUser.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "لم يتم العثور على الملف الشخصي" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin or owner status
    const { data: isAdmin } = await supabaseAdmin.rpc("is_company_admin", {
      _user_id: callerUser.id,
      _company_id: callerProfile.company_id,
    });

    const { data: isOwner } = await supabaseAdmin.rpc("is_company_owner", {
      _user_id: callerUser.id,
      _company_id: callerProfile.company_id,
    });

    if (!isAdmin && !isOwner) {
      return new Response(JSON.stringify({ error: "يجب أن تكون مديراً أو مالكاً" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, target_user_id, new_password } = await req.json();

    // Verify target user is in same company
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, user_id")
      .eq("user_id", target_user_id)
      .single();

    if (!targetProfile || targetProfile.company_id !== callerProfile.company_id) {
      return new Response(JSON.stringify({ error: "المستخدم غير موجود في شركتك" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change_password") {
      if (!new_password || new_password.length < 6) {
        return new Response(
          JSON.stringify({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        target_user_id,
        { password: new_password }
      );

      if (error) {
        return new Response(
          JSON.stringify({ error: "فشل تغيير كلمة المرور", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ message: "تم تغيير كلمة المرور بنجاح" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_user") {
      // Don't allow deleting yourself
      if (target_user_id === callerUser.id) {
        return new Response(
          JSON.stringify({ error: "لا يمكنك حذف حسابك الخاص" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from auth (cascades to profiles and user_roles)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: "فشل حذف المستخدم", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ message: "تم حذف المستخدم بنجاح" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "إجراء غير معروف" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
