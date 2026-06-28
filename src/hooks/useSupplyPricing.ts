import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AllocationMethod = "value" | "weight" | "volume" | "quantity" | "manual";

export type BranchSupplyPolicy = {
  id: string;
  company_id: string;
  branch_id: string;
  profit_percentage: number;
  transportation_cost: number;
  loading_cost: number;
  minimum_order_value: number;
  is_active: boolean;
  allocation_method?: AllocationMethod;
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
  is_available_for_transfer?: boolean;
  manual_overhead_share?: number;
  unit_weight?: number;
  unit_volume?: number;
};

export type WarehouseOverheadExpense = {
  id: string;
  company_id: string;
  warehouse_id: string;
  expense_name: string;
  monthly_amount: number;
  is_active: boolean;
};

/**
 * Compute per-item basis for allocation given a method.
 */
export function allocationBasis(
  item: { current_stock?: number; avg_cost?: number; unit_weight?: number; unit_volume?: number; manual_share?: number },
  method: AllocationMethod,
): number {
  const qty = Number(item.current_stock ?? 0);
  switch (method) {
    case "value":
      return qty * Number(item.avg_cost ?? 0);
    case "weight":
      return qty * Number(item.unit_weight ?? 0);
    case "volume":
      return qty * Number(item.unit_volume ?? 0);
    case "quantity":
      return qty;
    case "manual":
      return Number(item.manual_share ?? 0);
  }
}

/**
 * Allocate a total charge (e.g. overhead, transport+loading) across items by chosen method.
 * Returns map of itemId -> share amount.
 */
export function allocateCharge<T extends { id: string }>(
  items: (T & {
    current_stock?: number;
    avg_cost?: number;
    unit_weight?: number;
    unit_volume?: number;
    manual_share?: number;
    quantity?: number;
  })[],
  totalCharge: number,
  method: AllocationMethod,
  useTransferQty = false,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!totalCharge || items.length === 0) {
    items.forEach((i) => (out[i.id] = 0));
    return out;
  }
  const bases = items.map((i) => {
    if (useTransferQty && method !== "manual") {
      // use transfer line quantity if provided, else fall back to current_stock
      const qty = Number(i.quantity ?? i.current_stock ?? 0);
      switch (method) {
        case "value": return qty * Number(i.avg_cost ?? 0);
        case "weight": return qty * Number(i.unit_weight ?? 0);
        case "volume": return qty * Number(i.unit_volume ?? 0);
        case "quantity": return qty;
      }
    }
    return allocationBasis(
      {
        current_stock: i.current_stock,
        avg_cost: i.avg_cost,
        unit_weight: i.unit_weight,
        unit_volume: i.unit_volume,
        manual_share: i.manual_share,
      },
      method,
    );
  });
  const sum = bases.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // fallback: equal split
    const eq = totalCharge / items.length;
    items.forEach((i) => (out[i.id] = eq));
    return out;
  }
  items.forEach((i, idx) => {
    out[i.id] = (bases[idx] / sum) * totalCharge;
  });
  return out;
}

/**
 * Final per-unit price for one item — accepts precomputed overhead and transport per-unit.
 */
export function computeSupplyPrice(opts: {
  wac: number;
  lastPurchasePrice?: number;
  currentStock?: number;
  pricing?: Partial<SupplyPricingRow> | null;
  policy?: Partial<BranchSupplyPolicy> | null;
  quantity?: number;
  overheadPerUnit?: number;
  transportPerUnitOverride?: number;
  loadingPerUnitOverride?: number;
}): {
  baseCost: number;
  withProfit: number;
  transportPerUnit: number;
  loadingPerUnit: number;
  overheadPerUnit: number;
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

  const overheadPerUnit = Number(opts.overheadPerUnit ?? 0);
  const computedBase = wacOrLast + manufacturing + packaging + overheadPerUnit;
  const baseCost = autoCalc || !manual ? computedBase : manual;

  const profitPct =
    supplyType === "cost_plus_profit"
      ? Number(opts.policy?.profit_percentage ?? 0)
      : 0;
  const profitAmount = baseCost * (profitPct / 100);
  const withProfit = baseCost + profitAmount;

  const transportPerUnit =
    opts.transportPerUnitOverride ?? Number(opts.policy?.transportation_cost ?? 0) / qty;
  const loadingPerUnit =
    opts.loadingPerUnitOverride ?? Number(opts.policy?.loading_cost ?? 0) / qty;

  const finalUnitPrice = withProfit + transportPerUnit + loadingPerUnit;

  return {
    baseCost,
    withProfit,
    transportPerUnit,
    loadingPerUnit,
    overheadPerUnit,
    profitAmount,
    finalUnitPrice,
  };
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

export function useWarehouseOverhead(companyId?: string, warehouseId?: string) {
  return useQuery({
    queryKey: ["warehouse-overhead", companyId, warehouseId],
    enabled: !!companyId && !!warehouseId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("warehouse_overhead_expenses")
        .select("*")
        .eq("company_id", companyId)
        .eq("warehouse_id", warehouseId);
      return (data ?? []) as WarehouseOverheadExpense[];
    },
  });
}

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
