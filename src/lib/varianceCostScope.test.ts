import { describe, it, expect } from "vitest";
import { computeScopeCost } from "./varianceCostScope";

// kitchen-only item 100, general-only item 30, shared kitchen+general 20,
// packaging item in general 10
const items = [
  { id: "k", value: 100 },
  { id: "g", value: 30 },
  { id: "s", value: 20 },
  { id: "p", value: 10 },
];
const depts: Record<string, string[]> = { k: ["K"], g: ["G"], s: ["K", "G"], p: ["G"] };
const base = {
  items,
  itemDeptIds: (id: string) => depts[id] ?? [],
  itemIsPackaging: (id: string) => id === "p",
  netSales: 1000,
};

describe("computeScopeCost", () => {
  it("all departments counts every item once", () => {
    const r = computeScopeCost({ ...base, scopeDeptId: "all", includePackaging: true });
    expect(r.totalVal).toBe(160);
    expect(r.pct).toBeCloseTo(0.16);
  });

  it("department only counts its items including shared ones", () => {
    const r = computeScopeCost({ ...base, scopeDeptId: "K", includePackaging: false });
    expect(r.totalVal).toBe(120);
  });

  it("department + packaging adds packaging items from other departments", () => {
    const r = computeScopeCost({ ...base, scopeDeptId: "K", includePackaging: true });
    expect(r.packagingExtraVal).toBe(10);
    expect(r.totalVal).toBe(130);
  });

  it("department totals exceed all-departments total by the shared value", () => {
    const k = computeScopeCost({ ...base, scopeDeptId: "K", includePackaging: false }).totalVal;
    const g = computeScopeCost({ ...base, scopeDeptId: "G", includePackaging: false }).totalVal;
    const all = computeScopeCost({ ...base, scopeDeptId: "all", includePackaging: false });
    expect(k + g - all.totalVal).toBe(all.sharedVal);
    expect(all.sharedVal).toBe(20);
  });
});
