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
    select: () => query, order: () => query, limit: () => query, returns: () => query,
    eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
    in: (field: string, values: unknown[]) => { filters.push(row => values.includes(row[field])); return query; },
    is: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    range: async (from: number, to: number) => ({ data: rows().slice(from, to + 1), error: null }),
    then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return query;
} } }));
import { GET } from "@/app/api/accounting/cash-shifts/[id]/follow-up/route";
import { GET as readDrawer } from "@/app/api/front-desk/cash-drawer/route";
import { GET as readLedger } from "@/app/api/accounting/ledger/route";
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
  it("exposes only the shared latest or the cashier's own older drawer", async () => {
    state.tables.cash_shifts.unshift({ id: "latest", staff_user_id: "colleague", status: "closed" });
    expect((await read()).status).toBe(404);
    expect(state.reads).not.toContain("shift_handovers");
    state.tables.cash_shifts[1].staff_user_id = "cashier";
    expect((await read()).status).toBe(200);
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

describe("Front Desk financial reads", () => {
  it("denies the property-wide ledger before querying data", async () => {
    expect((await readLedger(new Request("http://haven.test/api/accounting/ledger"))).status).toBe(403);
    expect(state.reads).toEqual([]);
  });

  it("returns movements for the open, latest closed and own drawers only", async () => {
    state.tables.cash_shifts = [
      { id: "open", status: "open", staff_user_id: "colleague" },
      { id: "latest", status: "closed", staff_user_id: "colleague" },
      { id: "mine", status: "reconciled", staff_user_id: "cashier" },
      { id: "other", status: "reconciled", staff_user_id: "colleague" },
    ];
    state.tables.payments = [
      { id: "collection", cash_shift_id: "open", status: "paid", amount: 45.01 },
      { id: "refund", cash_shift_id: "open", status: "paid", amount: 3.02, purpose: "refund" },
      { id: "other-payment", cash_shift_id: "other", status: "paid", amount: 200 },
    ];
    const response = await readDrawer();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.cashShifts.map((shift: { id: string }) => shift.id)).toEqual(["open", "latest", "mine"]);
    expect(data.transactions.map((movement: { id: string }) => movement.id)).toEqual(["collection", "refund"]);
    expect(data.cashShifts[0].collected).toBe(41.99);
    expect(new Set(state.reads)).toEqual(new Set(["cash_shifts", "payments", "user_accounts"]));
  });
});
