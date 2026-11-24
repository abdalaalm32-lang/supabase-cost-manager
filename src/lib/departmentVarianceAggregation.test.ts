import { describe, it, expect } from "vitest";
import { aggregateDepartmentVariances, NO_DEPARTMENT_KEY } from "./departmentVarianceAggregation";

describe("aggregateDepartmentVariances", () => {
  it("shows a material linked to two departments in both departments", () => {
    const r = aggregateDepartmentVariances([{ varianceValue: -100, deptIds: ["kitchen", "bar"] }]);
    expect(r.byDepartment.get("kitchen")).toBe(-100);
    expect(r.byDepartment.get("bar")).toBe(-100);
  });

  it("counts a shared material only once in the P&L total", () => {
    const r = aggregateDepartmentVariances([
      { varianceValue: -100, deptIds: ["kitchen", "bar"] },
      { varianceValue: -50, deptIds: ["kitchen"] },
    ]);
    expect(r.uniqueTotal).toBe(-150);
    expect(r.sharedOverlap).toBe(100);
    const deptSum = Array.from(r.byDepartment.values()).reduce((s, v) => s + v, 0);
    expect(deptSum + r.sharedOverlap).toBe(-150);
  });

  it("puts a material without any department under no-department", () => {
    const r = aggregateDepartmentVariances([{ varianceValue: -20, deptIds: [] }]);
    expect(r.byDepartment.get(NO_DEPARTMENT_KEY)).toBe(-20);
    expect(r.sharedOverlap).toBe(0);
  });
});
