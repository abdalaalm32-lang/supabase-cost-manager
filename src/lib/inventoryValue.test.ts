import { describe, expect, it } from "vitest";
import { calculateDisplayedInventoryValue, roundCurrency } from "./inventoryValue";

describe("displayed inventory value", () => {
  it("shows three average-cost decimals while preserving the kofta inventory total", () => {
    const exactAverage = 425 / 5.5;

    expect(Number(exactAverage.toFixed(3))).toBe(77.273);
    expect(calculateDisplayedInventoryValue(5.5, exactAverage)).toBe(425);
  });

  it("rounds an exact half up to two decimals", () => {
    expect(roundCurrency(424.985)).toBe(424.99);
  });

  it("rounds only the final value for another item", () => {
    expect(calculateDisplayedInventoryValue(2, 10.555)).toBe(21.11);
  });
});
