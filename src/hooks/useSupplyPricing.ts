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
  packaging_cost: number;
  auto_calculate: boolean;
  manual_base_price: number | null;
  last_calculated_at: string | null;
  is_available_for_transfer?: boolean;
};

export type WarehouseOverheadExpense = {
  id: string;
  company_id: string;
  warehouse_id: string;
  pool_id?: string | null;
  expense_name: string;
  monthly_amount: number;
  is_active: boolean;
};

export type WarehouseOverheadMonthlyRate = {
  id: string;
  company_id: string;
  warehouse_id: string;
  pool_id: string | null;
  month: string; // 'YYYY-MM'
  expenses_total: number;
  transfers_total: number;
  rate: number; // percentage
  status: "estimated" | "actual" | "approved";
  notes?: string | null;
  created_at: string;
};

export type Warehouse = {
  id: string;
  name: string;
  code?: string | null;
  estimated_overhead_rate?: number | null;
};

/**
 * Final per-unit price for one item using monthly Overhead Rate model.
 *   base = WAC (or last purchase) + packaging
 *   withOverhead = base * (1 + overheadRate/100)
 *   withProfit = withOverhead * (1 + profit%/100)  (only if supply_type === cost_plus_profit)
 *   final = withProfit + transport/qty + loading/qty (per-invoice fees)
 */
export function computeSupplyPrice(opts: {
  wac: number;
  lastPurchasePrice?: number;
  currentStock?: number;
  pricing?: Partial<SupplyPricingRow> | null;
  policy?: Partial<BranchSupplyPolicy> | null;
  quantity?: number;
  overheadRate?: number; // percentage
  transportPerUnitOverride?: number;
  loadingPerUnitOverride?: number;
}): {
  baseCost: number;
  withOverhead: number;
  overheadAmount: number;
  overheadRate: number;
  withProfit: number;
  profitAmount: number;
  transportPerUnit: number;
  loadingPerUnit: number;
  finalUnitPrice: number;
} {
  const qty = Math.max(opts.quantity ?? 1, 1);
  const wacOrLast =
    (opts.currentStock ?? 0) > 0
      ? opts.wac ?? 0
      : opts.lastPurchasePrice ?? opts.wac ?? 0;

  const packaging = Number(opts.pricing?.packaging_cost ?? 0);
  const supplyType = opts.pricing?.supply_type ?? "cost_plus_profit";
  const autoCalc = opts.pricing?.auto_calculate ?? true;
  const manual = Number(opts.pricing?.manual_base_price ?? 0);

  const computedBase = wacOrLast + packaging;
  const baseCost = autoCalc || !manual ? computedBase : manual;

  const overheadRate = Number(opts.overheadRate ?? 0);
  const overheadAmount = baseCost * (overheadRate / 100);
  const withOverhead = baseCost + overheadAmount;

  const profitPct =
    supplyType === "cost_plus_profit"
      ? Number(opts.policy?.profit_percentage ?? 0)
      : 0;
  const profitAmount = withOverhead * (profitPct / 100);
  const withProfit = withOverhead + profitAmount;

  const transportPerUnit =
    opts.transportPerUnitOverride ?? Number(opts.policy?.transportation_cost ?? 0) / qty;
  const loadingPerUnit =
    opts.loadingPerUnitOverride ?? Number(opts.policy?.loading_cost ?? 0) / qty;

  const finalUnitPrice = withProfit + transportPerUnit + loadingPerUnit;

  return {
    baseCost,
    withOverhead,
    overheadAmount,
    overheadRate,
    withProfit,
    profitAmount,
    transportPerUnit,
    loadingPerUnit,
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

export function useWarehouseMonthlyRates(companyId?: string, warehouseId?: string) {
  return useQuery({
    queryKey: ["warehouse-monthly-rates", companyId, warehouseId],
    enabled: !!companyId && !!warehouseId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("warehouse_overhead_monthly_rates")
        .select("*")
        .eq("company_id", companyId)
        .eq("warehouse_id", warehouseId)
        .order("month", { ascending: false });
      return (data ?? []) as WarehouseOverheadMonthlyRate[];
    },
  });
}

/** Return the applicable overhead rate% for a warehouse at a given month (YYYY-MM).
 *  Priority: approved/actual saved row for that month → most recent approved row before it → warehouse estimated rate → 0. */
export async function resolveOverheadRate(warehouseId: string, month: string): Promise<number> {
  // saved rate for the month
  const { data: monthRow } = await (supabase as any)
    .from("warehouse_overhead_monthly_rates")
    .select("rate,status")
    .eq("warehouse_id", warehouseId)
    .eq("month", month)
    .maybeSingle();
  if (monthRow) return Number(monthRow.rate) || 0;

  // fallback: most recent prior month
  const { data: prior } = await (supabase as any)
    .from("warehouse_overhead_monthly_rates")
    .select("rate")
    .eq("warehouse_id", warehouseId)
    .lt("month", month)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior) return Number(prior.rate) || 0;

  // fallback: estimated rate on warehouse
  const { data: wh } = await (supabase as any)
    .from("warehouses")
    .select("estimated_overhead_rate")
    .eq("id", warehouseId)
    .maybeSingle();
  return Number(wh?.estimated_overhead_rate ?? 0);
}

/** Compute the monthly rate for a warehouse from actual expenses & transfers. */
export async function computeMonthlyRate(
  companyId: string,
  warehouseId: string,
  month: string, // YYYY-MM
): Promise<{ expenses: number; transfers: number; rate: number }> {
  const start = `${month}-01`;
  // last day of month
  const [y, m] = month.split("-").map(Number);
  const nextMonth = new Date(y, m, 1); // month is 1-based already advanced
  const end = nextMonth.toISOString().slice(0, 10);

  const [{ data: exp }, { data: trs }] = await Promise.all([
    (supabase as any)
      .from("warehouse_overhead_expenses")
      .select("monthly_amount,is_active")
      .eq("company_id", companyId)
      .eq("warehouse_id", warehouseId),
    (supabase as any)
      .from("transfers")
      .select("total_cost,status,date,source_id")
      .eq("company_id", companyId)
      .eq("source_id", warehouseId)
      .in("status", ["مكتمل", "مؤرشف"])
      .gte("date", start)
      .lt("date", end),
  ]);

  const expenses = (exp ?? []).filter((r: any) => r.is_active).reduce((s: number, r: any) => s + Number(r.monthly_amount || 0), 0);
  const transfers = (trs ?? []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);
  const rate = transfers > 0 ? (expenses / transfers) * 100 : 0;
  return { expenses, transfers, rate };
}

export async function getLastPurchasePrice(stockItemId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("purchase_items")
    .select("unit_price")
    .eq("stock_item_id", stockItemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.unit_price ?? 0);
}
