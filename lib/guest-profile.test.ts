import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 2 — consolidated guest profile. Unit tests run against the fake-supabase
// client (filters are applied, so cross-guest rows must not leak in); the route
// contract is pinned against source the same way tax-documents.test.ts does it.
const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("@/lib/fake-supabase");
  return { supabase: fakeSupabase(fake.db) };
});

const routeSource = readFileSync("app/api/staff/guests/[id]/route.ts", "utf8");
const staffData = readFileSync("lib/staff-data.ts", "utf8");

function seed() {
  fake.db = {
    guests: [{ id: "GST-1", name: "Ava Thompson", email: "ava@example.com", phone: "+63 917", loyalty_tier: "Gold", loyalty_points: 40, stays: 3, preferences: "High floor", special_requests: null, nationality: "Filipino", address: "Makati", created_at: "2026-01-01" }],
    reservations: [
      { id: "RSV-1", guest_id: "GST-1", confirmation_number: "CN-1", room_type: "Ocean Suite", check_in: "2026-09-10", check_out: "2026-09-12", guests: 2, status: "checked_in", request_options: ["late_checkout", "high_floor"], identity_status: "verified", created_at: "2026-09-05" },
      { id: "RSV-2", guest_id: "GST-1", confirmation_number: "CN-2", room_type: "Garden Twin", check_in: "2026-10-01", check_out: "2026-10-03", guests: 1, status: "confirmed", request_options: ["high_floor"], created_at: "2026-09-06" },
      { id: "RSV-3", guest_id: "GST-1", confirmation_number: "CN-3", room_type: "Deluxe King", check_in: "2026-08-01", check_out: "2026-08-02", guests: 1, status: "checked_out", request_options: [], created_at: "2026-07-20" },
      { id: "RSV-4", guest_id: "GST-1", confirmation_number: "CN-4", status: "cancelled", request_options: [], created_at: "2026-07-01" },
      { id: "RSV-5", guest_id: "GST-1", confirmation_number: "CN-5", status: "no_show", request_options: [], created_at: "2026-06-01" },
      { id: "RSV-OTHER", guest_id: "GST-2", status: "checked_in", request_options: [], created_at: "2026-09-07" },
    ],
    guest_requests: [
      { id: "GQ-1", reservation_id: "RSV-1", request: "Extra towels", department: "housekeeping", status: "completed", created_at: "2026-09-10" },
      { id: "GQ-OTHER", reservation_id: "RSV-OTHER", request: "Other guest", department: "front_desk", status: "open", created_at: "2026-09-11" },
    ],
    transportation_requests: [{ id: "TR-1", reservation_id: "RSV-1", service_type: "PICKUP", status: "SCHEDULED", pickup_date: "2026-09-10", pickup_time: "14:00" }],
    reservation_room_assignments: [{ id: "AS-1", reservation_id: "RSV-1", check_in: "2026-09-10", check_out: "2026-09-12", status: "reassigned", reason: "Guest request", is_upgrade: true, assigned_at: "2026-09-05" }],
    manager_approval_requests: [{ id: "AP-1", reservation_id: "RSV-1", request_type: "room_upgrade", status: "approved", reason: "Loyalty gesture", requested_at: "2026-09-05" }],
    invoices: [
      { id: "INV-1", reservation_id: "RSV-1", amount: 1000, paid: 600, balance: 400, credit_balance: 0, status: "partial" },
      { id: "INV-3", reservation_id: "RSV-3", amount: 500.5, paid: 500.5, balance: 0, credit_balance: 0, status: "paid" },
      { id: "INV-OTHER", reservation_id: "RSV-OTHER", amount: 999, paid: 0, balance: 999, status: "unpaid" },
    ],
  };
}

beforeEach(seed);

describe("getStaffGuestProfile", () => {
  it("groups stay history by state and keeps other guests' rows out", async () => {
    const { getStaffGuestProfile } = await import("@/lib/staff-data");
    const profile = await getStaffGuestProfile("GST-1", "manager");
    expect(profile).not.toBeNull();
    expect(profile!.stayCounts).toEqual({ current: 1, upcoming: 1, completed: 1, cancelled: 1, noShow: 1 });
    expect(profile!.stays.every((stay) => stay.guest_id === "GST-1")).toBe(true);
    expect(profile!.invoices.every((invoice) => invoice.reservation_id !== "RSV-OTHER")).toBe(true);
    expect(profile!.requests.map((request) => request.id)).toEqual(["GQ-1"]);
  });

  it("aggregates the financial summary across this guest's folios only", async () => {
    const { getStaffGuestProfile } = await import("@/lib/staff-data");
    const profile = await getStaffGuestProfile("GST-1", "manager");
    expect(profile!.financialVisible).toBe(true);
    expect(profile!.financial).toEqual({ billed: 1500.5, paid: 1100.5, outstanding: 400 });
  });

  it("deduplicates explicit request options across bookings", async () => {
    const { getStaffGuestProfile } = await import("@/lib/staff-data");
    const profile = await getStaffGuestProfile("GST-1", "front_desk");
    // Newest-booking order, deduplicated — set membership, not a pinned order.
    expect(profile!.requestOptions).toHaveLength(2);
    expect(profile!.requestOptions).toEqual(expect.arrayContaining(["late_checkout", "high_floor"]));
  });

  it("shows front desk the service history but not the manager approval trail", async () => {
    const { getStaffGuestProfile } = await import("@/lib/staff-data");
    const profile = await getStaffGuestProfile("GST-1", "front_desk");
    expect(profile!.transportation.map((trip) => trip.id)).toEqual(["TR-1"]);
    expect(profile!.assignments.map((entry) => entry.id)).toEqual(["AS-1"]);
    expect(profile!.approvals).toEqual([]);
  });

  it("returns null for an unknown guest", async () => {
    const { getStaffGuestProfile } = await import("@/lib/staff-data");
    expect(await getStaffGuestProfile("GST-MISSING", "manager")).toBeNull();
  });
});

describe("guest profile route contract", () => {
  it("gates the endpoint on guest-contact visibility, GET only", () => {
    expect(routeSource).toContain('if (!canViewGuestContact(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });');
    expect(routeSource).toContain("getStaffGuestProfile");
    expect(routeSource).not.toContain("PATCH");
    expect(routeSource).not.toContain("POST");
  });
  it("never selects payment proofs or identity documents in the profile query", () => {
    // Scope the scan to the profile function — the deposit-verification queue
    // legitimately selects proof FILE METADATA (never image bytes).
    const profileFn = staffData.slice(staffData.indexOf("getStaffGuestProfile"));
    expect(profileFn).not.toMatch(/proof_/);
    expect(profileFn).not.toMatch(/identity_document/);
  });
  it("gates the folio query and the financial summary on reservation-financials visibility", () => {
    expect(staffData).toContain("const financialVisible = canViewReservationFinancials(role);");
    expect(staffData).toContain("ids.length && financialVisible ? supabase.from(\"invoices\")");
    expect(staffData).toContain("financial: financialVisible ?");
  });
  it("keeps manager approvals manager/owner only", () => {
    expect(staffData).toContain('(role === "manager" || role === "owner") ? supabase.from("manager_approval_requests")');
  });
});
