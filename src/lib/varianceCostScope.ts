/**
 * Actual consumed cost for the "نطاق حساب التكلفة" box in variance analysis.
 *
 * - scopeDeptId = "all"  → every item counted exactly once (all departments).
 * - scopeDeptId = <id>   → items belonging to that department; when
 *   includePackaging is on, items in packaging categories from any other
 *   department are added too (each item still counted once).
 *
 * Items shared between several departments are counted fully in each
 * department's own total, so the department totals can add up to more than
 * the "all departments" total; `sharedVal` reports that overlap.
 */
export type ScopeItem = { id: string; value: number };

export type ScopeCostInput = {
  items: ScopeItem[];
  itemDeptIds: (id: string) => string[];
  itemIsPackaging: (id: string) => boolean;
  scopeDeptId: string; // "all" or a department id
  includePackaging: boolean;
  netSales: number;
};

export type ScopeCostResult = {
  totalVal: number;
  pct: number;
  deptVal: number; // items of the scope department ("all": everything)
  packagingExtraVal: number; // packaging items added from other departments
  perDept: Map<string, number>; // every department's full total (shared items in each)
  sharedVal: number; // overlap: sum(perDept) - sharedVal + noDeptVal = all-departments total
  noDeptVal: number; // items without any department
};

export function computeScopeCost(input: ScopeCostInput): ScopeCostResult {
  const { items, itemDeptIds, itemIsPackaging, scopeDeptId, includePackaging, netSales } = input;
  let deptVal = 0;
  let packagingExtraVal = 0;
  let sharedVal = 0;
  let noDeptVal = 0;
  const perDept = new Map<string, number>();

  for (const it of items) {
    const v = Number(it.value) || 0;
    const dids = itemDeptIds(it.id);
    if (dids.length === 0) noDeptVal += v;
    if (dids.length > 1) sharedVal += v * (dids.length - 1);
    for (const d of dids) perDept.set(d, (perDept.get(d) ?? 0) + v);

    if (scopeDeptId === "all") {
      deptVal += v;
    } else if (dids.includes(scopeDeptId)) {
      deptVal += v;
    } else if (includePackaging && itemIsPackaging(it.id)) {
      packagingExtraVal += v;
    }
  }

  const totalVal = deptVal + packagingExtraVal;
  const pct = netSales > 0 ? totalVal / netSales : 0;
  return { totalVal, pct, deptVal, packagingExtraVal, perDept, sharedVal, noDeptVal };
}
