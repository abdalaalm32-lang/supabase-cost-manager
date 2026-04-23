/**
 * useBranchCosts
 * --------------------------------------------------
 * Fetches per-branch (or per-warehouse) average costs from
 * `stock_item_branch_costs` and returns a helper to read the
 * cost for a stock item with automatic fallback to the global
 * `stock_items.avg_cost`.
 *
 * Usage:
 *   const { getCost } = useBranchCosts(locationId);
 *   const cost = getCost(item.id, item.avg_cost);
 *
 * - If `locationId` is null/undefined → always returns the global fallback.
 * - If a per-branch cost row exists → returns it.
 * - Otherwise → returns the global fallback (so old reports keep working).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useBranchCosts(locationId: string | null | undefined) {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const enabled = !!companyId && !!locationId;

  const { data: branchCosts = [] } = useQuery({
    queryKey: ["branch-costs", companyId, locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, avg_cost")
        .eq("branch_id", locationId!);
      if (error) throw error;
      return data as { stock_item_id: string; avg_cost: number }[];
    },
    enabled,
    staleTime: 30000,
  });

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of branchCosts) {
      if (row.stock_item_id && row.avg_cost != null) {
        map.set(row.stock_item_id, Number(row.avg_cost));
      }
    }
    return map;
  }, [branchCosts]);

  /**
   * Get the cost for a stock item.
   * @param stockItemId - The stock item id.
   * @param fallbackGlobalCost - The global avg_cost (from stock_items table).
   * @returns Branch-specific cost if available, else global fallback.
   */
  const getCost = (
    stockItemId: string | null | undefined,
    fallbackGlobalCost: number | string | null | undefined,
  ): number => {
    const fallback = Number(fallbackGlobalCost) || 0;
    if (!stockItemId || !locationId) return fallback;
    const branchCost = costMap.get(stockItemId);
    return branchCost != null ? branchCost : fallback;
  };

  return { costMap, getCost, isLocationFiltered: !!locationId };
}
