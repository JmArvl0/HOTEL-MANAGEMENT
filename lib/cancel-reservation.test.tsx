// @vitest-environment jsdom
// Customer cancel-reservation workflow contracts.
//
// What this pins down:
// - the reason input is a required free-text textarea (never a dropdown),
// - the pre-commit preview is snapshot-derived and read-only,
// - eligible cancellations auto-create exactly one Accounting refund (no
//   manual "Request Refund" step), retries stay idempotent,
// - the customer gets toast + bell confirmation and a folio handoff,
// - cancellation/inventory/refund responsibilities stay separated.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cancellationWindowsFromSnapshot,
  previewCancellationRefund,
} from "./cancellation-preview";
import {
  ReservationDetailView,
  type ReservationDetailViewData,
} from "../components/customer/reservation-detail-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const actions = () => read("components/customer/reservation-actions.tsx");
const detail = () => read("components/customer/reservation-detail-view.tsx");
const route = () => read("app/api/account/reservations/[id]/cancel/route.ts");
const getSlice = () => {
  const source = route();
  return source.slice(source.indexOf("export async function GET"));
};

const windows = { fullRefundDays: 14, partialRefundDays: 7, partialRefundBasisPoints: 5000, hotelTimezone: "Asia/Manila" };
const preview = (checkIn: string, depositPaid: number, policy = windows) =>
  previewCancellationRefund({ checkIn, today: "2026-09-18", policy, depositPaid });

describe("preview math (mirrors cancel_reservation semantics)", () => {
  it("grants a full refund at and beyond the full window", () => {
    expect(preview("2026-10-02", 9000).eligibility).toBe("full");
    expect(preview("2026-10-02", 9000).eligibleAmount).toBe(9000);
    expect(preview("2026-10-05", 9000).eligibleAmount).toBe(9000);
  });

  it("grants the snapshot partial rate inside the partial window", () => {
    const partial = preview("2026-09-28", 9000);
    expect(partial.eligibility).toBe("partial");
    expect(partial.basisPoints).toBe(5000);
    expect(partial.eligibleAmount).toBe(4500);
  });

  it("grants nothing inside the no-refund window", () => {
    const none = preview("2026-09-20", 9000);
    expect(none.eligibility).toBe("none");
    expect(none.eligibleAmount).toBe(0);
  });

  it("never fabricates a refund on an unpaid reservation", () => {
    expect(preview("2026-10-05", 0).eligibleAmount).toBe(0);
    expect(preview("2026-10-05", 0).eligibility).toBe("full");
  });

  it("reads windows from the booking-time snapshot, not globals", () => {
    const policy = cancellationWindowsFromSnapshot({
      hotelTimezone: "Asia/Manila",
      cancellationFullRefundDays: 30,
      cancellationPartialRefundDays: 10,
      cancellationPartialRefundBasisPoints: 2500,
    });
    expect(preview("2026-10-05", 8000, policy).eligibility).toBe("partial");
    expect(preview("2026-10-05", 8000, policy).eligibleAmount).toBe(2000);
  });

  it("renders the policy summary from snapshot values, never frontend constants", () => {
    const policy = cancellationWindowsFromSnapshot({
      cancellationFullRefundDays: 30,
      cancellationPartialRefundDays: 10,
      cancellationPartialRefundBasisPoints: 2500,
    });
    const summary = preview("2026-10-05", 8000, policy).policySummary;
    expect(summary).toContain("30");
    expect(summary).toContain("10");
    expect(summary).toContain("25%");
    expect(summary).not.toContain("14+ days");
  });
});

describe("cancel reason input", () => {
  const cancelFlow = () => {
    const source = actions();
    return source.slice(
      source.indexOf("Cancel reservation — one modal"),
      source.indexOf("Change Request — one complete modal"),
    );
  };

  it("renders a required textarea with no dropdown affordance", () => {
    expect(actions()).toContain("<textarea");
    expect(actions()).toContain("Reason for cancellation");
    expect(actions()).toContain("Tell us why you're cancelling this reservation.");
    expect(cancelFlow()).not.toContain("SelectDialog");
    expect(cancelFlow()).not.toContain("HavenSelect");
    expect(cancelFlow()).not.toContain("<select");
    expect(cancelFlow()).not.toMatch(/chevron|dropdown arrow/i);
  });

  it("requires the reason client-side and server-side with the same floor", () => {
    expect(actions()).toContain("cancelReason.trim().length >= 3");
    expect(actions()).toContain("at least 3 characters");
    expect(route()).toContain("z.string().trim().min(3).max(500)");
  });

  it("collects reason and consequences in ONE modal, not two dialogs", () => {
    expect(actions()).not.toContain("PromptDialog");
    expect(actions()).not.toContain("ConfirmDialog");
    expect(actions()).toContain("cancel-consequence-panel");
  });
});

