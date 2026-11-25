import { describe, expect, it } from "vitest";
import { resolveWasteItemCost } from "./wasteCost";

describe("waste item cost", () => {
  it("uses the selected branch cost for an editable branch waste", () => {
    expect(resolveWasteItemCost({ isEditable: true, locationCost: 398.99, savedCost: 599.965 })).toBe(398.99);
  });

  it("uses the selected warehouse cost for an editable warehouse waste", () => {
    expect(resolveWasteItemCost({ isEditable: true, locationCost: 599.965, savedCost: 398.99 })).toBe(599.965);
  });

  it("preserves the historical cost after the waste is completed", () => {
    expect(resolveWasteItemCost({ isEditable: false, locationCost: 700, savedCost: 599.965 })).toBe(599.965);
  });
});
