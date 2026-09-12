import { describe, expect, it } from "vitest";
import { paginateTableRows, sortTableRows } from "./table-pagination";

describe("system table lists", () => {
  it("sorts named records alphabetically with natural numeric ordering", () => {
    const rows = [{ name: "Room 12" }, { name: "áster" }, { name: "Room 2" }, { name: "Ava" }];
    expect(sortTableRows(rows, (row) => row.name).map((row) => row.name)).toEqual([
      "áster",
      "Ava",
      "Room 2",
      "Room 12",
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Room 12", "áster", "Room 2", "Ava"]);
  });

  it("returns a bounded page and range for filtered rows", () => {
    const rows = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(paginateTableRows(rows, 2, 10)).toEqual({
      rows: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      page: 2,
      pageCount: 3,
      start: 11,
      end: 20,
      total: 23,
    });
    expect(paginateTableRows(rows, 99, 10).page).toBe(3);
    expect(paginateTableRows([], 1, 10)).toMatchObject({ page: 1, pageCount: 1, start: 0, end: 0, total: 0 });
  });
});
