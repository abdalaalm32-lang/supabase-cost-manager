/**
 * Shared purchase-invoice payment logic.
 *
 * `paid_amount` on a purchase order = amount paid when the invoice was created
 * (for cash invoices it equals the total). Payments recorded later from the
 * supplier-debts page live in `supplier_payments` linked via `purchase_order_id`.
 * Both sources are combined here so the invoices list, invoice view, and
 * supplier debts page always show the same paid / remaining / status.
 */

export type PurchasePaymentStatus = "cash" | "credit_unpaid" | "credit_partial" | "credit_paid";

export interface PurchasePaymentSummary {
  total: number;
  prepaid: number;
  linkedPaid: number;
  paid: number;
  remaining: number;
  status: PurchasePaymentStatus;
  label: string;
}

const EPS = 0.005;

export const PAYMENT_STATUS_LABELS: Record<PurchasePaymentStatus, string> = {
  cash: "نقدي",
  credit_unpaid: "آجل",
  credit_partial: "مسدد جزئياً",
  credit_paid: "تم السداد",
};

export function sumLinkedPayments(payments: Array<{ purchase_order_id?: string | null; amount?: number | string | null }>) {
  const map: Record<string, number> = {};
  for (const p of payments ?? []) {
    if (!p?.purchase_order_id) continue;
    map[p.purchase_order_id] = (map[p.purchase_order_id] ?? 0) + (Number(p.amount) || 0);
  }
  return map;
}

export function getPurchasePaymentSummary(
  order: { total_amount?: number | string | null; paid_amount?: number | string | null; payment_type?: string | null },
  linkedPaid = 0,
): PurchasePaymentSummary {
  const total = Number(order?.total_amount) || 0;
  const isCredit = order?.payment_type === "آجل";

  if (!isCredit) {
    return { total, prepaid: total, linkedPaid: 0, paid: total, remaining: 0, status: "cash", label: PAYMENT_STATUS_LABELS.cash };
  }

  const prepaid = Number(order?.paid_amount) || 0;
  const linked = Number(linkedPaid) || 0;
  const paid = prepaid + linked;
  const rawRemaining = total - paid;
  const remaining = Math.abs(rawRemaining) < EPS ? 0 : rawRemaining;

  let status: PurchasePaymentStatus;
  if (remaining <= 0 && total > 0) status = "credit_paid";
  else if (paid > EPS) status = "credit_partial";
  else status = "credit_unpaid";

  return { total, prepaid, linkedPaid: linked, paid, remaining, status, label: PAYMENT_STATUS_LABELS[status] };
}

export interface StatementEntry {
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Supplier account statement: opening balance of the period, then credit invoices
 * (debit = invoice total, credit = amount paid at creation) and payments
 * (credit) in date order, with a running balance.
 */
export function buildSupplierStatement(params: {
  openingBalance: number;
  orders: any[];
  payments: any[];
  periodStart: string;
  periodEnd: string;
  invoiceNumberById?: Record<string, string>;
}): StatementEntry[] {
  const { openingBalance, orders, payments, periodStart, periodEnd, invoiceNumberById = {} } = params;
  const inPeriod = (d?: string | null) => !!d && d.slice(0, 10) >= periodStart && d.slice(0, 10) <= periodEnd;

  type Raw = Omit<StatementEntry, "balance"> & { sortKey: string };
  const raw: Raw[] = [];

  for (const o of orders ?? []) {
    if (!inPeriod(o.date)) continue;
    raw.push({
      date: String(o.date).slice(0, 10),
      description: "فاتورة شراء آجلة",
      reference: o.invoice_number || "—",
      debit: Number(o.total_amount) || 0,
      credit: Number(o.paid_amount) || 0,
      sortKey: `${String(o.date).slice(0, 10)}|0|${o.created_at ?? ""}`,
    });
  }
  for (const p of payments ?? []) {
    if (!inPeriod(p.payment_date)) continue;
    const ref = p.purchase_order_id ? invoiceNumberById[p.purchase_order_id] || "—" : "—";
    raw.push({
      date: String(p.payment_date).slice(0, 10),
      description: `دفعة${p.payment_method ? ` (${p.payment_method})` : ""}${p.notes ? ` — ${p.notes}` : ""}`,
      reference: ref,
      debit: 0,
      credit: Number(p.amount) || 0,
      sortKey: `${String(p.payment_date).slice(0, 10)}|1|${p.created_at ?? ""}`,
    });
  }
  raw.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let balance = Number(openingBalance) || 0;
  const entries: StatementEntry[] = [
    { date: periodStart === "1900-01-01" ? "—" : periodStart, description: "رصيد أول المدة", reference: "—", debit: 0, credit: 0, balance },
  ];
  for (const r of raw) {
    balance += r.debit - r.credit;
    entries.push({ date: r.date, description: r.description, reference: r.reference, debit: r.debit, credit: r.credit, balance });
  }
  return entries;
}
