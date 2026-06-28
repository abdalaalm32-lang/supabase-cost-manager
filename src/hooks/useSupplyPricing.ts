import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BranchSupplyPolicy = {
  id: string;
  company_id: string;
  branch_id: string;
  profit_percentage: number;
  transportation_cost: number;
  loading_cost: number;
  minimum_order_value: number;
  is_active: boolean;
};

export type SupplyPricingRow = {
  id: string;
  company_id: string;
  stock_item_id: string;
  supply_type: "cost" | "cost_plus_profit";
  manufacturing_cost: number;
  packaging_cost: number;
  auto_calculate: boolean;
  manual_base_price: number | null;
  last_calculated_at: string | null;
};

/**
 * Compute final transfer price for one branch.
 * Formula:
 *   base = WAC + manufacturing + packaging  (or manual_base_price)
 *   if supply_type=cost_plus_profit: base *= (1 + profit%/100)
 *   final = base + transport/qty + loading/qty
 */
export function computeSupplyPrice(opts: {
  wac: number;
  lastPurchasePrice?: number;
  currentStock?: number;
  pricing?: Partial<SupplyPricingRow> | null;
  policy?: Partial<BranchSupplyPolicy> | null;
  quantity?: number; // for transport/loading allocation; defaults to 1
}): {
  baseCost: number;
  withProfit: number;
  transportPerUnit: number;
  loadingPerUnit: number;
  profitAmount: number;
  finalUnitPrice: number;
} {
  const qty = Math.max(opts.quantity ?? 1, 1);
  const wacOrLast =
    (opts.currentStock ?? 0) > 0
      ? opts.wac ?? 0
      : opts.lastPurchasePrice ?? opts.wac ?? 0;

  const manufacturing = Number(opts.pricing?.manufacturing_cost ?? 0);
  const packaging = Number(opts.pricing?.packaging_cost ?? 0);
  const supplyType = opts.pricing?.supply_type ?? "cost_plus_profit";
  const autoCalc = opts.pricing?.auto_calculate ?? true;
  const manual = Number(opts.pricing?.manual_base_price ?? 0);

  const computedBase = wacOrLast + manufacturing + packaging;
  const baseCost = autoCalc || !manual ? computedBase : manual;

  const profitPct =
    supplyType === "cost_plus_profit"
      ? Number(opts.policy?.profit_percentage ?? 0)
      : 0;
  const profitAmount = baseCost * (profitPct / 100);
  const withProfit = baseCost + profitAmount;

  const transportPerUnit = Number(opts.policy?.transportation_cost ?? 0) / qty;
  const loadingPerUnit = Number(opts.policy?.loading_cost ?? 0) / qty;

  const finalUnitPrice = withProfit + transportPerUnit + loadingPerUnit;

  return { baseCost, withProfit, transportPerUnit, loadingPerUnit, profitAmount, finalUnitPrice };
}

export function useSupplyPricing(companyId?: string) {
  return useQuery({
    queryKey: ["supply-pricing", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("stock_item_supply_pricing")
        .select("*")
        .eq("company_id", companyId);
      return (data ?? []) as SupplyPricingRow[];
    },
  });
}

export function useBranchPolicies(companyId?: string) {
  return useQuery({
    queryKey: ["branch-supply-policies", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("branch_supply_policies")
        .select("*")
        .eq("company_id", companyId);
      return (data ?? []) as BranchSupplyPolicy[];
    },
  });
}

/** Get last purchase unit price for an item */
export async function getLastPurchasePrice(stockItemId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("purchase_items")
    .select("unit_price, purchase_orders!inner(date, status)")
    .eq("stock_item_id", stockItemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.unit_price ?? 0);
}
