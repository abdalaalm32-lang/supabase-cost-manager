/**
 * Branch Cost Utilities
 * --------------------------------------------------
 * Helper functions to read & update per-branch weighted-average costs
 * stored in the `stock_item_branch_costs` table.
 *
 * These helpers run in parallel with the legacy `stock_items.avg_cost`
 * (kept as a fallback) so existing reports keep working until they are
 * migrated to read from the per-branch table.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Get current avg_cost for a stock item at a specific branch.
 * Falls back to `stock_items.avg_cost` if no per-branch row exists.
 */
export async function getBranchCost(
  stockItemId: string,
  branchId: string,
): Promise<number> {
  const { data } = await supabase
    .from("stock_item_branch_costs")
    .select("avg_cost")
    .eq("stock_item_id", stockItemId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (data && data.avg_cost != null) return Number(data.avg_cost);

  // Fallback to global avg_cost
  const { data: si } = await supabase
    .from("stock_items")
    .select("avg_cost")
    .eq("id", stockItemId)
    .maybeSingle();

  return Number(si?.avg_cost) || 0;
}

/**
 * Upsert the avg_cost for a stock item at a specific branch.
 * If the row exists -> update; otherwise -> insert.
 */
export async function upsertBranchCost(params: {
  companyId: string;
  stockItemId: string;
  branchId: string;
  newAvgCost: number;
  newStock?: number;
}): Promise<void> {
  const { companyId, stockItemId, branchId, newAvgCost, newStock } = params;

  const { data: existing } = await supabase
    .from("stock_item_branch_costs")
    .select("id")
    .eq("stock_item_id", stockItemId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (existing) {
    const updatePayload: any = { avg_cost: newAvgCost };
    if (typeof newStock === "number") updatePayload.current_stock = newStock;
    await supabase
      .from("stock_item_branch_costs")
      .update(updatePayload)
      .eq("id", existing.id);
  } else {
    await supabase.from("stock_item_branch_costs").insert({
      company_id: companyId,
      stock_item_id: stockItemId,
      branch_id: branchId,
      avg_cost: newAvgCost,
      current_stock: newStock ?? 0,
    });
  }
}

/**
 * Apply weighted-average update for a branch when stock comes IN
 * (purchases, transfers IN, production OUT-as-product).
 *
 * Formula:
 *   newAvg = ((oldStock * oldAvg) + (incomingQty * incomingUnitCost))
 *            / (oldStock + incomingQty)
 *
 * If the existing branch stock is 0 (or unknown), the incoming unit cost
 * becomes the new average (avoid divide-by-zero).
 */
export async function applyBranchCostIn(params: {
  companyId: string;
  stockItemId: string;
  branchId: string;
  incomingQty: number;
  incomingUnitCost: number;
  /**
   * Current branch stock BEFORE this incoming movement (optional).
   * If not provided, will read from the table (current_stock column).
   */
  branchStockBefore?: number;
}): Promise<number> {
  const {
    companyId,
    stockItemId,
    branchId,
    incomingQty,
    incomingUnitCost,
    branchStockBefore,
  } = params;

  // Read existing branch row (cost + stock)
  const { data: existing } = await supabase
    .from("stock_item_branch_costs")
    .select("id, avg_cost, current_stock")
    .eq("stock_item_id", stockItemId)
    .eq("branch_id", branchId)
    .maybeSingle();

  const oldAvg = existing
    ? Number(existing.avg_cost) || 0
    : await getBranchCost(stockItemId, branchId); // fallback to global

  const oldStock =
    typeof branchStockBefore === "number"
      ? Math.max(branchStockBefore, 0)
      : Number(existing?.current_stock) || 0;

  const incQty = Math.max(Number(incomingQty) || 0, 0);
  const incCost = Math.max(Number(incomingUnitCost) || 0, 0);

  const totalStock = oldStock + incQty;
  const newAvg =
    oldStock <= 0 || totalStock <= 0
      ? incCost
      : (oldStock * oldAvg + incQty * incCost) / totalStock;

  await upsertBranchCost({
    companyId,
    stockItemId,
    branchId,
    newAvgCost: newAvg,
    newStock: totalStock,
  });

  return newAvg;
}

/**
 * Set an explicit avg_cost for a branch (used by Cost Adjustment).
 */
export async function setBranchCost(params: {
  companyId: string;
  stockItemId: string;
  branchId: string;
  newAvgCost: number;
}): Promise<void> {
  const { companyId, stockItemId, branchId, newAvgCost } = params;
  await upsertBranchCost({ companyId, stockItemId, branchId, newAvgCost });
}

type PurchaseItemCostRow = {
  quantity: number | string | null;
  unit_cost: number | string | null;
  purchase_orders?: {
    branch_id: string | null;
    warehouse_id: string | null;
  } | null;
};

async function fetchCompletedPurchaseCostRows(params: {
  companyId: string;
  stockItemId: string;
}): Promise<PurchaseItemCostRow[]> {
  const { companyId, stockItemId } = params;
  const pageSize = 1000;
  let from = 0;
  const rows: PurchaseItemCostRow[] = [];

  while (from < 100000) {
    const { data, error } = await supabase
      .from("purchase_items")
      .select("quantity, unit_cost, purchase_orders!inner(company_id, status, branch_id, warehouse_id)")
      .eq("stock_item_id", stockItemId)
      .eq("purchase_orders.company_id", companyId)
      .eq("purchase_orders.status", "مكتمل")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as any[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function calculateWeightedPurchaseAverage(rows: PurchaseItemCostRow[]): {
  totalQty: number;
  avgCost: number;
} {
  let totalQty = 0;
  let totalValue = 0;

  for (const row of rows) {
    const qty = Math.max(Number(row.quantity) || 0, 0);
    const unitCost = Math.max(Number(row.unit_cost) || 0, 0);
    if (qty <= 0) continue;
    totalQty += qty;
    totalValue += qty * unitCost;
  }

  return {
    totalQty,
    avgCost: totalQty > 0 ? totalValue / totalQty : 0,
  };
}

/**
 * Rebuild a location WAC from the currently completed purchase invoices.
 * This is used after editing, deleting, or archiving purchases so stale or
 * previously polluted averages are replaced by the true weighted average.
 */
export async function recalculateLocationPurchaseCost(params: {
  companyId: string;
  stockItemId: string;
  locationId: string;
}): Promise<number> {
  const { companyId, stockItemId, locationId } = params;
  const rows = await fetchCompletedPurchaseCostRows({ companyId, stockItemId });
  const locationRows = rows.filter((row) => {
    const po = row.purchase_orders;
    return po?.branch_id === locationId || po?.warehouse_id === locationId;
  });
  const { totalQty, avgCost } = calculateWeightedPurchaseAverage(locationRows);

  await upsertBranchCost({
    companyId,
    stockItemId,
    branchId: locationId,
    newAvgCost: avgCost,
    newStock: totalQty,
  });

  return avgCost;
}

/**
 * Rebuild the global fallback average from all currently completed purchases
 * for this stock item, and sync global current_stock from the inventory
 * movement function when available.
 */
export async function recalculateGlobalPurchaseCost(params: {
  companyId: string;
  stockItemId: string;
}): Promise<number> {
  const { companyId, stockItemId } = params;
  const rows = await fetchCompletedPurchaseCostRows({ companyId, stockItemId });
  const { avgCost } = calculateWeightedPurchaseAverage(rows);

  const { data: actualStockResult } = await supabase.rpc("get_actual_global_stock", {
    p_stock_item_id: stockItemId,
  });
  const currentStock = Math.max(Number(actualStockResult) || 0, 0);

  await supabase
    .from("stock_items")
    .update({ avg_cost: avgCost, current_stock: currentStock })
    .eq("id", stockItemId);

  return avgCost;
}

export async function recalculatePurchaseCostsForItems(params: {
  companyId: string;
  stockItemIds: string[];
  locationIds?: Array<string | null | undefined>;
}): Promise<void> {
  const { companyId, stockItemIds, locationIds = [] } = params;
  const uniqueItemIds = Array.from(new Set(stockItemIds.filter(Boolean)));
  const uniqueLocationIds = Array.from(new Set(locationIds.filter(Boolean) as string[]));

  for (const stockItemId of uniqueItemIds) {
    await recalculateGlobalPurchaseCost({ companyId, stockItemId });
    for (const locationId of uniqueLocationIds) {
      await recalculateLocationPurchaseCost({ companyId, stockItemId, locationId });
    }
  }
}
