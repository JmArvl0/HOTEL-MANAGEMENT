import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canGenerateFrontDeskReport, canReviewFrontDeskReports } from "@/lib/permissions";
import { hotelDayWindow, summarizeDailyActivity, type DailyReportRows } from "@/lib/front-desk-reports";
import type { Role } from "@/lib/types";

const migration = readFileSync("supabase/migrations/20260912010000_front_desk_reports.sql", "utf8");
const submitRoute = readFileSync("app/api/front-desk/reports/route.ts", "utf8");
const reviewRoute = readFileSync("app/api/front-desk/reports/[id]/review/route.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const transportationPanel = readFileSync("components/manager/transportation-panel.tsx", "utf8");
const reportsPanel = readFileSync("components/manager/front-desk-reports-panel.tsx", "utf8");
const cashMigration = readFileSync("supabase/migrations/20260913010000_cash_payment_internal_reference.sql", "utf8");
const paymentRoute = readFileSync("app/api/front-desk/reservations/[id]/payment/route.ts", "utf8");
const arrivalDialog = readFileSync("components/manager/front-desk-arrival-dialog.tsx", "utf8");

describe("daily report RBAC", () => {
  it("makes Front Desk the sole submitter of daily operations reports", () => {
    for (const role of ["owner", "admin", "manager", "housekeeping", "maintenance", "accounting", "guest"] as Role[])
      expect(canGenerateFrontDeskReport(role), role).toBe(false);
    expect(canGenerateFrontDeskReport("front_desk")).toBe(true);
  });
  it("makes the Manager the sole reviewer", () => {
    for (const role of ["owner", "admin", "front_desk", "housekeeping", "maintenance", "accounting", "guest"] as Role[])
      expect(canReviewFrontDeskReports(role), role).toBe(false);
    expect(canReviewFrontDeskReports("manager")).toBe(true);
  });
});

describe("report storage and lifecycle", () => {
  it("stores id, timestamps, submitter, status, and resubmission lineage", () => {
    for (const field of ["report_date", "snapshot", "submitted_by", "submitted_at", "status", "reviewed_by", "reviewed_at", "review_note", "supersedes", "version"])
      expect(migration).toContain(field);
    expect(migration).toContain("status in ('submitted','acknowledged','returned')");
    expect(migration).toContain("on delete restrict");
  });
  it("allows only one live submission per hotel day", () => {
    expect(migration).toContain("unique index if not exists front_desk_reports_one_live_per_date");
    expect(migration).toContain("where status='submitted'");
  });
  it("guards both RPCs with NULL-safe role checks", () => {
    expect(migration).toContain("actor is null or actor<>'front_desk' then raise exception'REPORT_SUBMIT_FORBIDDEN'");
    expect(migration).toContain("actor is null or actor<>'manager' then raise exception'REPORT_REVIEW_FORBIDDEN'");
  });
  it("protects review decisions with optimistic locking", () => {
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("REPORT_ALREADY_REVIEWED");
    expect(migration).toContain("REPORT_NOTE_REQUIRED");
  });
  it("requires a valid returned report before a resubmission", () => {
    expect(migration).toContain("prior.status<>'returned' or prior.report_date<>p_report_date");
    expect(migration).toContain("REPORT_SUPERSEDES_INVALID");
    expect(migration).toContain("p_report_date>public.hotel_today() then raise exception'REPORT_DATE_INVALID'");
  });
  it("audits submission and review, and keeps the table off the anon/authenticated roles", () => {
    expect(migration).toContain("'submit_front_desk_report'");
    expect(migration).toContain("'resubmit_front_desk_report'");
    expect(migration).toContain("'review_front_desk_report'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.front_desk_reports from anon, authenticated");
    expect(migration).toContain("grant execute on function public.submit_front_desk_report(date,jsonb,uuid,uuid),public.review_front_desk_report(uuid,text,text,integer,uuid) to service_role");
  });
});

describe("report generation and submission wiring", () => {
  it("builds the snapshot server-side and never accepts one from the browser", () => {
    expect(submitRoute).toContain("buildDailyReport");
    expect(submitRoute).toContain("const snapshot = await buildDailyReport(parsed.data.reportDate)");
    expect(submitRoute).toContain("p_snapshot: snapshot");
    expect(submitRoute).not.toMatch(/p_snapshot:\s*parsed\.data/);
  });
  it("routes review through the manager-guarded RPC", () => {
    expect(reviewRoute).toContain("canReviewFrontDeskReports");
    expect(reviewRoute).toContain("review_front_desk_report");
    expect(reviewRoute).toContain("p_expected_version: parsed.data.version");
  });
  it("maps the hotel day to an exact UTC window", () => {
    expect(hotelDayWindow("2026-09-05")).toEqual({ start: "2026-09-04T16:00:00.000Z", end: "2026-09-05T16:00:00.000Z" });
  });
  it("aggregates a day's front desk activity from source rows", () => {
    const rows: DailyReportRows = {
      reservationsCreated: [{ source: "Website" }, { source: "Website" }, { source: null }],
      checkedIn: [{}, {}],
      checkedOut: [{}],
      reservationAuditEvents: [{ action: "cancel_reservation" }, { action: "reservation_no_show" }, { action: "reservation_check_in" }],
      guestRequestsOpened: [{}, {}, {}],
      guestRequestsEscalated: [{}],
      openRequests: [{ department: "front_desk" }, { department: "front_desk" }, { department: "housekeeping" }],
      settledPayments: [{ purpose: "reservation_deposit", method: "gcash", amount: 2670 }, { purpose: "stay_payment", method: "cash", amount: 6230 }, { purpose: "reservation_deposit", method: "cash", amount: "1000.50" }],
      cashShiftsClosed: [{ expected_cash: 7230.50, actual_cash: 7200, variance: -30.50 }],
      housekeepingCompleted: [{ task_type: "checkout_cleaning", started_at: "2026-09-05T09:00:00Z", completed_at: "2026-09-05T09:45:00Z", inspection_status: "passed", status: "completed" }],
      rooms: [{ status: "occupied" }, { status: "occupied" }, { status: "available" }],
      transportation: [{ status: "COMPLETED" }, { status: "REQUESTED" }],
      approvals: [{ status: "pending" }]
    };
    const snapshot = summarizeDailyActivity(rows, "2026-09-05");
    expect(snapshot.reservations).toMatchObject({ created: 3, arrivals: 2, departures: 1, cancelled: 1, noShow: 1 });
    expect(snapshot.reservations.bySource).toEqual({ Website: 2, unknown: 1 });
    expect(snapshot.guestRequests).toMatchObject({ opened: 3, escalated: 1 });
    expect(snapshot.guestRequests.openByDepartment).toEqual({ front_desk: 2, housekeeping: 1 });
    expect(snapshot.collections).toEqual({ count: 3, total: 9900.5, byPurpose: { reservation_deposit: 2, stay_payment: 1 }, byMethod: { gcash: 2670, cash: 7230.5 } });
    expect(snapshot.cashShifts).toEqual({ closed: 1, counted: 7200, expected: 7230.5, variance: -30.5 });
    expect(snapshot.rooms).toEqual({ occupied: 2, available: 1 });
    expect(snapshot.transportation).toEqual({ COMPLETED: 1, REQUESTED: 1 });
    expect(snapshot.approvals).toEqual({ pending: 1 });
    expect(snapshot.reportDate).toBe("2026-09-05");
  });
});

describe("cash payment collection", () => {
  it("generates an internal CASH- reference and requires an open shift server-side", () => {
    expect(cashMigration).toContain("CASH_SHIFT_REQUIRED");
    expect(cashMigration).toContain("'CASH-'||to_char(clock_timestamp(),'YYMMDD')");
    expect(cashMigration).toContain("reference text)language plpgsql");
    expect(cashMigration).toContain("coalesce(v_ref,trim(p_reference))");
  });
  it("keeps the collector role gate NULL-safe and restricted to the API's two roles", () => {
    expect(cashMigration).toContain("actor is null or actor not in('front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN'");
  });
  it("still demands an external reference for electronic methods only", () => {
    expect(cashMigration).toContain("lower(trim(p_method))<>'cash'and nullif(trim(p_reference),'')is null");
    expect(cashMigration).toContain("grant execute on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)to service_role");
  });
  it("makes the route reference rule method-aware and maps the shift error", () => {
    expect(paymentRoute).toContain("value.method!==\"cash\"");
    expect(paymentRoute).toContain("CASH_SHIFT_REQUIRED");
    expect(paymentRoute).toContain("isCash?null:");
  });
  it("hides the reference field for cash in the collect dialog", () => {
    expect(arrivalDialog).toContain('showWhen: (v: string | number | boolean) => String(v) !== "cash"');
    expect(arrivalDialog).toContain('reference: method === "cash" ? null : String(data.reference)');
  });
});

describe("centralized reporting replaces scattered module exports", () => {
  it("keeps exactly one window.print — on the Reports page itself", () => {
    expect(dashboard.match(/window\.print/g)?.length ?? 0).toBe(1);
    expect(transportationPanel).not.toContain("window.print");
  });
  it("keeps the legitimate document downloads", () => {
    expect(dashboard).toContain('generateDocument({documentType:"receipt"');
    expect(dashboard).toContain('generateDocument({documentType:"folio"');
  });
  it("gives Front Desk the Reports page and states that Export never submits", () => {
    expect(dashboard).toContain('roles: ["manager", "accounting", "front_desk"]');
    expect(dashboard).toContain("FrontDeskReportsPanel");
    expect(reportsPanel).toContain("It does not submit anything to the Manager");
    expect(reportsPanel).toContain("Submit to Manager");
  });
});
