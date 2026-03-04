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

    // Verify caller is admin
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

    // Check if caller has admin role
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: callerUser.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "فقط الأدمن يمكنه إنشاء شركات" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      company_name,
      company_code,
      owner_email,
      owner_password,
      owner_name,
      max_branches,
      max_warehouses,
    } = await req.json();

    if (!company_name || !owner_email || !owner_password || !owner_name) {
      return new Response(
        JSON.stringify({ error: "اسم الشركة وبيانات المالك مطلوبة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = company_code || `GSC-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: company_name,
        code,
        max_branches: max_branches || 2,
        max_warehouses: max_warehouses || 1,
      })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: "فشل إنشاء الشركة", details: companyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create owner user
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email: owner_email,
        password: owner_password,
        email_confirm: true,
        user_metadata: {
          full_name: owner_name,
          company_id: company.id,
          role: "مدير شركة",
          permissions: ["dashboard", "pos", "inventory", "transfers", "stocktake", "recipes", "production", "waste", "purchases", "costing", "menu-costing", "menu-engineering", "cost-adjustment", "reports", "settings"],
          status: "نشط",
          subscription_type: "unlimited",
        },
      });

    if (userError) {
      // Rollback company creation
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء حساب المالك", details: userError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the user_roles to set role as 'owner' instead of default 'user'
    await supabaseAdmin
      .from("user_roles")
      .update({ role: "owner" })
      .eq("user_id", userData.user.id)
      .eq("company_id", company.id);

    // Set owner_id on company
    await supabaseAdmin
      .from("companies")
      .update({ owner_id: userData.user.id })
      .eq("id", company.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "تم إنشاء الشركة والمالك بنجاح",
        company_id: company.id,
        owner_id: userData.user.id,
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
