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
