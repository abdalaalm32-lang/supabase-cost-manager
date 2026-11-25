/** Round financial values to two decimals, including exact half values. */
export function roundCurrency(value: number): number {
  const numeric = Number(value) || 0;
  const scaled = Math.abs(numeric) * 100;
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled));
  return Math.sign(numeric) * rounded / 100;
}

/**
 * Inventory Balances displays average cost to two decimals, so its value must
 * use that same rounded cost. The row value is rounded too, keeping the table,
 * grand total, and exports consistent with the figures the user can see.
 */
export function calculateDisplayedInventoryValue(stock: number, averageCost: number): number {
  return roundCurrency((Number(stock) || 0) * roundCurrency(averageCost));
}
