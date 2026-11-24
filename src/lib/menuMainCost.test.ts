import { describe, expect, it } from "vitest";
import { calculateMenuMainCost } from "./menuMainCost";

describe("calculateMenuMainCost", () => {
  it("divides the sum of main costs by the sum of selling prices, not average item percentages", () => {
    const result = calculateMenuMainCost([
      { mainCost: 20, price: 100 },
      { mainCost: 90, price: 300 },
    ]);
    expect(result.totalMainCost).toBe(110);
    expect(result.totalPrice).toBe(400);
    expect(result.percentage).toBeCloseTo(27.5, 10);
  });

  it("uses only main cost even when items have other costs and sales quantities", () => {
    const items = [{ mainCost: 25, price: 100, sideCost: 10, packingCost: 5, indirectExpenses: 15, quantity: 20 }];
    expect(calculateMenuMainCost(items).percentage).toBe(25);
  });

  it("uses the selected channel selling price", () => {
    const items = [{ mainCost: 30, price: 150, base_price: 100 }];
    expect(calculateMenuMainCost(items).percentage).toBe(20);
  });

  it("returns zero for an empty menu or zero total selling price", () => {
    expect(calculateMenuMainCost([]).percentage).toBe(0);
    expect(calculateMenuMainCost([{ mainCost: 25, price: 0 }]).percentage).toBe(0);
  });
});