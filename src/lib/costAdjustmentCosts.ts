import { supabase } from "@/integrations/supabase/client";
import { setBranchCost } from "@/lib/branchCostUtils";

export type CostAdjustmentDestinationType = "branch" | "warehouse" | "";

export function getCostAdjustmentLocationId(
  destinationType: CostAdjustmentDestinationType,
  destinationId: string,
): string | null {
  if ((destinationType === "branch" || destinationType === "warehouse") && destinationId) {
    return destinationId;
  }
  return null;
}

export async function applyCompletedCostAdjustmentCosts(params: {
  companyId: string;
  destinationType: CostAdjustmentDestinationType;
  destinationId: string;
  items: Array<{ stock_item_id: string; new_cost: number }>;
}): Promise<void> {
  const { companyId, destinationType, destinationId, items } = params;
  const locationId = getCostAdjustmentLocationId(destinationType, destinationId);

  for (const item of items) {
    if (!item.stock_item_id || item.new_cost <= 0) continue;

    const { error } = await supabase
      .from("stock_items")
      .update({ standard_cost: item.new_cost, avg_cost: item.new_cost })
      .eq("id", item.stock_item_id);
    if (error) throw error;

    // stock_item_branch_costs.branch_id stores both branch and warehouse IDs.
    if (locationId) {
      await setBranchCost({
        companyId,
        stockItemId: item.stock_item_id,
        branchId: locationId,
        newAvgCost: Number(item.new_cost),
      });
    }
  }
}
