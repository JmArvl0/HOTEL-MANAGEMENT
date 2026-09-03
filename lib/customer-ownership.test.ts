// §85 / §89 — the customer trust boundary, exercised rather than grepped.
//
// Every id belonging to the second customer contains the marker "BRAVO", so a
// single `not.toContain("BRAVO")` proves no reservation, invoice, payment, folio
// charge, refund, change request, financial document or guest request of theirs
// reached the first customer's page data.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db as FakeDb) };
});
const nav = vi.hoisted(() => ({ redirected: [] as string[] }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { nav.redirected.push(path); throw new Error(`NEXT_REDIRECT:${path}`); },
}));

const { getCustomerFinancials, getCustomerRequests, getCustomerReservationDetail, buildNotifications } = await import("@/lib/customer");
const { getGuestReservation, getGuestReservations, getOwnedHold, getGuestProfile } = await import("@/lib/booking");
const { requireCustomerSession } = await import("@/lib/customer-auth");
const { getServerSession } = await import("next-auth");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const HOLD_A = "33333333-3333-3333-3333-333333333333";
const HOLD_BRAVO = "44444444-4444-4444-4444-444444444444";

/** The same records for both customers, distinguished only by owner. */
function seed(): FakeDb {
  const pair = <T extends Record<string, unknown>>(build: (tag: string) => T) => [build("alfa"), build("BRAVO")];
  return {
    reservations: pair((tag) => ({
      id: `res-${tag}`, user_id: tag === "alfa" ? A : B, guest_id: `guest-${tag}`,
      confirmation_number: `HVN-${tag}`, room_type: "Deluxe King", room_number: null,
      check_in: "2026-09-15", check_out: "2026-09-18", guests: 2, status: "confirmed",
      total: 30000, deposit: 9000, deposit_required: 9000, deposit_policy_snapshot: null,
      operational_policy_snapshot: null, payment_due_at: null, payment_status: "deposit",
      payment_method: "manual_gcash", source: "website", special_requests: "", expected_arrival: "",
      cancellation_reason: null, identity_status: "verified", created_at: "2026-09-01T00:00:00Z",
    })),
    invoices: pair((tag) => ({ id: `inv-${tag}`, reservation_id: `res-${tag}`, amount: 30000, paid: 9000, balance: 21000, status: "partial", method: "manual_gcash", due_date: "2026-09-15", created_at: "2026-09-01T00:00:00Z" })),
    payments: pair((tag) => ({ id: `pay-${tag}`, invoice_id: `inv-${tag}`, reservation_id: `res-${tag}`, amount: 9000, currency: "PHP", method: "manual_gcash", reference: `REF-${tag}`, purpose: "reservation_deposit", status: "paid", submitted_at: "2026-09-01T00:00:00Z", verified_at: "2026-09-01T01:00:00Z", created_at: "2026-09-01T00:00:00Z" })),
    folio_charges: pair((tag) => ({ id: `chg-${tag}`, invoice_id: `inv-${tag}`, reservation_id: `res-${tag}`, description: "Minibar", category: "food", amount: 500, status: "posted", created_at: "2026-09-16T00:00:00Z" })),
    refund_requests: pair((tag) => ({ id: `ref-${tag}`, reservation_id: `res-${tag}`, reason: "Cancelled", paid_deposit: 9000, refund_basis_points: 10000, eligible_amount: 9000, status: "pending", reference: null, processed_at: null, created_at: "2026-09-02T00:00:00Z" })),
    reservation_change_requests: pair((tag) => ({ id: `chn-${tag}`, reservation_id: `res-${tag}`, requested_check_in: "2026-09-16", requested_check_out: "2026-09-19", requested_room_type: "Deluxe King", requested_guests: 2, requested_special_requests: "", calculated_total: 30000, payment_difference: 0, execution_status: "pending", reason: "Flight moved", status: "pending", created_at: "2026-09-03T00:00:00Z" })),
    financial_adjustments: pair((tag) => ({ id: `adj-${tag}`, invoice_id: `inv-${tag}`, reservation_id: `res-${tag}`, transaction_type: "discount", direction: "credit", amount: 100, reason: "Goodwill", created_at: "2026-09-04T00:00:00Z" })),
    financial_documents: pair((tag) => ({ id: `doc-${tag}`, document_number: `DOC-${tag}`, document_type: "receipt", reservation_id: `res-${tag}`, payment_id: `pay-${tag}`, created_at: "2026-09-05T00:00:00Z" })),
    guest_requests: pair((tag) => ({ id: `req-${tag}`, reservation_id: `res-${tag}`, request: `Extra towels for ${tag}`, request_type: "service", department: "housekeeping", priority: "normal", severity: null, escalation_status: null, status: "open", created_at: "2026-09-06T00:00:00Z" })),
    guests: pair((tag) => ({ id: `guest-${tag}`, user_account_id: tag === "alfa" ? A : B, name: `Guest ${tag}`, email: `${tag}@example.test`, phone: "0917", nationality: "PH", address: "Manila", first_name: "Guest", last_name: tag, special_requests: "" })),
    booking_holds: [
      { token: HOLD_A, user_id: A, room_type: "Deluxe King", check_in: "2026-09-15", check_out: "2026-09-18", status: "active", expires_at: "2099-01-01T00:00:00Z", reservation_id: null },
      { token: HOLD_BRAVO, user_id: B, room_type: "Deluxe King", check_in: "2026-09-15", check_out: "2026-09-18", status: "active", expires_at: "2099-01-01T00:00:00Z", reservation_id: null },
    ],
  };
}

