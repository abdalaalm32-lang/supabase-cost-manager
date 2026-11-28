import { describe, it, expect } from "vitest";
import { allocateCollections, payStatus, invoiceAmount, isWithinDateRange } from "./branchReceivables";
const inv = [
  { id: "a", branch_id: "b1", date: "2026-11-01", amount: 1000 },
  { id: "b", branch_id: "b1", date: "2026-11-05", amount: 500 },
];
describe("branch receivables", () => {
  it("linked collection pays its invoice", () => {
    const { paid } = allocateCollections(inv, [{ id: "1", branch_id: "b1", transfer_id: "b", amount: 200 }]);
    expect(paid.get("b")).toBe(200);
    expect(paid.get("a")).toBe(0);
  });
  it("unlinked collection pays oldest invoice first", () => {
    const { paid } = allocateCollections(inv, [{ id: "1", branch_id: "b1", transfer_id: null, amount: 1200 }]);
    expect(paid.get("a")).toBe(1000);
    expect(paid.get("b")).toBe(200);
  });
  it("status", () => {
    expect(payStatus(500, 0)).toBe("unpaid");
    expect(payStatus(500, 200)).toBe("partial");
    expect(payStatus(500, 500)).toBe("paid");
  });
  it("invoice amount includes fees and rounds up", () => {
    expect(invoiceAmount(199.5, 100, 100)).toBe(400);
  });
  it("includes both date boundaries and excludes invoices outside the period", () => {
    expect(isWithinDateRange("2026-11-01", "2026-11-01", "2026-11-30")).toBe(true);
    expect(isWithinDateRange("2026-11-30", "2026-11-01", "2026-11-30")).toBe(true);
    expect(isWithinDateRange("2026-10-31", "2026-11-01", "2026-11-30")).toBe(false);
    expect(isWithinDateRange("2026-12-01", "2026-11-01", "2026-11-30")).toBe(false);
  });
  it("supports an open start or end date", () => {
    expect(isWithinDateRange("2026-11-15", "", "2026-11-30")).toBe(true);
    expect(isWithinDateRange("2026-11-15", "2026-11-01", "")).toBe(true);
  });
});
