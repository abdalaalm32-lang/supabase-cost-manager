import { describe, expect, it } from "vitest";
import { exceedsWasteStock, formatWasteStock } from "./wasteStock";

describe("waste stock quantities", () => {
  it("accepts wasting the exact displayed balance of 0.001", () => {
    expect(exceedsWasteStock(0.001, 0.001)).toBe(false);
  });

  it("accepts the exact balance despite floating-point movement totals", () => {
    expect(exceedsWasteStock(0.4, 0.1 + 0.2 + 0.1)).toBe(false);
  });

  it("rejects a quantity above the three-decimal balance", () => {
    expect(exceedsWasteStock(0.002, 0.001)).toBe(true);
  });

  it("shows balances to three decimals without negative zero", () => {
    expect(formatWasteStock(0.001)).toBe("0.001");
    expect(formatWasteStock(-0.00001)).toBe("0.000");
  });
});
