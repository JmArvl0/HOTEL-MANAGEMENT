import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]>, failInvoices: false }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  const client = fakeSupabase(state.db);
  return { supabase: { ...client, from: (name: string) => {
    const query = client.from(name);
    if (name === "invoices" && state.failInvoices) {
      query.range = () => Promise.resolve({ data: null, error: new Error("Invoice page unavailable") }) as never;
    }
    return query;
  } } };
});
const { getAccountingLedger } = await import("./accounting");

beforeEach(() => {
  for (const key of Object.keys(state.db)) delete state.db[key];
  state.failInvoices = false;
});

it("keeps old outstanding balances and all collections beyond the previous list caps", async () => {
  state.db.payments = Array.from({ length: 1037 }, (_, i) => ({
    id: String(i).padStart(5, "0"), status: "paid", purpose: "stay_payment", amount: 1,
    created_at: new Date(2026, 0, 1, 0, i).toISOString(),
  }));
  state.db.invoices = state.db.payments.map((row, i) => ({ id: row.id, created_at: row.created_at, balance: i === 0 ? 100 : 0 }));
  const ledger = await getAccountingLedger("accounting");
  expect(ledger?.metrics.grossCollected).toBe(1037);
  expect(ledger?.metrics.outstandingBalance).toBe(100);
});

it("does not report zero money when an authoritative invoice query fails", async () => {
  state.failInvoices = true;
  await expect(getAccountingLedger("accounting")).rejects.toThrow("Invoice page unavailable");
});
