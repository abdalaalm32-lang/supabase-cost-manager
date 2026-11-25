import { describe, expect, it } from "vitest";
import { getCostAdjustmentLocationId } from "./costAdjustmentCosts";

describe("cost adjustment location", () => {
  it("updates the selected branch cost", () => {
    expect(getCostAdjustmentLocationId("branch", "branch-1")).toBe("branch-1");
  });

  it("updates the selected warehouse cost too", () => {
    expect(getCostAdjustmentLocationId("warehouse", "warehouse-1")).toBe("warehouse-1");
  });

  it("does not update a location before one is selected", () => {
    expect(getCostAdjustmentLocationId("warehouse", "")).toBeNull();
    expect(getCostAdjustmentLocationId("", "location-1")).toBeNull();
  });
});
