export const EXPENSE_CATEGORIES = ["fixed", "variable", "semi_variable"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fixed: "Fixed — ثابت",
  variable: "Variable — متغير",
  semi_variable: "Semi Variable — شبه متغير",
};

export interface ClassifiedExpenseValue {
  id: string;
  value: number;
  category?: string | null;
}

export interface ExpenseCategorySummary {
  total: number;
  pct: number;
}

export type ExpenseClassificationSummary = Record<ExpenseCategory, ExpenseCategorySummary> & {
  grandTotal: number;
  grandPct: number;
};

export const normalizeExpenseCategory = (value: unknown): ExpenseCategory =>
  EXPENSE_CATEGORIES.includes(value as ExpenseCategory) ? (value as ExpenseCategory) : "fixed";

export const summarizeExpenseClassifications = (
  items: ClassifiedExpenseValue[],
  monthlySales: number,
): ExpenseClassificationSummary => {
  const summary: ExpenseClassificationSummary = {
    fixed: { total: 0, pct: 0 },
    variable: { total: 0, pct: 0 },
    semi_variable: { total: 0, pct: 0 },
    grandTotal: 0,
    grandPct: 0,
  };

  for (const item of items) {
    const value = Number(item.value) || 0;
    const category = normalizeExpenseCategory(item.category);
    summary[category].total += value;
    summary.grandTotal += value;
  }

  for (const category of EXPENSE_CATEGORIES) {
    summary[category].pct = monthlySales > 0 ? (summary[category].total / monthlySales) * 100 : 0;
  }
  summary.grandPct = monthlySales > 0 ? (summary.grandTotal / monthlySales) * 100 : 0;

  return summary;
};
