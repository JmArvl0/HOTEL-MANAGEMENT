import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("returns the four dashboard aggregates only in the Manager overview payload", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { demoStore } = await import("@/lib/demo-store");
  const { getDashboard } = await import("@/lib/data");
  const initial = await getDashboard("manager");
  const before = initial.managerOverview!.finances;
  const verifiedAt = new Date().toISOString();
  const deposit = { id: "overview-test-deposit", amount: 150.25, status: "paid", purpose: "reservation_deposit", verified_at: verifiedAt };
  const refund = { id: "overview-test-refund", amount: 20.5, status: "paid", purpose: "refund", verified_at: verifiedAt };
  const folio = { id: "overview-test-folio", balance: 820.75 };
  demoStore.payments.push(deposit, refund);
  demoStore.invoices.push(folio);

  try {
    const manager = await getDashboard("manager");
    expect(manager.managerOverview?.finances).toEqual({
      collectionsToday: before.collectionsToday + deposit.amount,
      depositsReceived: before.depositsReceived + deposit.amount,
      outstandingBalances: before.outstandingBalances + folio.balance,
      refundSummary: before.refundSummary + refund.amount,
    });
    expect(manager.metrics.outstandingBalances).toBe(0);
    expect(manager.metrics.pendingVerifications).toBe(0);
    expect((await getDashboard("front_desk")).managerOverview).toBeUndefined();
    expect((await getDashboard("housekeeping")).managerOverview).toBeUndefined();
  } finally {
    demoStore.payments.splice(demoStore.payments.indexOf(deposit), 2);
    demoStore.invoices.splice(demoStore.invoices.indexOf(folio), 1);
  }
});

it("keeps Front Desk ready-room count aligned with the room rack's current-week stays", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { demoStore } = await import("@/lib/demo-store");
  const { hotelToday } = await import("@/lib/booking");
  const { getDashboard } = await import("@/lib/data");
  const baseline = (await getDashboard("front_desk")).metrics.availableRooms;
  const from = new Date(`${hotelToday()}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() + 8);
  const through = new Date(from);
  through.setUTCDate(through.getUTCDate() + 2);
  const futureStay = {
    id: "qa-future-room-hold", room_id: "RM-402", room_type: "Ocean Suite",
    check_in: from.toISOString().slice(0, 10), check_out: through.toISOString().slice(0, 10),
    status: "confirmed", total: 17800,
  };
  demoStore.reservations.push(futureStay);
  try {
    expect((await getDashboard("front_desk")).metrics.availableRooms).toBe(baseline);
  } finally {
    demoStore.reservations.splice(demoStore.reservations.indexOf(futureStay), 1);
  }
});
