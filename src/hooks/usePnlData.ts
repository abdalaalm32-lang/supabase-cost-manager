import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/lib/fetchAllRows";

export interface CategoryCogs {
  category: string;
  amount: number;
  salesAmount: number;
}

export interface IndirectExpenseItem {
  name: string;
  amount: number;
  isManual?: boolean;
}

export type CostingMethod = "perpetual" | "periodic";

export interface PeriodicBreakdown {
  openingStock: number;
  purchases: number;
  closingStock: number;
  openingDate: string | null;
  closingDate: string | null;
}

export interface PnlResult {
  grossSales: number;
  taxAmount: number;
  discountAmount: number;
  netSales: number;
  cogsByCategory: CategoryCogs[];
  totalCogs: number;
  grossProfit: number;
  grossProfitPct: number;
  indirectExpenses: IndirectExpenseItem[];
  totalIndirectExpenses: number;
  wasteCost: number;
  netProfit: number;
  netProfitPct: number;
  salesCount: number;
  costingMethod: CostingMethod;
  periodicBreakdown?: PeriodicBreakdown;
  isLoading: boolean;
}

export function usePnlData(
  dateFrom: string,
  dateTo: string,
  branchId?: string,
  manualExpenses: IndirectExpenseItem[] = [],
  deletedAutoExpenses: Set<string> = new Set(),
  autoExpenseOverrides: Record<string, number> = {},
  lockedAutoExpenses: IndirectExpenseItem[] | null = null,
  costingMethod: CostingMethod = "perpetual",
): PnlResult {

  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const enabled = !!companyId && !!dateFrom && !!dateTo;

  // 1. Sales
  const { data: sales, isLoading: l1 } = useQuery({
    queryKey: ["pnl-sales", companyId, dateFrom, dateTo, branchId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) => {
        let q = supabase
          .from("pos_sales")
          .select("id, total_amount, tax_amount, discount_amount, discount_in_pnl, date, branch_id")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .gte("date", `${dateFrom}T00:00:00`)
          .lte("date", `${dateTo}T23:59:59`);
        if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
        return q.order("id").range(from, to);
      }),
    enabled,
  });

  // 2. Sale items
  const saleIds = (sales || []).map((s) => s.id);
  const { data: saleItems, isLoading: l2 } = useQuery({
    queryKey: ["pnl-sale-items", saleIds],
    queryFn: async () => {
      if (!saleIds.length) return [];
      const all: any[] = [];
      for (let i = 0; i < saleIds.length; i += 50) {
        const slice = saleIds.slice(i, i + 50);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase
            .from("pos_sale_items")
            .select("pos_item_id, quantity, total")
            .in("sale_id", slice)
            .order("id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: saleIds.length > 0,
  });

  // 3. POS items
  const { data: posItems } = useQuery({
    queryKey: ["pnl-pos-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("pos_items").select("id, name, category")
          .eq("company_id", companyId!).order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // 4. Recipes
  const { data: recipes } = useQuery({
    queryKey: ["pnl-recipes", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("recipes").select("id, menu_item_id")
          .eq("company_id", companyId!).order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // 5. Recipe ingredients
  const { data: recipeIngredients } = useQuery({
    queryKey: ["pnl-recipe-ingr", (recipes || []).map((r) => r.id).join(",")],
    queryFn: async () => {
      const ids = (recipes || []).map((r) => r.id);
      if (!ids.length) return [];
      const all: any[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const slice = ids.slice(i, i + 50);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase
            .from("recipe_ingredients")
            .select("recipe_id, stock_item_id, qty")
            .in("recipe_id", slice)
            .order("id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: (recipes || []).length > 0,
  });

  // 6. Stock items
  const { data: stockItems } = useQuery({
    queryKey: ["pnl-stock-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("stock_items").select("id, avg_cost, conversion_factor")
          .eq("company_id", companyId!).order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // 6b. Per-branch costs (fallback to global avg_cost when branch not selected or row missing)
  const branchCostFilter = branchId && branchId !== "all" ? branchId : null;
  const { data: branchCosts = [] } = useQuery({
    queryKey: ["pnl-branch-costs", companyId, branchCostFilter],
    queryFn: async () => {
      if (!branchCostFilter) return [];
      return fetchAllRows<{ stock_item_id: string; avg_cost: number }>((from, to) =>
        supabase
          .from("stock_item_branch_costs")
          .select("stock_item_id, avg_cost")
          .eq("company_id", companyId!)
          .eq("branch_id", branchCostFilter)
          .order("stock_item_id").range(from, to)
      );
    },
    enabled: !!companyId && !!branchCostFilter,
  });

  // 7. Costing periods (for indirect expenses)
  const { data: costingPeriods } = useQuery({
    queryKey: ["pnl-costing", companyId, branchId],
    queryFn: async () => {
      let q = supabase
        .from("menu_costing_periods")
        .select("*")
        .eq("company_id", companyId!);
      if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });
  // 9. Periodic costing data (only when method === "periodic")
  const periodicEnabled = enabled && costingMethod === "periodic";
  const { data: periodStocktakes, isLoading: lStk } = useQuery({
    queryKey: ["pnl-periodic-stocktakes", companyId, dateFrom, dateTo, branchId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) => {
        let q = supabase
          .from("stocktakes")
          .select("id, date, branch_id, status, type, total_actual_value")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .neq("type", "فحص مخزون فوري")
          .gte("date", dateFrom)
          .lte("date", dateTo);
        if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
        return q.order("date").range(from, to);
      }),
    enabled: periodicEnabled,
  });

  const { data: periodPurchases, isLoading: lPur } = useQuery({
    queryKey: ["pnl-periodic-purchases", companyId, dateFrom, dateTo, branchId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) => {
        let q = supabase
          .from("purchase_orders")
          .select("id, date, branch_id, status, total_amount")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .gte("date", dateFrom)
          .lte("date", dateTo);
        if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
        return q.order("date").range(from, to);
      }),
    enabled: periodicEnabled,
  });

  // 8. Waste
  const { data: wasteRecords, isLoading: l3 } = useQuery({
    queryKey: ["pnl-waste", companyId, dateFrom, dateTo, branchId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) => {
        let q = supabase
          .from("waste_records" as any)
          .select("total_cost")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .gte("date", dateFrom)
          .lte("date", dateTo);
        if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
        return q.order("id").range(from, to);
      }),
    enabled,
  });


  // ---- Compute P&L ----
  const grossSales = (sales || []).reduce(
    (s, r) => s + Number(r.total_amount || 0),
    0
  );
  const taxAmount = (sales || []).reduce(
    (s, r) => s + Number(r.tax_amount || 0),
    0
  );
  const discountAmount = (sales || []).reduce(
    (s, r) => s + (r.discount_in_pnl === false ? 0 : Number(r.discount_amount || 0)),
    0
  );
  const netSales = grossSales - taxAmount - discountAmount;

  // Build maps
  const posItemMap = new Map<string, any>();
  (posItems || []).forEach((p) => posItemMap.set(p.id, p));

  const recipeMap = new Map<string, string>();
  (recipes || []).forEach((r) => recipeMap.set(r.menu_item_id, r.id));

  const ingrByRecipe = new Map<string, any[]>();
  (recipeIngredients || []).forEach((ri) => {
    if (!ingrByRecipe.has(ri.recipe_id)) ingrByRecipe.set(ri.recipe_id, []);
    ingrByRecipe.get(ri.recipe_id)!.push(ri);
  });

  const stockMap = new Map<string, any>();
  (stockItems || []).forEach((si) => stockMap.set(si.id, si));

  // Build per-branch cost map (only used when a specific branch is selected)
  const branchCostMap = new Map<string, number>();
  branchCosts.forEach((bc) => {
    if (bc.stock_item_id && bc.avg_cost != null) {
      branchCostMap.set(bc.stock_item_id, Number(bc.avg_cost));
    }
  });
  const resolveCost = (stockItemId: string, globalCost: number): number => {
    if (!branchCostFilter) return globalCost;
    const bc = branchCostMap.get(stockItemId);
    return bc != null ? bc : globalCost;
  };

  // COGS by category
  const cogsByCat: Record<string, { cost: number; sales: number }> = {};
  (saleItems || []).forEach((si) => {
    const posItem = posItemMap.get(si.pos_item_id);
    const cat = posItem?.category || "غير مصنف";
    if (!cogsByCat[cat]) cogsByCat[cat] = { cost: 0, sales: 0 };
    cogsByCat[cat].sales += Number(si.total || 0);

    const recipeId = recipeMap.get(si.pos_item_id);
    if (recipeId) {
      const ingredients = ingrByRecipe.get(recipeId) || [];
      let recipeCost = 0;
      ingredients.forEach((ing) => {
        const stock = stockMap.get(ing.stock_item_id);
        if (stock) {
          const conv = Number(stock.conversion_factor) || 1;
          const unitCost = resolveCost(ing.stock_item_id, Number(stock.avg_cost || 0));
          recipeCost += (Number(ing.qty) / conv) * unitCost;
        }
      });
      cogsByCat[cat].cost += recipeCost * Number(si.quantity);
    }
  });

  const cogsByCategory: CategoryCogs[] = Object.entries(cogsByCat)
    .map(([category, { cost, sales: salesAmount }]) => ({
      category,
      amount: cost,
      salesAmount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalCogs = cogsByCategory.reduce((s, c) => s + c.amount, 0);
  const grossProfit = netSales - totalCogs;
  const grossProfitPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  // Indirect expenses from costing period
  const relevantPeriod = (costingPeriods || []).find(
    (p) => p.start_date <= dateTo && p.end_date >= dateFrom
  );

  // Indirect expenses are now ONLY manual entries added by the user in the P&L page.
  // Auto-import from menu costing periods has been disabled per user request.
  const autoExpenses: IndirectExpenseItem[] = [];
  void relevantPeriod;
  void deletedAutoExpenses;
  void autoExpenseOverrides;
  void lockedAutoExpenses;

  const allExpenses = [...manualExpenses];
  const totalIndirectExpenses = allExpenses.reduce(
    (s, e) => s + e.amount,
    0
  );

  const wasteCost = (wasteRecords || []).reduce(
    (s, r) => s + Number(r.total_cost || 0),
    0
  );

  const netProfit = grossProfit - totalIndirectExpenses - wasteCost;
  const netProfitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  return {
    grossSales,
    taxAmount,
    discountAmount,
    netSales,
    cogsByCategory,
    totalCogs,
    grossProfit,
    grossProfitPct,
    indirectExpenses: allExpenses,
    totalIndirectExpenses,
    wasteCost,
    netProfit,
    netProfitPct,
    salesCount: (sales || []).length,
    isLoading: l1 || l2 || l3,
  };
}
