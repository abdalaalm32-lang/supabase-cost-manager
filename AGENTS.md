# Architecture rules

- Calculate the menu main-cost KPI with `src/lib/menuMainCost.ts` from the displayed analysis items so branch, section, and channel selections remain consistent and the ratio is independently testable.- Derive purchase-invoice paid/remaining/payment status with `src/lib/purchasePaymentStatus.ts` (invoice `paid_amount` + linked `supplier_payments`) instead of storing it, so invoices list, invoice page, and supplier debts never double-count or drift.
