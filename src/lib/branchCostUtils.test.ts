import { describe, expect, it } from "vitest";
import { calculateIncomingWeightedAverage, calculateOnHandAverage } from "./branchCostUtils";

const purchase = (quantity: number, unit_cost: number, date: string) => ({
  quantity,
  unit_cost,
  purchase_orders: {
    branch_id: "warehouse-1",
    warehouse_id: null,
    date,
    created_at: `${date}T12:00:00Z`,
  },
});

describe("location weighted average cost", () => {
  it("adopts the transfer price when the destination had zero stock", () => {
    expect(calculateIncomingWeightedAverage({
      oldStock: 0,
      oldAverageCost: 256.5,
      incomingQty: 1,
      incomingUnitCost: 398.99,
    })).toBe(398.99);
  });

  it("weights an incoming transfer with actual existing stock", () => {
    expect(calculateIncomingWeightedAverage({
      oldStock: 4.5,
      oldAverageCost: 50,
      incomingQty: 1,
      incomingUnitCost: 200,
    })).toBeCloseTo(77.27, 2);
  });

  it("keeps opening stock value when purchases do not cover all on-hand quantity", () => {
    // Existing stock: 4.5 kg worth 225 EGP (average 50). New purchase: 1 kg at 200.
    // Stored purchase rows cover only 3 kg of the old stock; 1.5 kg is opening stock.
    const rows = [
      purchase(1, 200, "2026-11-25"),
      purchase(2, 25, "2026-11-01"),
      purchase(1, 100, "2026-08-11"),
    ];

    const average = calculateOnHandAverage(rows, 5.5, 50);

    expect(average).toBeCloseTo(425 / 5.5, 10);
    expect(average).toBeCloseTo(77.27, 2);
    expect(5.5 * average).toBeCloseTo(425, 10);
  });

  it("uses the latest purchase price when there is no on-hand stock", () => {
    expect(calculateOnHandAverage([purchase(1, 200, "2026-11-25")], 0, 50)).toBe(200);
  });

  it("preserves opening-stock cost when no purchase rows remain", () => {
    expect(calculateOnHandAverage([], 4.5, 50)).toBe(50);
  });

  it("uses only purchase value and quantity when they cover the full balance", () => {
    const average = calculateOnHandAverage([
      purchase(4.5, 50, "2026-11-01"),
      purchase(1, 200, "2026-11-25"),
    ], 5.5, 999);

    expect(average).toBeCloseTo(77.27, 2);
    expect(5.5 * average).toBeCloseTo(425, 10);
  });
});

import { calculateIncomingWeightedAverage as _cwa } from "./branchCostUtils";
import { it as _it, expect as _expect } from "vitest";
_it("chicken breast: 1.75 @ 182.694 + 1kg @ 200 = 188.987", () => {
  _expect(_cwa({ oldStock: 1.75, oldAverageCost: 182.694, incomingQty: 1, incomingUnitCost: 200 })).toBeCloseTo(188.987, 3);
});

import { calculateReplacedWeightedAverage as _rwa } from "./branchCostUtils";
_it("edit invoice: 2.75 @ 188.987 replacing 1kg@200 with 1kg@210 = 192.623", () => {
  _expect(_rwa({ stockBefore: 2.75, currentAverageCost: 188.98691, removeQty: 1, removeUnitCost: 200, addQty: 1, addUnitCost: 210 })).toBeCloseTo((1.75*182.694+210)/2.75, 2);
});
