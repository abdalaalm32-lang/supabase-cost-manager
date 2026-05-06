import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  isLoading: boolean;
}

export function usePnlData(
  dateFrom: string,
  dateTo: string,
  branchId?: string,
  manualExpenses: IndirectExpenseItem[] = [],
  deletedAutoExpenses: Set<string> = new Set(),
  autoExpenseOverrides: Record<string, number> = {}
): PnlResult {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const enabled = !!companyId && !!dateFrom && !!dateTo;

  // 1. Sales
  const { data: sales, isLoading: l1 } = useQuery({
    queryKey: ["pnl-sales", companyId, dateFrom, dateTo, branchId],
    queryFn: async () => {
      let q = supabase
        .from("pos_sales")
        .select("id, total_amount, tax_amount, discount_amount, discount_in_pnl, date, branch_id")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل")
        .gte("date", `${dateFrom}T00:00:00`)
        .lte("date", `${dateTo}T23:59:59`);
      if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return (data as any[]) || [];
    },
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
        const { data } = await supabase
          .from("pos_sale_items")
          .select("pos_item_id, quantity, total")
          .in("sale_id", saleIds.slice(i, i + 50));
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: saleIds.length > 0,
  });

  // 3. POS items
  const { data: posItems } = useQuery({
    queryKey: ["pnl-pos-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_items")
        .select("id, name, category")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  // 4. Recipes
  const { data: recipes } = useQuery({
    queryKey: ["pnl-recipes", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recipes")
        .select("id, menu_item_id")
        .eq("company_id", companyId!);
      return data || [];
    },
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
        const { data } = await supabase
          .from("recipe_ingredients")
          .select("recipe_id, stock_item_id, qty")
          .in("recipe_id", ids.slice(i, i + 50));
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: (recipes || []).length > 0,
  });

  // 6. Stock items
  const { data: stockItems } = useQuery({
    queryKey: ["pnl-stock-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("id, avg_cost, conversion_factor")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  // 6b. Per-branch costs (fallback to global avg_cost when branch not selected or row missing)
  const branchCostFilter = branchId && branchId !== "all" ? branchId : null;
  const { data: branchCosts = [] } = useQuery({
    queryKey: ["pnl-branch-costs", companyId, branchCostFilter],
    queryFn: async () => {
      if (!branchCostFilter) return [];
      const { data } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, avg_cost")
        .eq("company_id", companyId!)
        .eq("branch_id", branchCostFilter);
      return (data as { stock_item_id: string; avg_cost: number }[]) || [];
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

  // 8. Waste
  const { data: wasteRecords, isLoading: l3 } = useQuery({
    queryKey: ["pnl-waste", companyId, dateFrom, dateTo, branchId],
    queryFn: async () => {
      let q = supabase
        .from("waste_records" as any)
        .select("total_cost")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل")
        .gte("date", dateFrom)
        .lte("date", dateTo);
      if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return (data as any[]) || [];
    },
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
    (s, r) => s + Number(r.discount_amount || 0),
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

  const autoExpenses: IndirectExpenseItem[] = [];
  if (relevantPeriod) {
    const fields: [string, string][] = [
      ["rent", "الإيجار"],
      ["salaries", "الرواتب"],
      ["bills", "الفواتير"],
      ["maintenance", "الصيانة"],
      ["media", "الدعاية والإعلان"],
      ["other_expenses", "مصاريف أخرى"],
    ];
    fields.forEach(([key, name]) => {
      if (deletedAutoExpenses.has(name)) return;
      const rawVal = Number((relevantPeriod as any)[key] || 0);
      const val = name in autoExpenseOverrides ? autoExpenseOverrides[name] : rawVal;
      if (val > 0) autoExpenses.push({ name, amount: val });
    });
    const custom = relevantPeriod.custom_expenses as any;
    if (Array.isArray(custom)) {
      custom.forEach((ce: any) => {
        const ceName = ce.name;
        if (deletedAutoExpenses.has(ceName)) return;
        const rawAmount = Number(ce.amount || ce.value || 0);
        const val = ceName in autoExpenseOverrides ? autoExpenseOverrides[ceName] : rawAmount;
        if (val > 0)
          autoExpenses.push({
            name: ceName,
            amount: val,
          });
      });
    }
  }

  const allExpenses = [...autoExpenses, ...manualExpenses];
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