beforeEach(() => {
  for (const key of Object.keys(fake.db)) delete fake.db[key];
  Object.assign(fake.db, seed());
  nav.redirected.length = 0;
  vi.mocked(getServerSession).mockReset();
});

describe("customer session guard", () => {
  it("sends an anonymous visitor to sign in and back to the portal", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    await expect(requireCustomerSession()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(nav.redirected).toEqual(["/login?callbackUrl=%2Faccount"]);
  });

  it("refuses a disabled customer session", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: A, role: "guest", disabled: true } } as never);
    await expect(requireCustomerSession()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(nav.redirected).toEqual(["/login?callbackUrl=%2Faccount"]);
  });

  it("refuses a staff session on customer pages", async () => {
    for (const role of ["owner", "admin", "manager", "front_desk", "housekeeping", "maintenance", "accounting"]) {
      nav.redirected.length = 0;
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: A, role } } as never);
      await expect(requireCustomerSession()).rejects.toThrow(/NEXT_REDIRECT/);
      expect(nav.redirected).toEqual(["/manager_dashboard"]);
    }
  });

  it("admits a customer session unchanged", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: A, role: "guest" } } as never);
    await expect(requireCustomerSession()).resolves.toMatchObject({ user: { id: A } });
    expect(nav.redirected).toEqual([]);
  });
});

describe("customer data ownership", () => {
  it("lists only the signed-in customer's reservations", async () => {
    const reservations = await getGuestReservations(A);
    expect(reservations.map((item) => item.id)).toEqual(["res-alfa"]);
  });

  it("refuses another customer's reservation by id", async () => {
    await expect(getGuestReservation(A, "res-BRAVO")).resolves.toBeNull();
    await expect(getGuestReservation(A, "res-alfa")).resolves.toMatchObject({ id: "res-alfa" });
  });

  it("refuses another customer's reservation detail page", async () => {
    await expect(getCustomerReservationDetail(A, "res-BRAVO")).resolves.toBeNull();
  });

  it("returns a reservation detail carrying no other customer's records", async () => {
    const detail = await getCustomerReservationDetail(A, "res-alfa");
    expect(detail).toMatchObject({ id: "res-alfa", nights: 3 });
    expect(detail?.payments.map((item) => item.id)).toEqual(["pay-alfa"]);
    expect(detail?.charges.map((item) => item.id)).toEqual(["chg-alfa"]);
    expect(detail?.refunds.map((item) => item.id)).toEqual(["ref-alfa"]);
    expect(detail?.changeRequests.map((item) => item.id)).toEqual(["chn-alfa"]);
    expect(detail?.invoice?.id).toBe("inv-alfa");
    expect(detail?.guest?.email).toBe("alfa@example.test");
    expect(JSON.stringify(detail)).not.toContain("BRAVO");
  });

  it("keeps payments, folio, refunds and documents scoped in the financial view", async () => {
    const financials = await getCustomerFinancials(A);
    expect(financials).toHaveLength(1);
    const [reservation] = financials;
    expect(reservation.payments.map((item) => item.id)).toEqual(["pay-alfa"]);
    expect(reservation.charges.map((item) => item.id)).toEqual(["chg-alfa"]);
    expect(reservation.refunds.map((item) => item.id)).toEqual(["ref-alfa"]);
    expect(reservation.adjustments.map((item) => item.id)).toEqual(["adj-alfa"]);
    expect(reservation.documents.map((item) => item.id)).toEqual(["doc-alfa"]);
    expect(JSON.stringify(financials)).not.toContain("BRAVO");
  });

  it("keeps guest requests scoped to the customer's own stays", async () => {
    const requests = await getCustomerRequests(A);
    expect(requests.map((item) => item.id)).toEqual(["req-alfa"]);
    expect(JSON.stringify(requests)).not.toContain("BRAVO");
  });

  it("builds notifications only from the customer's own records", async () => {
    const notifications = buildNotifications(await getCustomerFinancials(A), await getCustomerRequests(A));
    expect(notifications.length).toBeGreaterThan(0);
    expect(JSON.stringify(notifications)).not.toContain("BRAVO");
  });

  it("returns nothing at all for a customer with no records", async () => {
    await expect(getCustomerFinancials("99999999-9999-9999-9999-999999999999")).resolves.toEqual([]);
    await expect(getCustomerRequests("99999999-9999-9999-9999-999999999999")).resolves.toEqual([]);
  });

  it("refuses another customer's booking hold, and any malformed token", async () => {
    await expect(getOwnedHold(HOLD_BRAVO, A)).resolves.toBeNull();
    await expect(getOwnedHold(HOLD_A, A)).resolves.toMatchObject({ user_id: A });
    await expect(getOwnedHold("not-a-uuid", A)).resolves.toBeNull();
  });

  it("resolves a guest profile through the account link, not a guessable email", async () => {
    await expect(getGuestProfile(A, "BRAVO@example.test")).resolves.toMatchObject({ email: "alfa@example.test" });
  });

  it("never exposes credential or session columns to the portal", async () => {
    const detail = JSON.stringify(await getCustomerReservationDetail(A, "res-alfa"));
    for (const secret of ["password_hash", "session_token", "service_role", "staff_note", "internal_note"]) {
      expect(detail).not.toContain(secret);
    }
  });
});
