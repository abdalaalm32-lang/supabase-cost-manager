const STOCK_PRECISION = 1000;

/** Compare stock quantities at the same three-decimal precision shown to the user. */
export function exceedsWasteStock(quantity: number, available: number): boolean {
  const requested = Math.round((Number(quantity) + Number.EPSILON) * STOCK_PRECISION);
  const onHand = Math.round((Number(available) + Number.EPSILON) * STOCK_PRECISION);
  return requested > onHand;
}

/** Avoid displaying a negative zero caused by floating-point movement totals. */
export function formatWasteStock(quantity: number): string {
  const rounded = Math.round((Number(quantity) + Number.EPSILON) * STOCK_PRECISION) / STOCK_PRECISION;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(3);
}
