/** POS payment method values exactly as stored on pos_sales / pos_returns. */
export const POS_PAYMENT = {
  cash: "كاش",
  visa: "فيزا",
  instapay: "انستا باي",
  vodafoneCash: "فودافون كاش",
} as const;

type PaymentRow = { payment_method?: string | null; total_amount?: number | string | null };

/**
 * Sum total_amount of rows paid with the given method.
 * `fallbackMethod` is applied to rows without a payment_method (legacy rows default to cash).
 */
export function sumByPaymentMethod(
  rows: PaymentRow[] | null | undefined,
  method: string,
  fallbackMethod?: string,
): number {
  return (rows ?? []).reduce((sum, r) => {
    const m = r.payment_method ?? fallbackMethod;
    return m === method ? sum + (Number(r.total_amount) || 0) : sum;
  }, 0);
}
