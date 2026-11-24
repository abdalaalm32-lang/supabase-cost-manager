import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { aggregateDepartmentVariances, NO_DEPARTMENT_KEY } from "@/lib/departmentVarianceAggregation";

export const SHARED_OVERLAP_KEY = "__shared__";

export interface DepartmentVariance {
  departmentId: string;
  departmentName: string;
  varianceValue: number; // negative = deficit (loss)
}

export interface DepartmentVariancesResult {
  variances: DepartmentVariance[];
  totalDeficit: number; // positive number representing total net deficit (loss) to charge in P&L
  isLoading: boolean;
}

/**
 * Computes inventory variance (counted - book) per department for the given period.
 * Returns negative varianceValue = deficit (loss). The PnL page treats deficit as an
 * adjustment between Gross Profit and Operating Expenses (not as an operating expense
 * itself, to avoid double-counting since COGS in PnL uses theoretical recipe cost).
 */
export function useDepartmentVariances(
  dateFromStr: string,
  dateToStr: string,
  branchId?: string
): DepartmentVariancesResult {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const enabled = !!companyId && !!dateFromStr && !!dateToStr;
  const branchFilter = branchId && branchId !== "all" ? branchId : null;

  const dateFrom = dateFromStr ? new Date(dateFromStr) : null;
  const dateTo = dateToStr ? new Date(dateToStr) : null;

  const { data: departments } = useQuery({
    queryKey: ["dept-var-departments", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: categories } = useQuery({
    queryKey: ["dept-var-categories", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_categories")
        .select("id, department_id")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  // Extra group ↔ department links (a group can belong to several departments)
  const { data: categoryDeptLinks } = useQuery({
    queryKey: ["dept-var-category-dept-links", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_category_departments")
        .select("category_id, department_id")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  // Extra item ↔ group links (an item can belong to several groups)
  const { data: itemCategoryLinks } = useQuery({
    queryKey: ["dept-var-item-cat-links", companyId],
    queryFn: async () =>
      fetchAllRows<{ stock_item_id: string; category_id: string }>((from, to) =>
        supabase
          .from("stock_item_categories")
          .select("stock_item_id, category_id")
          .eq("company_id", companyId!)
          .order("stock_item_id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: stockItems, isLoading: l0 } = useQuery({
    queryKey: ["dept-var-stock-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("stock_items")
          .select("id, avg_cost, conversion_factor, department_id, category_id")
          .eq("company_id", companyId!)
          .eq("active", true)
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: branchCosts = [] } = useQuery({
    queryKey: ["dept-var-branch-costs", companyId, branchFilter],
    queryFn: async () => {
      if (!branchFilter) return [];
      return fetchAllRows<{ stock_item_id: string; avg_cost: number }>((from, to) =>
        supabase
          .from("stock_item_branch_costs")
          .select("stock_item_id, avg_cost")
          .eq("company_id", companyId!)
          .eq("branch_id", branchFilter)
          .order("stock_item_id")
          .range(from, to)
      );
    },
    enabled: !!companyId && !!branchFilter,
  });

  const { data: stocktakeData, isLoading: l1 } = useQuery({
    queryKey: ["dept-var-stocktakes", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("stocktake_items")
          .select("stock_item_id, counted_qty, stocktakes!inner(id, date, status, company_id, branch_id, warehouse_id)")
          .eq("stocktakes.company_id", companyId!)
          .eq("stocktakes.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: purchaseData, isLoading: l2 } = useQuery({
    queryKey: ["dept-var-purchases", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("purchase_items")
          .select("stock_item_id, quantity, purchase_orders!inner(date, status, company_id, branch_id)")
          .eq("purchase_orders.company_id", companyId!)
          .eq("purchase_orders.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: productionIngData, isLoading: l3 } = useQuery({
    queryKey: ["dept-var-prod-ing", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("production_ingredients")
          .select("stock_item_id, required_qty, production_records!inner(date, status, company_id, branch_id)")
          .eq("production_records.company_id", companyId!)
          .eq("production_records.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: productionRecords, isLoading: l4 } = useQuery({
    queryKey: ["dept-var-prod-rec", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("production_records")
          .select("product_id, produced_qty, date, status, company_id, branch_id")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: wasteData, isLoading: l5 } = useQuery({
    queryKey: ["dept-var-waste", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("waste_items")
          .select("stock_item_id, quantity, waste_records!inner(date, status, company_id, branch_id)")
          .eq("waste_records.company_id", companyId!)
          .eq("waste_records.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: transferData, isLoading: l6 } = useQuery({
    queryKey: ["dept-var-transfers", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("transfer_items")
          .select("stock_item_id, quantity, transfers!inner(date, status, company_id, source_id, destination_id)")
          .eq("transfers.company_id", companyId!)
          .eq("transfers.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: posSaleItems, isLoading: l7 } = useQuery({
    queryKey: ["dept-var-pos-sale-items", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("pos_sale_items")
          .select("pos_item_id, quantity, pos_sales!inner(date, status, company_id, branch_id)")
          .eq("pos_sales.company_id", companyId!)
          .eq("pos_sales.status", "مكتمل")
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const { data: recipeIngredients, isLoading: l8 } = useQuery({
    queryKey: ["dept-var-recipe-ingr", companyId],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("recipe_ingredients")
          .select("stock_item_id, qty, recipes!inner(menu_item_id, company_id)")
          .eq("recipes.company_id", companyId!)
          .order("id")
          .range(from, to)
      ),
    enabled: !!companyId,
  });

  const isLoading = l0 || l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8;

  // Helpers
  const inRange = (dateStr: string) => {
    if (!dateStr || !dateFrom || !dateTo) return false;
    const d = new Date(dateStr);
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    return d >= dateFrom && d <= end;
  };
  const beforeRange = (dateStr: string) => {
    if (!dateStr || !dateFrom) return false;
    return new Date(dateStr) < dateFrom;
  };

  // Branch cost map
  const branchCostMap = new Map<string, number>();
  branchCosts.forEach((bc) => {
    if (bc.stock_item_id && bc.avg_cost != null) {
      branchCostMap.set(bc.stock_item_id, Number(bc.avg_cost));
    }
  });
  const getCost = (itemId: string, globalCost: number) => {
    if (!branchFilter) return globalCost;
    const bc = branchCostMap.get(itemId);
    return bc != null ? bc : globalCost;
  };

  // Group → all its departments (primary + extra links) — same rule as variance analysis page
  const catDeptIds = new Map<string, Set<string>>();
  (categories || []).forEach((c: any) => {
    const set = new Set<string>();
    if (c.department_id) set.add(c.department_id);
    catDeptIds.set(c.id, set);
  });
  (categoryDeptLinks || []).forEach((l: any) => {
    if (!l.category_id || !l.department_id) return;
    if (!catDeptIds.has(l.category_id)) catDeptIds.set(l.category_id, new Set());
    catDeptIds.get(l.category_id)!.add(l.department_id);
  });
  // Item → extra groups
  const itemExtraCats = new Map<string, string[]>();
  (itemCategoryLinks || []).forEach((l) => {
    if (!l.stock_item_id || !l.category_id) return;
    if (!itemExtraCats.has(l.stock_item_id)) itemExtraCats.set(l.stock_item_id, []);
    itemExtraCats.get(l.stock_item_id)!.push(l.category_id);
  });

  // Build per-item calcs
  type Calc = {
    openQty: number;
    inQty: number;
    outQty: number;
    countQty: number;
    avgCost: number;
    deptIds: string[];
  };
  const itemCalc = new Map<string, Calc>();
  (stockItems || []).forEach((si: any) => {
    const depts = new Set<string>();
    const cats = [si.category_id, ...(itemExtraCats.get(si.id) || [])].filter(Boolean);
    for (const cid of cats) catDeptIds.get(cid)?.forEach((d) => depts.add(d));
    if (si.department_id) depts.add(si.department_id);
    itemCalc.set(si.id, {
      openQty: 0,
      inQty: 0,
      outQty: 0,
      countQty: 0,
      avgCost: getCost(si.id, Number(si.avg_cost || 0)),
      deptIds: Array.from(depts),
    });
  });

  // Opening qty: latest stocktake before dateFrom
  if (stocktakeData && dateFrom) {
    const latest = new Map<string, { qty: number; date: string }>();
    for (const si of stocktakeData) {
      const stDate = (si as any).stocktakes?.date;
      const brId = (si as any).stocktakes?.branch_id;
      if (!stDate || !beforeRange(stDate)) continue;
      if (branchFilter && brId !== branchFilter) continue;
      if (!si.stock_item_id) continue;
      const ex = latest.get(si.stock_item_id);
      if (!ex || stDate > ex.date) latest.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
    }
    for (const [id, d] of latest) {
      const c = itemCalc.get(id);
      if (c) c.openQty = d.qty;
    }
  }

  // Purchases IN
  (purchaseData || []).forEach((pi: any) => {
    const date = pi.purchase_orders?.date;
    const br = pi.purchase_orders?.branch_id;
    if (!inRange(date)) return;
    if (branchFilter && br !== branchFilter) return;
    const c = itemCalc.get(pi.stock_item_id);
    if (c) c.inQty += Number(pi.quantity || 0);
  });

  // Production produced IN
  (productionRecords || []).forEach((pr: any) => {
    if (!inRange(pr.date)) return;
    if (branchFilter && pr.branch_id !== branchFilter) return;
    const c = itemCalc.get(pr.product_id);
    if (c) c.inQty += Number(pr.produced_qty || 0);
  });

  // Production ingredients OUT
  (productionIngData || []).forEach((ing: any) => {
    const date = ing.production_records?.date;
    const br = ing.production_records?.branch_id;
    if (!inRange(date)) return;
    if (branchFilter && br !== branchFilter) return;
    const c = itemCalc.get(ing.stock_item_id);
    if (c) c.outQty += Number(ing.required_qty || 0);
  });

  // Waste OUT
  (wasteData || []).forEach((wi: any) => {
    const date = wi.waste_records?.date;
    const br = wi.waste_records?.branch_id;
    if (!inRange(date)) return;
    if (branchFilter && br !== branchFilter) return;
    const c = itemCalc.get(wi.stock_item_id);
    if (c) c.outQty += Number(wi.quantity || 0);
  });

  // Transfers (only when branch is selected)
  if (branchFilter) {
    (transferData || []).forEach((ti: any) => {
      const date = ti.transfers?.date;
      const src = ti.transfers?.source_id;
      const dst = ti.transfers?.destination_id;
      if (!inRange(date)) return;
      const c = itemCalc.get(ti.stock_item_id);
      if (!c) return;
      const qty = Number(ti.quantity || 0);
      if (src === branchFilter) c.outQty += qty;
      if (dst === branchFilter) c.inQty += qty;
    });
  }

  // POS sales consumption OUT (via recipes)
  const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
  const stockItemConv = new Map<string, number>();
  (stockItems || []).forEach((si: any) => stockItemConv.set(si.id, Number(si.conversion_factor) || 1));
  (recipeIngredients || []).forEach((ri: any) => {
    const menuId = ri.recipes?.menu_item_id;
    if (!menuId) return;
    if (!recipeMap.has(menuId)) recipeMap.set(menuId, []);
    const conv = stockItemConv.get(ri.stock_item_id) || 1;
    recipeMap.get(menuId)!.push({ stock_item_id: ri.stock_item_id, qty: Number(ri.qty || 0) / conv });
  });
  (posSaleItems || []).forEach((si: any) => {
    const date = si.pos_sales?.date;
    const br = si.pos_sales?.branch_id;
    if (!inRange(date)) return;
    if (branchFilter && br !== branchFilter) return;
    const ingrs = recipeMap.get(si.pos_item_id);
    if (!ingrs) return;
    for (const ing of ingrs) {
      const c = itemCalc.get(ing.stock_item_id);
      if (c) c.outQty += ing.qty * Number(si.quantity || 0);
    }
  });

  // Closing qty: latest stocktake within period
  if (stocktakeData) {
    const latest = new Map<string, { qty: number; date: string }>();
    for (const si of stocktakeData) {
      const stDate = (si as any).stocktakes?.date;
      const brId = (si as any).stocktakes?.branch_id;
      if (!stDate || !inRange(stDate)) continue;
      if (branchFilter && brId !== branchFilter) continue;
      if (!si.stock_item_id) continue;
      const ex = latest.get(si.stock_item_id);
      if (!ex || stDate > ex.date) latest.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
    }
    for (const [id, d] of latest) {
      const c = itemCalc.get(id);
      if (c) c.countQty = d.qty;
    }
  }

  // Aggregate per department: include only items that actually had a closing stocktake in period
  // (otherwise variance is meaningless — no count)
  const deptName = new Map<string, string>();
  (departments || []).forEach((d) => deptName.set(d.id, d.name));

  // Only consider items with a count (period closing stocktake)
  const itemsWithCount = new Set<string>();
  if (stocktakeData) {
    for (const si of stocktakeData) {
      const stDate = (si as any).stocktakes?.date;
      const brId = (si as any).stocktakes?.branch_id;
      if (!stDate || !inRange(stDate)) continue;
      if (branchFilter && brId !== branchFilter) continue;
      if (si.stock_item_id) itemsWithCount.add(si.stock_item_id);
    }
  }

  const itemVariances: { varianceValue: number; deptIds: string[] }[] = [];
  for (const [itemId, c] of itemCalc) {
    if (!itemsWithCount.has(itemId)) continue;
    const bookQty = c.openQty + c.inQty - c.outQty;
    const varQty = c.countQty - bookQty;
    if (Math.abs(varQty) < 0.01) continue;
    itemVariances.push({ varianceValue: varQty * c.avgCost, deptIds: c.deptIds });
  }
  // A material linked to several departments appears in each of them;
  // the double-counted part is returned as a separate adjustment row so the total counts it once.
  const { byDepartment: aggregate, sharedOverlap } = aggregateDepartmentVariances(itemVariances);

  const variances: DepartmentVariance[] = [];
  for (const [dKey, val] of aggregate) {
    if (Math.abs(val) < 0.5) continue;
    variances.push({
      departmentId: dKey,
      departmentName: dKey === NO_DEPARTMENT_KEY ? "بدون قسم" : deptName.get(dKey) || "قسم غير معروف",
      varianceValue: val,
    });
  }
  variances.sort((a, b) => a.varianceValue - b.varianceValue);
  if (Math.abs(sharedOverlap) >= 0.5) {
    variances.push({
      departmentId: SHARED_OVERLAP_KEY,
      departmentName: "خامات مشتركة بين الأقسام (تُحسب مرة واحدة في الإجمالي)",
      varianceValue: sharedOverlap,
    });
  }

  // totalDeficit = positive number representing net loss to charge in P&L
  const netVariance = variances.reduce((s, v) => s + v.varianceValue, 0);
  const totalDeficit = -netVariance; // deficit is positive when net variance is negative

  return { variances, totalDeficit, isLoading };
}
