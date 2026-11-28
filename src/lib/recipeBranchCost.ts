export interface RecipeBranchCostRow {
  branch_id: string;
  stock_item_id: string;
  avg_cost: number | string | null;
}

export const recipeBranchCostKey = (branchId: string, stockItemId: string) =>
  `${branchId}::${stockItemId}`;

export function buildRecipeBranchCostMap(rows: RecipeBranchCostRow[]) {
  const costs = new Map<string, number>();
  for (const row of rows) {
    if (row.branch_id && row.stock_item_id && row.avg_cost != null) {
      costs.set(recipeBranchCostKey(row.branch_id, row.stock_item_id), Number(row.avg_cost));
    }
  }
  return costs;
}

/** Matches Recipes: use the item's own branch cost, with the global cost only as a fallback. */
export function resolveRecipeIngredientCost(
  costs: Map<string, number>,
  branchId: string | null | undefined,
  stockItemId: string,
  globalCost: number | string | null | undefined,
): number {
  const fallback = Number(globalCost ?? 0);
  if (!branchId) return fallback;
  return costs.get(recipeBranchCostKey(branchId, stockItemId)) ?? fallback;
}
