// POS Public REST API — External POS integration endpoint
// Endpoints:
//   POST /pos-api/sales   — Record a POS sale (creates invoice + items, triggers recipe consumption)
//   POST /pos-api/items   — Bulk create/update menu items (upsert by external_code)
//   GET  /pos-api/stock   — Query current stock levels
//   GET  /pos-api/ping    — Health check
//
// Auth: X-API-Key header (from pos_api_keys table, SHA-256 hashed)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request) {
  const apiKey = req.headers.get("x-api-key") || req.headers.get("X-API-Key");
  if (!apiKey) return { error: json({ error: "Missing X-API-Key header" }, 401) };
  const hash = await sha256Hex(apiKey);
  const { data, error } = await supabase
    .from("pos_api_keys")
    .select("id, company_id, active, default_branch_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data) return { error: json({ error: "Invalid API key" }, 401) };
  if (!data.active) return { error: json({ error: "API key is disabled" }, 403) };
  // Fire-and-forget last_used_at update
  supabase.from("pos_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { keyRow: data };
}

// ---- Handlers ----

async function handleSales(req: Request, companyId: string, defaultBranchId: string | null) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON body" }, 400);

  const {
    branch_id = defaultBranchId,
    invoice_number,
    sale_date,
    payment_method = "cash",
    order_type = "dine_in",
    subtotal,
    tax_amount = 0,
    discount_amount = 0,
    total_amount,
    items = [],
    external_reference,
  } = body as Record<string, any>;

  if (!branch_id) return json({ error: "branch_id is required (or set default_branch_id on the API key)" }, 400);
  if (!Array.isArray(items) || items.length === 0) return json({ error: "items array is required" }, 400);
  if (total_amount == null) return json({ error: "total_amount is required" }, 400);

  // Resolve invoice number
  let invNum = invoice_number;
  if (!invNum) {
    const { data: gen } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
    invNum = gen;
  }

  // Resolve items by code or name
  const resolvedItems: any[] = [];
  for (const it of items) {
    const { code, name, quantity, unit_price, item_id } = it || {};
    if (!quantity || quantity <= 0) return json({ error: `Invalid quantity for item ${code || name}` }, 400);

    let posItem: any = null;
    if (item_id) {
      const { data } = await supabase.from("pos_items").select("id, price").eq("id", item_id).eq("company_id", companyId).maybeSingle();
      posItem = data;
    }
    if (!posItem && code) {
      const { data } = await supabase.from("pos_items").select("id, price").eq("code", code).eq("company_id", companyId).maybeSingle();
      posItem = data;
    }
    if (!posItem && name) {
      const { data } = await supabase.from("pos_items").select("id, price").eq("name", name).eq("company_id", companyId).maybeSingle();
      posItem = data;
    }
    if (!posItem) return json({ error: `Item not found: ${code || name}` }, 404);

    const price = unit_price ?? posItem.price ?? 0;
    resolvedItems.push({
      pos_item_id: posItem.id,
      quantity: Number(quantity),
      unit_price: Number(price),
      total_price: Number(price) * Number(quantity),
    });
  }

  // Insert sale
  const { data: sale, error: saleErr } = await supabase
    .from("pos_sales")
    .insert({
      company_id: companyId,
      branch_id,
      invoice_number: invNum,
      sale_date: sale_date || new Date().toISOString(),
      payment_method,
      order_type,
      subtotal: Number(subtotal ?? total_amount),
      tax_amount: Number(tax_amount),
      discount_amount: Number(discount_amount),
      total_amount: Number(total_amount),
      status: "مكتمل",
      notes: external_reference ? `External Ref: ${external_reference}` : null,
    })
    .select()
    .single();

  if (saleErr) return json({ error: "Failed to create sale", details: saleErr.message }, 500);

  const saleItemsPayload = resolvedItems.map((r) => ({ ...r, sale_id: sale.id }));
  const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItemsPayload);
  if (itemsErr) {
    await supabase.from("pos_sales").delete().eq("id", sale.id);
    return json({ error: "Failed to create sale items", details: itemsErr.message }, 500);
  }

  await supabase.from("pos_sync_logs").insert({
    company_id: companyId, source: "api", event: `Sale recorded (${invNum})`,
    status: "success", records_count: 1, error_count: 0,
    metadata: { sale_id: sale.id, items: resolvedItems.length },
  });
  return json({ success: true, sale_id: sale.id, invoice_number: invNum });
}


async function handleItemsUpsert(req: Request, companyId: string) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return json({ error: "items array required" }, 400);
  const results: any[] = [];
  for (const it of body.items) {
    const { code, name, price, category_id, branch_id } = it || {};
    if (!code || !name) { results.push({ code, ok: false, error: "code and name required" }); continue; }
    const { data: existing } = await supabase
      .from("pos_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", code)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("pos_items").update({ name, price: Number(price ?? 0) }).eq("id", existing.id);
      results.push({ code, ok: !error, id: existing.id, action: "updated", error: error?.message });
    } else {
      const { data, error } = await supabase.from("pos_items").insert({
        company_id: companyId, code, name, price: Number(price ?? 0), category_id: category_id || null, branch_id: branch_id || null, active: true,
      }).select("id").single();
      results.push({ code, ok: !error, id: data?.id, action: "created", error: error?.message });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  const errCount = results.length - okCount;
  await supabase.from("pos_sync_logs").insert({
    company_id: companyId, source: "api", event: `Items sync (${okCount} ok, ${errCount} failed)`,
    status: errCount > 0 ? "warning" : "success", records_count: okCount, error_count: errCount,
  });
  return json({ success: true, results });
}

async function handleStock(url: URL, companyId: string) {
  const branchId = url.searchParams.get("branch_id");
  const q = supabase
    .from("stock_item_locations")
    .select("stock_item_id, branch_id, warehouse_id, current_stock, stock_items!inner(id, name, code, unit, company_id)")
    .eq("stock_items.company_id", companyId);
  if (branchId) q.eq("branch_id", branchId);
  const { data, error } = await q.limit(1000);
  if (error) return json({ error: error.message }, 500);
  const items = (data || []).map((r: any) => ({
    stock_item_id: r.stock_item_id,
    code: r.stock_items?.code,
    name: r.stock_items?.name,
    unit: r.stock_items?.unit,
    branch_id: r.branch_id,
    warehouse_id: r.warehouse_id,
    current_stock: r.current_stock,
  }));
  return json({ success: true, count: items.length, items });
}

// ---- Router ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Strip supabase edge prefix
    const path = url.pathname.replace(/^\/pos-api/, "").replace(/^\//, "") || "ping";

    if (path === "ping" && req.method === "GET") {
      return json({ ok: true, service: "pos-api", time: new Date().toISOString() });
    }

    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { company_id: companyId, default_branch_id } = auth.keyRow!;

    if (path === "sales" && req.method === "POST") return handleSales(req, companyId, default_branch_id);
    if (path === "items" && req.method === "POST") return handleItemsUpsert(req, companyId);
    if (path === "stock" && req.method === "GET") return handleStock(url, companyId);

    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (e) {
    return json({ error: "Internal error", details: (e as Error).message }, 500);
  }
});
