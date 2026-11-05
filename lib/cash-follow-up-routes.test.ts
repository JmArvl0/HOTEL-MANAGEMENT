import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/types";

const state = vi.hoisted(() => ({ role: "front_desk" as Role, fail: false, tables: {} as Record<string, Record<string, unknown>[]>, reads: [] as string[] }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "cashier", role: state.role } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  state.reads.push(table);
  const filters: ((row: Record<string, unknown>) => boolean)[] = [];
  const rows = () => { if (state.fail) throw new Error("Read failed"); return (state.tables[table] ?? []).filter(row => filters.every(match => match(row))); };
  const query = {
    select: () => query, order: () => query, limit: () => query,
    eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
    is: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    range: async (from: number, to: number) => ({ data: rows().slice(from, to + 1), error: null })
  };
  return query;
} } }));
import { GET } from "@/app/api/accounting/cash-shifts/[id]/follow-up/route";
const read = () => GET(new Request("http://localhost/follow-up"), { params: Promise.resolve({ id: "drawer" }) });
beforeEach(() => {
  state.role = "front_desk"; state.fail = false; state.reads = [];
  state.tables = {
    cash_shifts: [{ id: "drawer", status: "closed", closed_at: "2026-11-03T20:00:00Z" }],
    shift_handovers: Array.from({ length: 501 }, (_, id) => ({ id: String(id), source_type: "cash_shift", source_id: "drawer", department: "front_desk", resolved_at: null })),
    front_desk_reports: [{ id: "report", report_date: "2026-11-04", status: "submitted", submitted_at: "2026-11-03T19:00:00Z", snapshot: { generatedAt: "2026-11-03T19:00:00Z" } }]
  };
});
describe("cash close follow-up reads", () => {
  it("reads the complete drawer/department scope and uses the Manila close date", async () => {
    state.tables.shift_handovers.push({ id: "other", source_type: "cash_shift", source_id: "another-drawer", department: "front_desk", resolved_at: null });
    const response = await read(); const { data } = await response.json();
    expect(response.status).toBe(200); expect(data.handovers).toHaveLength(501);
    expect(data.reportDate).toBe("2026-11-04"); expect(data.includesClose).toBe(false);
    expect(data.report).toEqual({ id: "report", status: "submitted", submittedAt: "2026-11-03T19:00:00Z" });
  });
  it("never queries daily reports for Accounting", async () => {
    state.role = "accounting";
    const { data } = await (await read()).json();
    expect(data.handovers).toEqual([]); expect(data.report).toBeNull();
    expect(state.reads).not.toContain("front_desk_reports");
  });
  it("does not turn failed source reads into a successful empty result", async () => {
    state.fail = true;
    expect((await read()).status).toBe(503);
  });
  it("retains cash-handling authorization", async () => {
    state.role = "owner";
    expect((await read()).status).toBe(403); expect(state.reads).toEqual([]);
  });
});
