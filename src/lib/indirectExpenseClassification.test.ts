import { describe, expect, it } from "vitest";
import {
  normalizeExpenseCategory,
  summarizeExpenseClassifications,
} from "./indirectExpenseClassification";

describe("indirect expense classifications", () => {
  it("keeps existing unclassified expenses as fixed", () => {
    expect(normalizeExpenseCategory(undefined)).toBe("fixed");
    expect(normalizeExpenseCategory("unknown")).toBe("fixed");
  });

  it("calculates each category independently against monthly sales", () => {
    const result = summarizeExpenseClassifications([
      { id: "rent", value: 10000, category: "fixed" },
      { id: "utilities", value: 4000, category: "variable" },
      { id: "salaries", value: 6000, category: "semi_variable" },
    ], 100000);

    expect(result.fixed).toEqual({ total: 10000, pct: 10 });
    expect(result.variable).toEqual({ total: 4000, pct: 4 });
    expect(result.semi_variable).toEqual({ total: 6000, pct: 6 });
    expect(result.grandTotal).toBe(20000);
    expect(result.grandPct).toBe(20);
  });

  it("does not duplicate custom or built-in expenses in the grand total", () => {
    const result = summarizeExpenseClassifications([
      { id: "rent", value: 5000 },
      { id: "custom:0", value: 1500, category: "variable" },
    ], 0);

    expect(result.grandTotal).toBe(6500);
    expect(result.grandPct).toBe(0);
    expect(result.fixed.total + result.variable.total + result.semi_variable.total).toBe(result.grandTotal);
  });
});
