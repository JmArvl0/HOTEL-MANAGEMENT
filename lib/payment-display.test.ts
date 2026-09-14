import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canVerifyDeposit } from "@/lib/permissions";
import {
  formatPaymentSubmittedAt,
  HOTEL_TIME_ZONE,
  paymentSearchText,
} from "@/lib/payment-display";
import type { RecordItem } from "@/lib/types";

const payment: RecordItem = {
  id: "pay-1",
  reservation_id: "reservation-1",
  reference: "GCASH-44321",
  reservation: {
    id: "reservation-1",
    confirmation_number: "HVN-260910-ABC123",
    guest_name: "Ana Reyes",
    room_type: "Garden Twin",
    check_in: "2026-09-10",
    check_out: "2026-09-12",
  },
} as unknown as RecordItem;

describe("Accounting deposit verification presentation", () => {
  it("searches the allowed guest, reservation, and payment reference identifiers", () => {
    const haystack = paymentSearchText(payment);
    expect(haystack).toContain("ana reyes");
    expect(haystack).toContain("hvn-260910-abc123");
    expect(haystack).toContain("reservation-1");
    expect(haystack).toContain("gcash-44321");
  });

  it("renders submitted timestamps in the authoritative hotel timezone", () => {
    expect(HOTEL_TIME_ZONE).toBe("Asia/Manila");
    expect(formatPaymentSubmittedAt("2026-09-10T00:00:00.000Z")).toMatch(
      /Sep 10, 8:00 AM/i,
    );
  });

  it("keeps verification authority exclusive to Accounting", () => {
    expect(canVerifyDeposit("accounting")).toBe(true);
    for (const role of [
      "owner",
      "admin",
      "manager",
      "front_desk",
      "housekeeping",
      "maintenance",
      "guest",
    ] as const) {
      expect(canVerifyDeposit(role)).toBe(false);
    }
  });

  it("loads reservation identity in the single payment query without unrelated guest PII", () => {
    const source = readFileSync("lib/staff-data.ts", "utf8");
    const branch = source.slice(
      source.lastIndexOf(
        'if (resource === "payments")',
        source.indexOf('if (resource === "refunds")'),
      ),
      source.indexOf('if (resource === "refunds")'),
    );
    expect(branch).toContain(
      "reservations(guest_name,confirmation_number,room_type,check_in,check_out",
    );
    expect(branch.match(/from\("payments"\)/g)).toHaveLength(1);
    expect(branch).not.toMatch(/guest_email|phone|address/);
    expect(branch).not.toContain('from("reservations")');
  });

  it("keeps status badges separate from explicit pending and read-only actions", () => {
    const source = readFileSync(
      "components/manager/manager-dashboard-client.tsx",
      "utf8",
    );
    expect(source).toContain("Reservation / guest");
    expect(source).toContain(
      "Search by guest name, reservation code, or reference number...",
    );
    expect(source).toContain('className="payment-status"');
    expect(source).toContain('className="table-action action-primary"');
    expect(source).toContain('className="table-action action-danger"');
    expect(source).toContain("View details");
  });

  it("scopes the shared action hierarchy to internal application pages", () => {
    const css = readFileSync("app/manager-dashboard-theme.css", "utf8");
    expect(css).toContain(".app-shell .table-action.action-primary");
    expect(css).toContain(".app-shell .table-action.action-neutral");
    expect(css).toContain(".app-shell .table-action.action-danger");
    expect(css).not.toMatch(/^\.customer[^\n]*action-primary/m);
  });
});
