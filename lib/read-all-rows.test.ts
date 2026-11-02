import { describe, expect, it } from "vitest";
import { fakeSupabase } from "./fake-supabase";
import { readAllRows } from "./read-all-rows";

describe("complete operational reads", () => {
  it("includes old rows beyond the first response without losing ordering", async () => {
    const rows = Array.from({ length: 1037 }, (_, i) => ({ id: String(i).padStart(5, "0"), balance: i === 0 ? 100 : 0 }));
    const db = fakeSupabase({ invoices: rows });
    const result = await readAllRows(() => db.from("invoices").select("id,balance").order("id"));
    expect(result).toHaveLength(1037);
    expect(result.reduce((n, row) => n + Number(row.balance), 0)).toBe(100);
    expect(new Set(result.map((row) => row.id)).size).toBe(1037);
  });

  it("continues when the server caps a page below the requested size", async () => {
    const rows = Array.from({ length: 23 }, (_, id) => ({ id }));
    const result = await readAllRows<{ id: number }>(() => ({
      order() { return this; },
      range: async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to + 1, from + 7)), error: null }),
    }));
    expect(result).toEqual(rows);
  });

  it("propagates a failed later page instead of returning partial totals", async () => {
    await expect(readAllRows<{ id: number }>(() => ({
      order() { return this; },
      range: async (from: number) => from ? { data: null, error: new Error("offline read failure") }
        : { data: [{ id: 1 }], error: null },
    }))).rejects.toThrow("offline read failure");
  });
});
