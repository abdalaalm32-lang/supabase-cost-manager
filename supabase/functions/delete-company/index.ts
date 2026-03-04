import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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
      return new Response(JSON.stringify({ error: "فقط الأدمن يمكنه حذف الشركات" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ error: "معرف الشركة مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all users of this company
    const { data: companyProfiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("company_id", company_id);

    const userIds = companyProfiles?.map((p: any) => p.user_id) || [];

    // Delete all operational data first (respecting foreign keys)
    // Child tables first
    const tables_with_children = [
      { parent: "pos_sales", child: "pos_sale_items", fk: "sale_id" },
      { parent: "purchase_orders", child: "purchase_items", fk: "purchase_order_id" },
      { parent: "production_records", child: "production_ingredients", fk: "production_record_id" },
      { parent: "production_records", child: "production_edit_history", fk: "production_record_id" },
      { parent: "production_recipes", child: "production_recipe_ingredients", fk: "recipe_id" },
      { parent: "waste_records", child: "waste_items", fk: "waste_record_id" },
      { parent: "waste_records", child: "waste_edit_history", fk: "waste_record_id" },
      { parent: "stocktakes", child: "stocktake_items", fk: "stocktake_id" },
      { parent: "stocktakes", child: "stocktake_edit_history", fk: "stocktake_id" },
      { parent: "cost_adjustments", child: "cost_adjustment_items", fk: "cost_adjustment_id" },
      { parent: "recipes", child: "recipe_ingredients", fk: "recipe_id" },
      { parent: "transfers", child: "transfer_items", fk: "transfer_id" },
      { parent: "menu_costing_periods", child: "category_packing_items", fk: "period_id" },
      { parent: "menu_costing_periods", child: "category_side_costs", fk: "period_id" },
    ];

    // Get parent IDs and delete children
    for (const t of tables_with_children) {
      const { data: parents } = await supabaseAdmin
        .from(t.parent)
        .select("id")
        .eq("company_id", company_id);
      if (parents && parents.length > 0) {
        const ids = parents.map((p: any) => p.id);
        await supabaseAdmin.from(t.child).delete().in(t.fk, ids);
      }
    }

    // Delete parent tables
    const companyTables = [
      "pos_item_cost_settings", "pos_sale_items", "pos_sales", "pos_items",
      "purchase_orders", "production_records", "production_recipes",
      "waste_records", "stocktakes", "cost_adjustments", "recipes",
      "transfers", "menu_costing_periods", "stock_item_locations",
      "stock_items", "inventory_categories", "categories",
      "warehouse_branches", "warehouses", "branches",
      "departments", "suppliers", "storage_types", "job_roles",
    ];

    for (const table of companyTables) {
      await supabaseAdmin.from(table).delete().eq("company_id", company_id);
    }

    // Delete user_roles and profiles
    await supabaseAdmin.from("user_roles").delete().eq("company_id", company_id);
    await supabaseAdmin.from("profiles").delete().eq("company_id", company_id);

    // Delete all auth users
    for (const userId of userIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    // Finally delete the company
    await supabaseAdmin.from("companies").delete().eq("id", company_id);

    return new Response(
      JSON.stringify({ success: true, message: "تم حذف الشركة وجميع بياناتها بنجاح" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
