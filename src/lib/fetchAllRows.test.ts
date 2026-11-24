import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetchAllRows";

describe("fetchAllRows", () => {
  it("loads all 1,076 transfer rows, including the movements after row 1,000", async () => {
    const rows = Array.from({ length: 1076 }, (_, index) => ({ id: index + 1 }));
    const ranges: Array<[number, number]> = [];

    const result = await fetchAllRows<(typeof rows)[number]>((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });

    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(result).toHaveLength(1076);
    expect(result[1000].id).toBe(1001);
    expect(result.at(-1)?.id).toBe(1076);
  });
});
