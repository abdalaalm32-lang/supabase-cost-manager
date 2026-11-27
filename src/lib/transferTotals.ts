/** Grand total of a transfer = items cost + transportation + loading. */
export const transferGrandTotal = (t: { total_cost?: number | null; transportation_cost?: number | null; loading_cost?: number | null }) =>
  (Number(t.total_cost) || 0) + (Number(t.transportation_cost) || 0) + (Number(t.loading_cost) || 0);

/** Round a money amount UP to the next whole pound (6156.32 → 6157, 6156 stays 6156). */
export const roundUpWhole = (n: number) => {
  const cents = Math.round((Number(n) || 0) * 100) / 100;
  return Math.ceil(cents - 1e-9);
};
