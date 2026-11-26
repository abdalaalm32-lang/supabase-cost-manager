import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { discountContributionLines, type ContributionExpense, type ContributionSourceItem } from "@/lib/contributionAnalysis";

export const contributionExpenseFields = [
  { id: "rent", name: "الإيجار" }, { id: "salaries", name: "المرتبات" },
  { id: "bills", name: "الفواتير" }, { id: "media", name: "الميديا والتسويق" },
  { id: "maintenance", name: "الصيانة" }, { id: "other_expenses", name: "أخرى" },
] as const;

export function getContributionExpenses(period: any): ContributionExpense[] {
  if (!period) return [];
  const classifications = period.expense_classifications ?? {};
  const parts = classifications.__semi_variable_fixed_parts ?? {};
  return [
    ...contributionExpenseFields.map(field => ({
      ...field, value: Number(period[field.id] ?? 0), category: classifications[field.id],
      fixedPart: parts[field.id], variablePart: parts[field.id] == null ? undefined : Number(period[field.id] ?? 0) - Number(parts[field.id]),
    })),
    ...(Array.isArray(period.custom_expenses) ? period.custom_expenses : []).map((expense: any, index: number) => ({
      id: `custom:${index}`, name: expense.name, value: Number(expense.value ?? 0), category: expense.category,
      fixedPart: expense.fixed_part, variablePart: expense.fixed_part == null ? undefined : Number(expense.value ?? 0) - Number(expense.fixed_part),
    })),
  ];
}

export function useContributionSources(companyId: string | undefined) {
  return useQuery({
    queryKey: ["contribution-sources", companyId], enabled: Boolean(companyId), staleTime: 0,
    queryFn: async () => {
      if (!companyId) throw new Error("لم يتم تحديد الشركة");
      const load = (table: any, selection = "*") => fetchAllRows<any>((from, to) => supabase.from(table).select(selection).eq("company_id", companyId).order("id").range(from, to));
      const [branches, periods, items, recipes, costs, settings, packing, side, company] = await Promise.all([
        load("branches", "id,name"), load("menu_costing_periods"),
        load("pos_items", "*, categories:category_id(name,code)"),
        load("recipes", "id,menu_item_id,recipe_ingredients(stock_item_id,qty,stock_items:stock_item_id(avg_cost,conversion_factor))"),
        load("stock_item_branch_costs", "branch_id,stock_item_id,avg_cost"), load("pos_item_cost_settings"),
        load("category_packing_items"), load("category_side_costs"),
        supabase.from("companies").select("name").eq("id", companyId).single(),
      ]);
      if (company.error) throw company.error;
      return { branches, periods: periods.sort((a, b) => b.start_date.localeCompare(a.start_date)), items, recipes, costs, settings, packing, side, companyName: company.data.name };
    },
  });
}

export function useContributionActivity(companyId: string | undefined, branchId: string, period: any) {
  return useQuery({
    queryKey: ["contribution-activity", companyId, branchId, period?.id, period?.start_date, period?.end_date],
    enabled: Boolean(companyId && period), staleTime: 0,
    queryFn: async () => {
      if (!companyId || !period) throw new Error("اختر فترة التحليل");
      const start = new Date(`${period.start_date}T00:00:00`).toISOString();
      const endDate = new Date(`${period.end_date}T00:00:00`);
      endDate.setDate(endDate.getDate() + 1);
      const end = endDate.toISOString();
      const [sales, returns] = await Promise.all([
        fetchAllRows<any>((from, to) => {
          let query = supabase.from("pos_sales").select("id,branch_id,discount_amount").eq("company_id", companyId).eq("status", "مكتمل").gte("date", start).lt("date", end).order("id");
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          let query = supabase.from("pos_returns").select("id,branch_id").eq("company_id", companyId).gte("date", start).lt("date", end).order("id");
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(from, to);
        }),
      ]);
      const loadLines = async (table: "pos_sale_items" | "pos_return_items", field: "sale_id" | "return_id", parents: any[]) => {
        const lines: any[] = [];
        for (let i = 0; i < parents.length; i += 150) {
          lines.push(...await fetchAllRows<any>((from, to) => supabase.from(table as any).select("*").in(field, parents.slice(i, i + 150).map(parent => parent.id)).order("id").range(from, to)));
        }
        return lines;
      };
      const [saleLines, returnLines] = await Promise.all([loadLines("pos_sale_items", "sale_id", sales), loadLines("pos_return_items", "return_id", returns)]);
      const bySale = new Map<string, any[]>();
      for (const line of saleLines) {
        const lines = bySale.get(line.sale_id) ?? [];
        lines.push(line); bySale.set(line.sale_id, lines);
      }
      const activity: any[] = [];
      for (const sale of sales) {
        for (const line of discountContributionLines(bySale.get(sale.id) ?? [], Number(sale.discount_amount ?? 0))) {
          activity.push({ ...line, branch_id: sale.branch_id });
        }
      }
      const returnMap = new Map(returns.map(record => [record.id, record]));
      for (const line of returnLines) {
        activity.push({ ...line, branch_id: returnMap.get(line.return_id)?.branch_id, quantity: -Number(line.quantity), revenue: -Number(line.total) });
      }
      return { activity, invoiceCount: sales.length, returnCount: returns.length };
    },
  });
}

