import { describe, expect, it } from "vitest";
import { calculateDisplayedInventoryValue, roundCurrency } from "./inventoryValue";

describe("displayed inventory value", () => {
  it("uses the displayed two-decimal average cost for the kofta example", () => {
    const exactAverage = 425 / 5.5;

    expect(roundCurrency(exactAverage)).toBe(77.27);
    expect(calculateDisplayedInventoryValue(5.5, exactAverage)).toBe(424.99);
  });

  it("rounds an exact half up to two decimals", () => {
    expect(roundCurrency(424.985)).toBe(424.99);
  });

  it("keeps the row total and displayed average consistent for another item", () => {
    expect(calculateDisplayedInventoryValue(2, 10.555)).toBe(21.12);
  });
});
