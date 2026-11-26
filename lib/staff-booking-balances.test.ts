import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({
  reservations: [{ id: "due", guest_id: null }, { id: "settled", guest_id: null }, { id: "missing", guest_id: null }],
  invoices: [{ reservation_id: "due", balance: 350 }, { reservation_id: "settled", balance: 0 }],
  invoicesUnavailable: false,
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === "invoices" && rows.invoicesUnavailable
      ? { data: null, error: { message: "Source unavailable" } }
      : { data: table === "invoices" ? rows.invoices : table === "reservations" ? rows.reservations : [], error: null }).then(resolve),
  };
  return query;
} } }));

import { listForRole } from "@/lib/staff-data";

beforeEach(() => { rows.invoicesUnavailable = false; });

describe("manager booking queue folio amounts", () => {
  it("keeps true zero and positive balances distinct from a missing folio", async () => {
    expect((await listForRole("reservations", "manager")).map(item => item.folio_balance)).toEqual([350, 0, null]);
  });

  it("keeps bookings visible with an unknown balance when the financial read fails", async () => {
    expect((await listForRole("reservations", "manager")).map(item => item.folio_balance)).toEqual([350, 0, null]);
    rows.invoicesUnavailable = true;
    expect((await listForRole("reservations", "manager")).map(item => item.folio_balance)).toEqual([null, null, null]);
  });
});
