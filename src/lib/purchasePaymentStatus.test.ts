import { describe, it, expect } from "vitest";
import { getPurchasePaymentSummary, sumLinkedPayments, buildSupplierStatement } from "./purchasePaymentStatus";

const invoice0012 = { total_amount: 6000, paid_amount: 0, payment_type: "آجل" };

describe("purchase invoice payment status", () => {
  it("a 2000 payment linked to a 6000 credit invoice leaves 4000 and is partially paid", () => {
    const s = getPurchasePaymentSummary(invoice0012, 2000);
    expect(s.paid).toBe(2000);
    expect(s.remaining).toBe(4000);
    expect(s.label).toBe("مسدد جزئياً");
  });

  it("paying the remaining 4000 marks the invoice as fully paid, not cash", () => {
    const s = getPurchasePaymentSummary(invoice0012, 6000);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe("credit_paid");
    expect(s.label).toBe("تم السداد");
  });

  it("an unpaid credit invoice stays آجل", () => {
    expect(getPurchasePaymentSummary(invoice0012, 0).label).toBe("آجل");
  });

  it("amount paid at creation counts toward the paid total", () => {
    const s = getPurchasePaymentSummary({ ...invoice0012, paid_amount: 1000 }, 2000);
    expect(s.paid).toBe(3000);
    expect(s.remaining).toBe(3000);
  });

  it("sums linked payments per invoice and ignores unlinked ones", () => {
    const map = sumLinkedPayments([
      { purchase_order_id: "a", amount: 2000 },
      { purchase_order_id: "a", amount: 4000 },
      { purchase_order_id: null, amount: 500 },
    ]);
    expect(map).toEqual({ a: 6000 });
  });
});

describe("supplier statement", () => {
  it("running balance ends at opening + invoices - payments", () => {
    const rows = buildSupplierStatement({
      openingBalance: 1000,
      orders: [{ id: "a", date: "2026-11-01", invoice_number: "PU_2026_0012", total_amount: 6000, paid_amount: 0 }],
      payments: [{ purchase_order_id: "a", amount: 2000, payment_date: "2026-11-06" }],
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      invoiceNumberById: { a: "PU_2026_0012" },
    });
    expect(rows.map((r) => r.balance)).toEqual([1000, 7000, 5000]);
    expect(rows[2].reference).toBe("PU_2026_0012");
  });
});
