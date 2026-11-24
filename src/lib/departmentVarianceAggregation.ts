/**
 * Aggregates per-item inventory variance values into department totals.
 *
 * A material linked to several departments (item department + every department of
 * its primary/extra groups) is shown in EACH of those departments — same rule as
 * the variance-analysis page. To keep the P&L total correct, the amount that got
 * counted more than once is returned as a separate `sharedOverlap` adjustment so
 * that sum(departments) + sharedOverlap === sum of unique items.
 */
export interface VarianceItemInput {
  varianceValue: number; // negative = deficit
  deptIds: string[]; // empty => "__none__"
}

export interface DepartmentVarianceAggregation {
  byDepartment: Map<string, number>;
  /** Negative of the double-counted amount; add it to the department sum to get the unique total. */
  sharedOverlap: number;
  /** Every item counted once. */
  uniqueTotal: number;
}

export const NO_DEPARTMENT_KEY = "__none__";

export function aggregateDepartmentVariances(items: VarianceItemInput[]): DepartmentVarianceAggregation {
  const byDepartment = new Map<string, number>();
  let uniqueTotal = 0;
  let sharedOverlap = 0;
  for (const it of items) {
    const depts = Array.from(new Set(it.deptIds.filter(Boolean)));
    const keys = depts.length > 0 ? depts : [NO_DEPARTMENT_KEY];
    for (const k of keys) byDepartment.set(k, (byDepartment.get(k) ?? 0) + it.varianceValue);
    uniqueTotal += it.varianceValue;
    if (keys.length > 1) sharedOverlap -= it.varianceValue * (keys.length - 1);
  }
  return { byDepartment, sharedOverlap, uniqueTotal };
}
