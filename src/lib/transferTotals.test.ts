import { describe, it, expect } from "vitest";
import { transferGrandTotal, roundUpWhole } from "./transferTotals";
describe("transfer totals", () => {
  it("adds transport and loading to items cost", () => {
    expect(transferGrandTotal({ total_cost: 199.5, transportation_cost: 100, loading_cost: 100 })).toBe(399.5);
  });
  it("rounds fractions up to a whole number", () => {
    expect(roundUpWhole(6156.324896)).toBe(6157);
    expect(roundUpWhole(6156)).toBe(6156);
  });
});
