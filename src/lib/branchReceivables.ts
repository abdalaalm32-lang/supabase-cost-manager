import { roundUpWhole } from "./transferTotals";

export interface ReceivableInvoice { id: string; branch_id: string; date: string; amount: number }
export interface Collection { id: string; branch_id: string; transfer_id: string | null; amount: number }
export type PayStatus = "unpaid" | "partial" | "paid";

/** Paid per invoice: linked collections first, then unlinked branch collections oldest invoice first. */
export function allocateCollections(invoices: ReceivableInvoice[], collections: Collection[]) {
  const paid = new Map<string, number>();
  invoices.forEach((i) => paid.set(i.id, 0));
  const unlinked = new Map<string, number>();
  collections.forEach((c) => {
    const amt = Number(c.amount) || 0;
    if (c.transfer_id && paid.has(c.transfer_id)) paid.set(c.transfer_id, paid.get(c.transfer_id)! + amt);
    else unlinked.set(c.branch_id, (unlinked.get(c.branch_id) ?? 0) + amt);
  });
  const sorted = [...invoices].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  sorted.forEach((inv) => {
    let pool = unlinked.get(inv.branch_id) ?? 0;
    if (pool <= 0) return;
    const due = Math.max(inv.amount - paid.get(inv.id)!, 0);
    const use = Math.min(due, pool);
    paid.set(inv.id, paid.get(inv.id)! + use);
    unlinked.set(inv.branch_id, pool - use);
  });
  return { paid, unallocated: unlinked };
}

export const payStatus = (amount: number, paid: number): PayStatus =>
  paid <= 0.004 ? "unpaid" : paid + 0.004 >= amount ? "paid" : "partial";

export const invoiceAmount = (itemsCost: number, transport: number, loading: number) =>
  roundUpWhole(itemsCost + transport + loading);

/** Inclusive YYYY-MM-DD date filtering; either boundary may be left open. */
export function isWithinDateRange(date: string | null | undefined, from = "", to = "") {
  const day = String(date ?? "").slice(0, 10);
  if (!day) return !from && !to;
  return (!from || day >= from) && (!to || day <= to);
}
