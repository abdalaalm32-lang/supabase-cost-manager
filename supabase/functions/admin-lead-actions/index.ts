import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin actions on trial leads: delete_lead | reset_password
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "الأدمن فقط" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, lead_id, email } = await req.json();
    if (!action || (!lead_id && !email)) {
      return new Response(JSON.stringify({ error: "معطيات ناقصة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead } = await supabaseAdmin
      .from("trial_leads")
      .select("*")
      .eq(lead_id ? "id" : "email", lead_id || email)
      .maybeSingle();

    if (!lead) {
      return new Response(JSON.stringify({ error: "العميل غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetEmail = lead.email;
    const companyId = lead.company_id;

    // Find auth user by email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = users?.users?.find((u) => u.email === targetEmail);

    if (action === "reset_password") {
      if (!authUser) {
        return new Response(JSON.stringify({ error: "الحساب غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Generate a new random password
      const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      let newPassword = "";
      for (let i = 0; i < 10; i++) newPassword += chars[Math.floor(Math.random() * chars.length)];
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: newPassword });
      return new Response(JSON.stringify({ success: true, email: targetEmail, password: newPassword }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_lead") {
      // Delete company (including all data) if linked
      if (companyId) {
        // Get all user_ids for company
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("company_id", companyId);
        const userIds = profiles?.map((p: any) => p.user_id) || [];

        // Delete children tables first (minimal set for trial companies)
        const tables_with_children = [
          { parent: "pos_sales", child: "pos_sale_items", fk: "sale_id" },
          { parent: "purchase_orders", child: "purchase_items", fk: "purchase_order_id" },
          { parent: "production_records", child: "production_ingredients", fk: "production_record_id" },
          { parent: "waste_records", child: "waste_items", fk: "waste_record_id" },
          { parent: "stocktakes", child: "stocktake_items", fk: "stocktake_id" },
          { parent: "cost_adjustments", child: "cost_adjustment_items", fk: "cost_adjustment_id" },
          { parent: "recipes", child: "recipe_ingredients", fk: "recipe_id" },
          { parent: "transfers", child: "transfer_items", fk: "transfer_id" },
        ];
        for (const t of tables_with_children) {
          const { data: parents } = await supabaseAdmin.from(t.parent).select("id").eq("company_id", companyId);
          if (parents && parents.length > 0) {
            const ids = parents.map((p: any) => p.id);
            await supabaseAdmin.from(t.child).delete().in(t.fk, ids);
          }
        }

        const companyTables = [
          "pos_item_cost_settings", "pos_items",
          "purchase_orders", "production_records", "production_recipes",
          "waste_records", "stocktakes", "cost_adjustments", "recipes",
          "transfers", "menu_costing_periods", "stock_item_locations",
          "stock_items", "inventory_categories", "categories",
          "warehouse_branches", "warehouses", "branches",
          "departments", "suppliers", "storage_types", "job_roles",
          "company_activity", "company_subscription_log",
        ];
        for (const table of companyTables) {
          await supabaseAdmin.from(table).delete().eq("company_id", companyId);
        }

        await supabaseAdmin.from("user_roles").delete().eq("company_id", companyId);
        await supabaseAdmin.from("profiles").delete().eq("company_id", companyId);

        for (const uid of userIds) {
          try { await supabaseAdmin.auth.admin.deleteUser(uid); } catch (_) {}
        }

        await supabaseAdmin.from("companies").delete().eq("id", companyId);
      } else if (authUser) {
        // Standalone auth user without company - delete just the auth user
        try { await supabaseAdmin.auth.admin.deleteUser(authUser.id); } catch (_) {}
      }

      // Finally remove the lead row itself
      await supabaseAdmin.from("trial_leads").delete().eq("id", lead.id);
      // Clean any OTP codes for this email
      await supabaseAdmin.from("otp_codes").delete().eq("admin_email", targetEmail);

      return new Response(JSON.stringify({ success: true, message: "تم حذف سجل العميل" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
