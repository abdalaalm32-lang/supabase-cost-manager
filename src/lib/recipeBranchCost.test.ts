import { describe, expect, it } from "vitest";
import { buildRecipeBranchCostMap, resolveRecipeIngredientCost } from "./recipeBranchCost";

const costs = buildRecipeBranchCostMap([
  { branch_id: "branch-a", stock_item_id: "meat", avg_cost: 398.99 },
  { branch_id: "branch-b", stock_item_id: "meat", avg_cost: 410.5 },
]);

describe("recipe branch cost", () => {
  it("uses the selected branch cost instead of the warehouse/global cost", () => {
    expect(resolveRecipeIngredientCost(costs, "branch-a", "meat", 599.97)).toBe(398.99);
  });

  it("uses each item's own branch cost when all branches are displayed", () => {
    expect(resolveRecipeIngredientCost(costs, "branch-a", "meat", 599.97)).toBe(398.99);
    expect(resolveRecipeIngredientCost(costs, "branch-b", "meat", 599.97)).toBe(410.5);
  });

  it("keeps the same global fallback used by Recipes when no branch cost exists", () => {
    expect(resolveRecipeIngredientCost(costs, "branch-c", "meat", 599.97)).toBe(599.97);
    expect(resolveRecipeIngredientCost(costs, null, "meat", 599.97)).toBe(599.97);
  });
});
