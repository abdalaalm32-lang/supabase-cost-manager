/** Aggregate recipe costs against current menu prices, without sales quantities. */
export function calculateMenuMainCost(items: ReadonlyArray<{ mainCost: number; price: number }>) {
  const totalMainCost = items.reduce((sum, item) => sum + item.mainCost, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
  return {
    totalMainCost,
    totalPrice,
    percentage: totalPrice > 0 ? (totalMainCost / totalPrice) * 100 : 0,
  };
}