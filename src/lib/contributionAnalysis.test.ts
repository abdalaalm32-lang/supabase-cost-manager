import { describe, expect, it } from "vitest";
import { calculateContributionAnalysis, discountContributionLines, splitContributionExpenses } from "./contributionAnalysis";

const items = [
  { id: "a", name: "أ", code: "1", quantity: 10, revenue: 1000, directUnitCost: 40 },
  { id: "b", name: "ب", code: "2", quantity: 5, revenue: 1000, directUnitCost: 60 },
];
describe("contribution and profitability", () => {
  it("calculates direct cost as actual quantity times unit cost", () => {
    expect(calculateContributionAnalysis(items, 300, 200, 30).direct).toBe(700);
  });
  it("deducts variable indirect expenses once from contribution", () => {
    const result = calculateContributionAnalysis(items, 300, 200, 30);
    expect(result.contribution).toBe(1100);
    expect(result.contributionPct).toBeCloseTo(55);
    expect(result.rows.reduce((sum, row) => sum + row.variableShare, 0)).toBe(200);
  });
  it("deducts fixed expenses once, independently of allocation method", () => {
    for (const method of ["revenue", "quantity"] as const) {
      const result = calculateContributionAnalysis(items, 300, 200, 30, method);
      expect(result.net).toBe(800);
      expect(result.rows.reduce((sum, row) => sum + row.net, 0)).toBeCloseTo(800);
    }
  });
  it("calculates period and daily BEP and margin of safety", () => {
    const result = calculateContributionAnalysis(items, 300, 200, 30);
    expect(result.bep).toBeCloseTo(300 / 0.55);
    expect(result.dailyBep).toBeCloseTo(300 / 0.55 / 30);
    expect(result.safetyPct).toBeCloseTo((2000 - 300 / 0.55) / 2000 * 100);
  });
  it("does not invent a BEP when contribution is negative or sales are zero", () => {
    expect(calculateContributionAnalysis(items, 300, 2000, 30).bep).toBeNull();
    const result = calculateContributionAnalysis([], 300, 200, 30);
    expect(result.bep).toBeNull();
    expect(result.net).toBe(-500);
  });
  it("separates semi-variable parts without double counting and defaults old expenses to fixed", () => {
    expect(splitContributionExpenses([
      { id: "1", name: "إيجار", value: 300 },
      { id: "2", name: "كهرباء", value: 100, category: "semi_variable", fixedPart: 40, variablePart: 60 },
      { id: "3", name: "متغير", value: 200, category: "variable" },
    ])).toEqual({ fixed: 340, variable: 260, unresolved: [] });
  });
  it("flags missing semi-variable splits instead of treating them as zero", () => {
    expect(splitContributionExpenses([{ id: "1", name: "كهرباء", value: 100, category: "semi_variable" }]).unresolved).toEqual(["كهرباء"]);
  });
  it("distributes invoice discounts pro rata across recorded item revenues", () => {
    const rows = discountContributionLines([
      { pos_item_id: "a", quantity: 2, unit_price: 100, total: 200 },
      { pos_item_id: "b", quantity: 1, unit_price: 100, total: 100 },
    ], 30);
    expect(rows.map(row => row.revenue)).toEqual([180, 90]);
  });
  it("deducts returned quantities and revenue from actual activity", () => {
    const result = calculateContributionAnalysis([{ ...items[0], quantity: 9, revenue: 900 }], 0, 0, 30);
    expect(result.direct).toBe(360);
    expect(result.contribution).toBe(540);
  });
});