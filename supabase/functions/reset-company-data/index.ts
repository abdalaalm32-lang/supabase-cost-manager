import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { company_id } = await req.json();
    if (!company_id) throw new Error("company_id is required");

    // Verify user is admin for this company
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("is_company_admin", {
      _user_id: user.id,
      _company_id: company_id,
    });
    if (!isAdmin) throw new Error("Only admins can reset data");

    // Delete ALL data for the company in correct order (respecting FK constraints)
    // Child tables first, then parent tables

    // 1. POS sale items → POS sales
    const { data: sales } = await adminClient.from("pos_sales").select("id").eq("company_id", company_id);
    if (sales?.length) {
      const saleIds = sales.map((s: any) => s.id);
      await adminClient.from("pos_sale_items").delete().in("sale_id", saleIds);
    }
    await adminClient.from("pos_sales").delete().eq("company_id", company_id);

    // 2. Purchase items → Purchase orders
    const { data: purchases } = await adminClient.from("purchase_orders").select("id").eq("company_id", company_id);
    if (purchases?.length) {
      const poIds = purchases.map((p: any) => p.id);
      await adminClient.from("purchase_items").delete().in("purchase_order_id", poIds);
    }
    await adminClient.from("purchase_orders").delete().eq("company_id", company_id);

    // 3. Production ingredients + edit history → Production records
    const { data: prodRecords } = await adminClient.from("production_records").select("id").eq("company_id", company_id);
    if (prodRecords?.length) {
      const prIds = prodRecords.map((p: any) => p.id);
      await adminClient.from("production_ingredients").delete().in("production_record_id", prIds);
      await adminClient.from("production_edit_history").delete().in("production_record_id", prIds);
    }
    await adminClient.from("production_records").delete().eq("company_id", company_id);

    // 4. Production recipe ingredients → Production recipes
    const { data: prodRecipes } = await adminClient.from("production_recipes").select("id").eq("company_id", company_id);
    if (prodRecipes?.length) {
      const prIds = prodRecipes.map((p: any) => p.id);
      await adminClient.from("production_recipe_ingredients").delete().in("recipe_id", prIds);
    }
    await adminClient.from("production_recipes").delete().eq("company_id", company_id);

    // 5. Waste items + edit history → Waste records
    const { data: wasteRecords } = await adminClient.from("waste_records").select("id").eq("company_id", company_id);
    if (wasteRecords?.length) {
      const wrIds = wasteRecords.map((w: any) => w.id);
      await adminClient.from("waste_items").delete().in("waste_record_id", wrIds);
      await adminClient.from("waste_edit_history").delete().in("waste_record_id", wrIds);
    }
    await adminClient.from("waste_records").delete().eq("company_id", company_id);

    // 6. Stocktake items + edit history → Stocktakes
    const { data: stocktakes } = await adminClient.from("stocktakes").select("id").eq("company_id", company_id);
    if (stocktakes?.length) {
      const stIds = stocktakes.map((s: any) => s.id);
      await adminClient.from("stocktake_items").delete().in("stocktake_id", stIds);
      await adminClient.from("stocktake_edit_history").delete().in("stocktake_id", stIds);
    }
    await adminClient.from("stocktakes").delete().eq("company_id", company_id);

    // 7. Transfer items → Transfers
    const { data: transfers } = await adminClient.from("transfers").select("id").eq("company_id", company_id);
    if (transfers?.length) {
      const tIds = transfers.map((t: any) => t.id);
      await adminClient.from("transfer_items").delete().in("transfer_id", tIds);
    }
    await adminClient.from("transfers").delete().eq("company_id", company_id);

    // 8. Cost adjustment items → Cost adjustments
    const { data: costAdj } = await adminClient.from("cost_adjustments").select("id").eq("company_id", company_id);
    if (costAdj?.length) {
      const caIds = costAdj.map((c: any) => c.id);
      await adminClient.from("cost_adjustment_items").delete().in("cost_adjustment_id", caIds);
    }
    await adminClient.from("cost_adjustments").delete().eq("company_id", company_id);

    // 9. Recipe ingredients → Recipes
    const { data: recipes } = await adminClient.from("recipes").select("id").eq("company_id", company_id);
    if (recipes?.length) {
      const rIds = recipes.map((r: any) => r.id);
      await adminClient.from("recipe_ingredients").delete().in("recipe_id", rIds);
    }
    await adminClient.from("recipes").delete().eq("company_id", company_id);

    // 10. POS item cost settings
    await adminClient.from("pos_item_cost_settings").delete().eq("company_id", company_id);

    // 11. Category packing & side costs
    await adminClient.from("category_packing_items").delete().eq("company_id", company_id);
    await adminClient.from("category_side_costs").delete().eq("company_id", company_id);

    // 12. Menu costing periods
    await adminClient.from("menu_costing_periods").delete().eq("company_id", company_id);

    // 13. Stock item locations
    await adminClient.from("stock_item_locations").delete().eq("company_id", company_id);

    // 14. Stock items (delete completely - has FK deps on categories/departments so delete before them)
    await adminClient.from("stock_items").delete().eq("company_id", company_id);

    // 15. POS items (delete - recipes already deleted above)
    await adminClient.from("pos_items").delete().eq("company_id", company_id);

    // 16. Categories (POS categories)
    await adminClient.from("categories").delete().eq("company_id", company_id);

    // 17. Inventory categories
    await adminClient.from("inventory_categories").delete().eq("company_id", company_id);

    // 18. Suppliers
    await adminClient.from("suppliers").delete().eq("company_id", company_id);

    // 19. Warehouse branches → Warehouses
    await adminClient.from("warehouse_branches").delete().eq("warehouse_id", "any"); // delete via warehouses
    const { data: warehouses } = await adminClient.from("warehouses").select("id").eq("company_id", company_id);
    if (warehouses?.length) {
      const wIds = warehouses.map((w: any) => w.id);
      await adminClient.from("warehouse_branches").delete().in("warehouse_id", wIds);
    }
    await adminClient.from("warehouses").delete().eq("company_id", company_id);

    // 20. Departments
    await adminClient.from("departments").delete().eq("company_id", company_id);

    // 21. Storage types
    await adminClient.from("storage_types").delete().eq("company_id", company_id);

    // 22. Job roles
    await adminClient.from("job_roles").delete().eq("company_id", company_id);

    // 23. Branches (profiles reference branches, so update profiles first)
    await adminClient.from("profiles").update({ branch_id: null, job_role_id: null }).eq("company_id", company_id);
    await adminClient.from("branches").delete().eq("company_id", company_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
