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
