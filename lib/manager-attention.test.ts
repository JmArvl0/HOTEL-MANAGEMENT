import { describe, expect, it } from "vitest";
import { byAttentionThenStay, deriveReservationAttention, needsAttention, type AttentionRow } from "@/lib/manager-attention";

// Hotel today is fixed — the rules compare hotel-local dates, never the test runner's clock.
const TODAY = "2026-09-08";

const row = (overrides: Partial<AttentionRow>): AttentionRow => ({
  id: "RSV-1", status: "confirmed", check_in: "2026-09-08", check_out: "2026-09-09",
  room_number: null, room_type: "Deluxe King", total: 8900, source: "Website",
  ...overrides,
});

describe("manager reservation attention", () => {
  it("1: confirmed arrival today with no room → Room assignment pending (warning)", () => {
    const issues = deriveReservationAttention(row({ check_in: "2026-09-08" }), TODAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ key: "room_assignment_pending", label: "Room assignment pending", severity: "warning" });
    expect(issues[0].detail).toContain("Arrival today");
  });

  it("2: confirmed with a past check-in date → Arrival unresolved, and never mutates status", () => {
    const reservation = row({ check_in: "2026-09-05", check_out: "2026-09-06" });
    const issues = deriveReservationAttention(reservation, TODAY);
    expect(issues[0]).toMatchObject({ key: "arrival_unresolved", label: "Arrival unresolved", severity: "warning" });
    expect(issues[0].detail).toContain("possible no-show");
    expect(reservation.status).toBe("confirmed"); // advisory only — no-show stays an authorized workflow
  });

  it("3: checked_in with checkout date passed → Overdue checkout (high, days counted)", () => {
    const issues = deriveReservationAttention(row({ status: "checked_in", check_in: "2026-08-25", check_out: "2026-09-06" }), TODAY);
    expect(issues[0]).toMatchObject({ key: "overdue_checkout", label: "Overdue checkout", severity: "high" });
    expect(issues[0].detail).toContain("2 days ago");
  });

  it("4: future confirmed reservation without a room is not flagged just for lacking a room", () => {
    const issues = deriveReservationAttention(row({ check_in: "2026-10-01", check_out: "2026-10-03" }), TODAY);
    expect(issues).toHaveLength(0);
    expect(needsAttention(row({ check_in: "2026-10-01" }), TODAY)).toBe(false);
  });

  it("5: checked_out reservations never carry operational warnings", () => {
    expect(deriveReservationAttention(row({ status: "checked_out", check_in: "2026-09-05", check_out: "2026-09-06", folio_balance: 100 }), TODAY)).toHaveLength(0);
  });

  it("6: cancelled reservations never carry arrival warnings", () => {
    expect(deriveReservationAttention(row({ status: "cancelled", check_in: "2026-09-05" }), TODAY)).toHaveLength(0);
  });

  it("7: no_show reservations never carry unresolved-arrival warnings", () => {
    expect(deriveReservationAttention(row({ status: "no_show", check_in: "2026-09-05" }), TODAY)).toHaveLength(0);
  });

  it("8: pending manager approval → Manager review required with the approval type", () => {
    const issues = deriveReservationAttention(row({ check_in: "2026-09-10", pending_approval_type: "early_check_in" }), TODAY);
    expect(issues[0]).toMatchObject({ key: "manager_review", label: "Manager review required", detail: "early check in" });
  });

  it("9: today's arrival on a maintenance-blocked room → Maintenance conflict (high)", () => {
    const issues = deriveReservationAttention(row({ room_number: "302", room_maintenance_blocked: true }), TODAY);
    expect(issues[0]).toMatchObject({ key: "maintenance_conflict", label: "Maintenance conflict", severity: "high" });
  });

  it("10: orders multiple issues by severity, overdue checkout first", () => {
    const issues = deriveReservationAttention(row({
      status: "checked_in", check_in: "2026-08-25", check_out: "2026-09-06",
      pending_approval_type: "late_checkout", folio_balance: 500,
    }), TODAY);
    expect(issues.map((issue) => issue.key)).toEqual(["overdue_checkout", "manager_review", "outstanding_balance"]);
  });

  it("9b: room readiness variants map to the right labels from the authoritative room state", () => {
    const base = { room_number: "205", check_in: "2026-09-08" } as const;
    expect(deriveReservationAttention(row({ ...base, room_housekeeping: "dirty" }), TODAY)[0].label).toBe("Room not ready");
    expect(deriveReservationAttention(row({ ...base, room_housekeeping: "inspection" }), TODAY)[0].label).toBe("Waiting for inspection");
    expect(deriveReservationAttention(row({ ...base, room_administratively_active: false }), TODAY)[0].label).toBe("Room unavailable");
    expect(deriveReservationAttention(row({ ...base, room_housekeeping: "clean" }), TODAY)).toHaveLength(0);
  });

  it("6b/7b: financial and secondary rules fire only from real data on active reservations", () => {
    expect(deriveReservationAttention(row({ check_in: "2026-09-10", folio_balance: 0 }), TODAY)).toHaveLength(0);
    expect(deriveReservationAttention(row({ check_in: "2026-09-10", refund_pending: true }), TODAY)[0].label).toBe("Refund exception pending");
    expect(deriveReservationAttention(row({ check_in: "2026-09-10", transport_status: "REQUESTED", transport_pickup_date: "2026-09-08" }), TODAY)[0].label).toBe("Transportation unreviewed");
    // A transport pickup far out is not an issue, and terminal statuses suppress everything.
    expect(deriveReservationAttention(row({ check_in: "2026-09-10", transport_status: "REQUESTED", transport_pickup_date: "2026-09-09" }), TODAY)).toHaveLength(0);
    expect(deriveReservationAttention(row({ status: "checked_out", transport_status: "REQUESTED", transport_pickup_date: "2026-09-08" }), TODAY)).toHaveLength(0);
  });

  it("sorts the attention queue worst-first, then by stay date", () => {
    const rows = [
      row({ id: "A", status: "checked_in", check_in: "2026-08-25", check_out: "2026-09-06" }),
      row({ id: "B", check_in: "2026-09-12" }),
      row({ id: "C", check_in: "2026-09-08" }),
    ];
    expect([...rows].sort(byAttentionThenStay(TODAY)).map((item) => item.id)).toEqual(["A", "C", "B"]);
    // A is the only high-severity row; C (arrival today) outranks issue-free B, and the
    // Attention Required filter drops B entirely.
  });
});
