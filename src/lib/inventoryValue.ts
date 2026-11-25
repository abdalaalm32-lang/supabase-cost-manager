/** Round financial values to two decimals, including exact half values. */
export function roundCurrency(value: number): number {
  const numeric = Number(value) || 0;
  const scaled = Math.abs(numeric) * 100;
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled));
  return Math.sign(numeric) * rounded / 100;
}

/**
 * Use the full weighted-average cost for inventory value so the result equals
 * the underlying inventory amount. Only the final currency value is rounded;
 * the average-cost column independently shows three decimal places.
 */
export function calculateDisplayedInventoryValue(stock: number, averageCost: number): number {
  return roundCurrency((Number(stock) || 0) * (Number(averageCost) || 0));
}
