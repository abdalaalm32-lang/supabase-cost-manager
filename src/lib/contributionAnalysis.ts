import { normalizeExpenseCategory } from "./indirectExpenseClassification";

export interface ContributionExpense {
  id: string;
  name: string;
  value: number;
  category?: string | null;
  fixedPart?: number;
  variablePart?: number;
}

export function splitContributionExpenses(expenses: ContributionExpense[]) {
  let fixed = 0, variable = 0;
  const unresolved: string[] = [];
  for (const expense of expenses) {
    const category = normalizeExpenseCategory(expense.category);
    if (category === "fixed") fixed += expense.value;
    else if (category === "variable") variable += expense.value;
    else if (expense.value !== 0) {
      const { fixedPart, variablePart } = expense;
      if (fixedPart == null || variablePart == null || fixedPart < 0 || variablePart < 0 || Math.abs(fixedPart + variablePart - expense.value) > 0.005) {
        unresolved.push(expense.name);
      } else {
        fixed += fixedPart;
        variable += variablePart;
      }
    }
  }
  return { fixed, variable, unresolved };
}

export interface ContributionSourceItem {
  id: string;
  name: string;
  code: string;
  quantity: number;
  revenue: number;
  directUnitCost: number;
  missingCost?: boolean;
}

export function calculateContributionAnalysis(items: ContributionSourceItem[], fixed: number, variable: number, days: number, allocation: "revenue" | "quantity" = "revenue") {
  const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const direct = items.reduce((sum, item) => sum + item.quantity * item.directUnitCost, 0);
  const rows = items.map(item => {
    const variableShare = revenue > 0 ? variable * item.revenue / revenue : 0;
    const fixedShare = allocation === "quantity"
      ? (quantity > 0 ? fixed * item.quantity / quantity : 0)
      : (revenue > 0 ? fixed * item.revenue / revenue : 0);
    const directTotal = item.quantity * item.directUnitCost;
    const variableTotal = directTotal + variableShare;
    const contribution = item.revenue - variableTotal;
    const net = contribution - fixedShare;
    return { ...item, price: item.quantity !== 0 ? item.revenue / item.quantity : null, directTotal, variableShare, variableTotal,
      unitContribution: item.quantity !== 0 ? contribution / item.quantity : null,
      contribution, contributionPct: item.revenue > 0 ? contribution / item.revenue * 100 : null,
      fixedShare, net, netPct: item.revenue > 0 ? net / item.revenue * 100 : null };
  });
  // Restaurant totals deduct each period expense exactly once, regardless of item allocation.
  const contribution = revenue - direct - variable;
  const ratio = revenue > 0 ? contribution / revenue : null;
  const bep = ratio != null && ratio > 0 ? fixed / ratio : null;
  return { rows, revenue, quantity, direct, variable, fixed, contribution, contributionPct: ratio == null ? null : ratio * 100,
    net: contribution - fixed, bep, dailyBep: bep != null && days > 0 ? bep / days : null,
    safetyPct: bep != null && revenue > 0 ? (revenue - bep) / revenue * 100 : null };
}

export interface ContributionSaleLine { pos_item_id: string | null; quantity: number; unit_price: number; total: number }
export function discountContributionLines(lines: ContributionSaleLine[], discount: number) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.total ?? line.quantity * line.unit_price), 0);
  const factor = subtotal > 0 ? Math.max(0, (subtotal - discount) / subtotal) : 1;
  return lines.map(line => ({ ...line, revenue: Number(line.total ?? line.quantity * line.unit_price) * factor }));
}