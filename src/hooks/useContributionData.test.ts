import { describe, expect, it } from "vitest";
import { buildContributionItems, getContributionExpenses } from "./useContributionData";
import { splitContributionExpenses } from "@/lib/contributionAnalysis";

describe("contribution real-source mapping", () => {
  const source = {
    branches: [], periods: [], companyName: "شركة",
    items: [{ id: "a", name: "صنف", code: "1", price: 100, branch_id: "branch", category: "مطبخ" }],
    recipes: [{ menu_item_id: "a", recipe_ingredients: [{ stock_item_id: "stock", qty: 2, stock_items: { avg_cost: 99, conversion_factor: 2 } }] }],
    costs: [{ branch_id: "branch", stock_item_id: "stock", avg_cost: 40 }, { branch_id: "warehouse", stock_item_id: "stock", avg_cost: 80 }],
    settings: [{ pos_item_id: "a", side_cost: 3, consumables_pct: 0, packing_cost: 2 }],
    side: [{ period_id: "p", category_name: "مطبخ", cost: 4 }],
    packing: [{ period_id: "p", category_name: "مطبخ", cost: 1 }],
  };
  it("uses sale-branch WAC and complete menu direct costs without adding indirect costs", () => {
    const result = buildContributionItems(source, [{ pos_item_id: "a", branch_id: "branch", quantity: 5, revenue: 450 }], { id: "p", default_consumables_pct: 10 });
    expect(result[0].directUnitCost).toBe(50);
    expect(result[0].quantity).toBe(5);
    expect(result[0].revenue).toBe(450);
    expect(result[0].missingCost).toBe(false);
  });
  it("keeps sold products without recipes visible and flags their missing cost", () => {
    const result = buildContributionItems({ ...source, recipes: [] }, [{ pos_item_id: "a", branch_id: "branch", quantity: 1, revenue: 100 }], { id: "p" });
    expect(result[0].missingCost).toBe(true);
    expect(result[0].revenue).toBe(100);
  });
  it("reads semi-variable split from existing period and custom-expense JSON", () => {
    const result = splitContributionExpenses(getContributionExpenses({ bills: 10000, expense_classifications: { bills: "semi_variable", __semi_variable_fixed_parts: { bills: 4000 } }, custom_expenses: [{ name: "أخرى", value: 5000, category: "semi_variable", fixed_part: 2000 }] }));
    expect(result).toEqual({ fixed: 6000, variable: 9000, unresolved: [] });
  });
});