export function buildContributionItems(source: NonNullable<ReturnType<typeof useContributionSources>["data"]>, activity: any[], period: any): ContributionSourceItem[] {
  const costs = new Map(source.costs.map(row => [`${row.branch_id}:${row.stock_item_id}`, Number(row.avg_cost)]));
  const recipes = new Map(source.recipes.map(row => [row.menu_item_id, row]));
  const settings = new Map(source.settings.map(row => [row.pos_item_id, row]));
  const items = new Map(source.items.map(row => [row.id, row]));
  const norm = (value: string) => value.trim().replace(/\s+/g, " ");
  const totals = new Map<string, any>();
  for (const line of activity) {
    const original = items.get(line.pos_item_id);
    // Imported invoices can reference the same named product from another branch.
    const matches = original && original.branch_id !== line.branch_id
      ? source.items.filter(item => item.branch_id === line.branch_id && norm(item.name) === norm(original.name)) : [];
    const item = matches.length === 1 ? matches[0] : original;
    const key = `${line.branch_id}:${item?.id ?? line.pos_item_id ?? line.item_name ?? "missing"}`;
    const total = totals.get(key) ?? { item, branchId: line.branch_id, quantity: 0, revenue: 0, name: item?.name ?? line.item_name ?? "صنف غير مرتبط بالمنيو" };
    total.quantity += Number(line.quantity); total.revenue += Number(line.revenue);
    totals.set(key, total);
  }
  return Array.from(totals.entries()).map(([id, aggregate]) => {
    const { item, branchId, quantity, revenue, name } = aggregate;
    const recipe = recipes.get(item?.id);
    const override = settings.get(item?.id);
    let main = 0;
    for (const ingredient of recipe?.recipe_ingredients ?? []) {
      const stock = ingredient.stock_items;
      const factor = Number(stock?.conversion_factor ?? 1);
      if (factor <= 0) continue;
      const cost = costs.get(`${branchId}:${ingredient.stock_item_id}`) ?? Number(stock?.avg_cost ?? 0);
      main += Number(ingredient.qty) * cost / factor;
    }
    const category = item?.categories?.name ?? item?.category ?? "بدون تصنيف";
    const sum = (rows: any[]) => rows.filter(row => row.period_id === period.id && row.category_name === category).reduce((total, row) => total + Number(row.cost), 0);
    const kitchen = Array.isArray(period.consumables_kitchen_categories) ? period.consumables_kitchen_categories : [];
    const bar = Array.isArray(period.consumables_bar_categories) ? period.consumables_bar_categories : [];
    const defaultPct = bar.includes(category) ? (period.default_consumables_pct_bar ?? period.default_consumables_pct) : (kitchen.length === 0 || kitchen.includes(category) ? period.default_consumables_pct : 0);
    const consumables = Number(item?.price ?? 0) * Number(override?.consumables_pct ?? defaultPct ?? 0) / 100;
    const directUnitCost = main + Number(override?.side_cost ?? 0) + sum(source.side) + consumables + sum(source.packing) + Number(override?.packing_cost ?? 0);
    return { id, name, code: item?.code ?? "", quantity, revenue, directUnitCost, missingCost: !item || !recipe };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}