describe("preview endpoint (read-only by construction)", () => {
  it("serves an ownership-scoped snapshot preview without writing", () => {
    const get = getSlice();
    expect(get).toContain("operational_policy_snapshot");
    expect(get).toContain("reservation.user_id !== session.user.id");
    expect(get).toContain("previewCancellationRefund");
    expect(get).not.toContain('rpc("cancel_reservation")');
    expect(get).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("rejects non-cancellable reservations before any math", () => {
    expect(getSlice()).toContain('["pending", "confirmed"].includes(String(reservation.status))');
  });

  it("bases the preview on settled deposit payments only", () => {
    const get = getSlice();
    expect(get).toContain('eq("purpose", "reservation_deposit")');
    expect(get).toContain('eq("status", "paid")');
  });
});

describe("cancel execution and refund handoff", () => {
  it("posts only the free-text reason — no client-trusted amounts", () => {
    const source = actions();
    const submit = source.slice(source.indexOf("async function handleCancelSubmit"), source.indexOf("async function handleChangeSubmit"));
    // The POST payload carries exactly the reason; the server derives
    // ownership, status, and every refund figure. Reading the server's own
    // response (eligible_refund) for the toast is display, not trust.
    expect(submit).toContain("JSON.stringify({ reason: trimmedReason })");
    expect(submit).not.toMatch(/JSON\.stringify\(\{[^}]*refund/i);
    expect(submit).not.toMatch(/JSON\.stringify\(\{[^}]*(userId|paymentStatus|eligibleAmount)/);
  });

  it("confirms through the shared toast and refreshes, with no manual refund step", () => {
    const source = actions();
    expect(source).toContain("useCustomerToast");
    expect(source).toContain("Reservation cancelled");
    expect(source).not.toMatch(/Request [Rr]efund/);
    expect(detail()).not.toMatch(/Request [Rr]efund/);
  });

  it("records exactly one persistent bell entry per cancelled reservation", () => {
    expect(route()).toContain("notifyWithOptionalEmail");
    expect(route()).toContain('type: "reservation_cancelled"');
    expect(route()).toContain("/my-reservations/${id}");
    expect(read("lib/notifications.ts")).toContain('"reservation_cancelled"');
    const migration = read("supabase/migrations/20261008010000_reservation_cancelled_notifications.sql");
    expect(migration).toContain("'reservation_cancelled'");
    expect(migration).toContain("notifications_cancelled_once");
  });

  it("keeps the authoritative RPC semantics untouched", () => {
    const migration = read("supabase/migrations/20260828050000_connected_hotel_workflows.sql");
    expect(migration).toContain("if eligible>0 then insert into refund_requests");
    expect(migration).toContain("if r.status='cancelled'then return query");
    expect(migration).toContain("CANCELLATION_REASON_REQUIRED");
    expect(migration).toContain("purpose='reservation_deposit'and status='paid'");
  });
});

describe("cancelled detail refund section", () => {
  const base: ReservationDetailViewData = {
    id: "res-1",
    confirmationNumber: "HVN-001",
    roomType: "Garden Twin",
    checkIn: "2026-10-02",
    checkOut: "2026-10-04",
    nights: 2,
    guests: 2,
    status: "cancelled",
    paymentStatus: "refund_pending",
    guestName: "Mark Cruz",
    guestEmail: "mark@example.com",
    guestPhone: "+639171234567",
    roomNumber: null,
    identityStatus: "verified",
    source: "website",
    specialRequests: null,
    expectedArrival: null,
    cancellationReason: "Change of plans",
    checkInTime: "2:00 PM",
    checkOutTime: "12:00 PM",
    transportLines: [],
    policyText: "Cancellation policy text.",
    pendingNotice: null,
    money: { stayTotal: 11600, folioTotal: 11600, depositRequired: 3480, paid: 3480, balance: 0, nightly: 5800 },
    charges: [],
    payments: [],
    refunds: [],
    changeRequests: [],
    transportation: [],
  };

  it("shows the eligible refund with a folio handoff when refundable", () => {
    render(
      <ReservationDetailView
        data={{
          ...base,
          refunds: [{ id: "ref-1", reason: "Cancelled", eligibleAmount: 3480, status: "pending", createdAt: "2026-09-18T00:00:00Z" }],
        }}
      />,
    );
    expect(screen.getByLabelText("Refund status")).toBeTruthy();
    expect(screen.getByText(/Eligible refund/)).toBeTruthy();
    expect(screen.getByText("Pending processing")).toBeTruthy();
    const link = screen.getByRole("link", { name: /View refund status/ });
    expect(link.getAttribute("href")).toBe("/account/payments?stay=cancelled&pay=refund");
  });

  it("explains the no-refund outcome without inventing a request", () => {
    render(<ReservationDetailView data={base} />);
    expect(screen.getByText("No refund due")).toBeTruthy();
    expect(screen.getByText(/not eligible for a refund under the policy/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View refund status/ })).toBeNull();
  });

  it("maps a processed refund to customer-safe completed wording", () => {
    render(
      <ReservationDetailView
        data={{
          ...base,
          refunds: [{ id: "ref-1", reason: "Cancelled", eligibleAmount: 3480, status: "processed", createdAt: "2026-09-18T00:00:00Z" }],
        }}
      />,
    );
    expect(screen.getByText("Completed")).toBeTruthy();
  });
});
