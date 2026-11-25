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
export function calculateIncomingWeightedAverage(params: {
  oldStock: number;
  oldAverageCost: number;
  incomingQty: number;
  incomingUnitCost: number;
}): number {
  const oldStock = Math.max(Number(params.oldStock) || 0, 0);
  const oldAverageCost = Math.max(Number(params.oldAverageCost) || 0, 0);
  const incomingQty = Math.max(Number(params.incomingQty) || 0, 0);
  const incomingUnitCost = Math.max(Number(params.incomingUnitCost) || 0, 0);
  const totalStock = oldStock + incomingQty;

  if (totalStock <= 0) return 0;
  if (oldStock <= 0) return incomingUnitCost;
  return (oldStock * oldAverageCost + incomingQty * incomingUnitCost) / totalStock;
}

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
  const totalStock = oldStock + incQty;
  const newAvg = calculateIncomingWeightedAverage({
    oldStock,
    oldAverageCost: oldAvg,
    incomingQty: incQty,
    incomingUnitCost,
  });

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
    date?: string | null;
    created_at?: string | null;
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
      .select("quantity, unit_cost, purchase_orders!inner(company_id, status, branch_id, warehouse_id, date, created_at)")
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
    const qty = Math.max(Number(row.quantity ?? 0), 0);
    const unitCost = Math.max(Number(row.unit_cost ?? 0), 0);
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
 * Weighted average of the stock that is actually ON HAND.
 * Walks completed purchases from newest to oldest and only takes enough
 * quantity to cover the current on-hand stock. Quantities that were already
 * consumed (sold, transferred, wasted) no longer affect the average, so when
 * the old stock ran out, a new purchase sets the average to its own price.
 * If on-hand stock is 0, the latest purchase price is used.
 */
export function calculateOnHandAverage(
  rows: PurchaseItemCostRow[],
  onHand: number,
  openingAverageCost = 0,
): number {
  const sorted = [...rows]
    .filter((r) => Number(r.quantity ?? 0) > 0)
    .sort((a, b) => {
      const ka = `${a.purchase_orders?.date ?? ""}|${a.purchase_orders?.created_at ?? ""}`;
      const kb = `${b.purchase_orders?.date ?? ""}|${b.purchase_orders?.created_at ?? ""}`;
      return kb.localeCompare(ka);
    });
  const target = Math.max(Number(onHand) || 0, 0);
  if (sorted.length === 0) {
    return target > 0 ? Math.max(Number(openingAverageCost ?? 0), 0) : 0;
  }
  if (target <= 0.0005) return Math.max(Number(sorted[0].unit_cost ?? 0), 0);

  let remaining = target;
  let qty = 0;
  let value = 0;
  for (const row of sorted) {
    if (remaining <= 0) break;
    const q = Math.min(Number(row.quantity ?? 0), remaining);
    qty += q;
    value += q * Math.max(Number(row.unit_cost ?? 0), 0);
    remaining -= q;
  }

  // On-hand stock can include an opening balance, production, or transfers
  // that are not purchase invoice rows. Keep that quantity in the denominator
  // and value it at the location's previous average instead of inflating WAC
  // by dividing only by the purchased quantity.
  if (remaining > 0) {
    qty += remaining;
    value += remaining * Math.max(Number(openingAverageCost ?? 0), 0);
  }

  return qty > 0 ? value / qty : 0;
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
  /** Actual on-hand stock at the location AFTER the change (if known). */
  onHandStock?: number;
}): Promise<number> {
  const { companyId, stockItemId, locationId, onHandStock } = params;
  const rows = await fetchCompletedPurchaseCostRows({ companyId, stockItemId });
  const locationRows = rows.filter((row) => {
    const po = row.purchase_orders;
    return po?.branch_id === locationId || po?.warehouse_id === locationId;
  });
  const { data: existingCost } = await supabase
    .from("stock_item_branch_costs")
    .select("avg_cost")
    .eq("stock_item_id", stockItemId)
    .eq("branch_id", locationId)
    .maybeSingle();

  let avgCost: number;
  let stock: number;
  if (typeof onHandStock === "number" && Number.isFinite(onHandStock)) {
    stock = Math.max(onHandStock, 0);
    const previousAverageCost = existingCost
      ? Number(existingCost.avg_cost ?? 0)
      : await getBranchCost(stockItemId, locationId);
    avgCost = calculateOnHandAverage(locationRows, stock, previousAverageCost);
  } else {
    const r = calculateWeightedPurchaseAverage(locationRows);
    avgCost = r.avgCost;
    stock = r.totalQty;
  }

  await upsertBranchCost({
    companyId,
    stockItemId,
    branchId: locationId,
    newAvgCost: avgCost,
    newStock: stock,
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
  const [{ data: actualStockResult }, { data: existingItem }] = await Promise.all([
    supabase.rpc("get_actual_global_stock", { p_stock_item_id: stockItemId }),
    supabase.from("stock_items").select("avg_cost").eq("id", stockItemId).maybeSingle(),
  ]);
  const currentStock = Math.max(Number(actualStockResult ?? 0), 0);
  const avgCost = calculateOnHandAverage(
    rows,
    currentStock,
    Number(existingItem?.avg_cost ?? 0),
  );

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
  /** Optional on-hand stock after the change: onHand[locationId][stockItemId]. */
  onHand?: Record<string, Map<string, number>>;
}): Promise<void> {
  const { companyId, stockItemIds, locationIds = [], onHand } = params;
  const uniqueItemIds = Array.from(new Set(stockItemIds.filter(Boolean)));
  const uniqueLocationIds = Array.from(new Set(locationIds.filter(Boolean) as string[]));

  for (const stockItemId of uniqueItemIds) {
    await recalculateGlobalPurchaseCost({ companyId, stockItemId });
    for (const locationId of uniqueLocationIds) {
      await recalculateLocationPurchaseCost({
        companyId,
        stockItemId,
        locationId,
        onHandStock: onHand?.[locationId]?.get(stockItemId),
      });
    }
  }
}
