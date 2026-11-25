/**
 * Draft and edited waste uses the selected location's current average cost.
 * Completed waste remains a historical snapshot and never changes when WAC moves.
 */
export function resolveWasteItemCost(params: {
  isEditable: boolean;
  locationCost: number | null | undefined;
  savedCost: number | null | undefined;
}): number {
  if (!params.isEditable) return Number(params.savedCost ?? 0);
  return Number(params.locationCost ?? params.savedCost ?? 0);
}
