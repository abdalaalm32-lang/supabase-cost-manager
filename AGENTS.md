# Architecture rules

- Calculate the menu main-cost KPI with `src/lib/menuMainCost.ts` from the displayed analysis items so branch, section, and channel selections remain consistent and the ratio is independently testable.
- Derive purchase-invoice paid/remaining/payment status with `src/lib/purchasePaymentStatus.ts` (invoice `paid_amount` + linked `supplier_payments`) instead of storing it, so invoices list, invoice page, and supplier debts never double-count or drift.
- Calculate the variance-analysis cost-scope box with `src/lib/varianceCostScope.ts` over all items (before the department filter) so department, all-departments, and +packaging totals stay consistent and testable.
- Aggregate P&L department variances with `src/lib/departmentVarianceAggregation.ts`: a material appears in every department linked to it or its groups (same rule as variance analysis), and the double-counted part is a separate shared-materials row so the P&L total counts each material once.
- Calculate indirect-expense classification totals with `src/lib/indirectExpenseClassification.ts` so Fixed, Variable, Semi Variable, the grand total, and exports always count every expense once; missing classifications remain Fixed for backward compatibility.
