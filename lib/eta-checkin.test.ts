import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contract tests for the ETA-honored early check-in (defense, 2026-10-03):
// on the check-in date, once hotel-local time reaches the reservation's
// stated arrival time, the early-check-in block lifts like an approval.
// The migration re-asserts the 20260922010000 front_desk_check_in body
// plus four ETA regions; every other gate is untouched.

const migration = readFileSync("supabase/migrations/20261024130000_eta_honored_checkin.sql", "utf8");
const checkinRoute = readFileSync("app/api/front-desk/check-in/route.ts", "utf8");
const arrivalDialog = readFileSync("components/manager/front-desk-arrival-dialog.tsx", "utf8");

describe("eta-honored early check-in", () => {
  it("reuses the canonical check-in signature so grants and callers survive", () => {
    expect(migration).toContain(
      "create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void"
    );
  });

  it("parses only strict HH:MM arrival times and ignores free-text ETAs", () => {
    expect(migration).toContain("~'^([01][0-9]|2[0-3]):[0-5][0-9]$'");
    expect(migration).toContain("trim(r.expected_arrival)::time else null end");
  });

  it("lifts the early block only on the arrival date once the stated time passes", () => {
    expect(migration).toContain(
      "eta_ok:=eta_time is not null and local_now::date=r.check_in and local_now::time>=eta_time"
    );
    expect(migration).toContain(
      "if early_blocked and not eta_ok then raise exception'EARLY_CHECKIN_NOT_ALLOWED'"
    );
  });

  it("attributes ETA-driven check-ins distinctly from manager approvals in audit", () => {
    expect(migration).toContain("'managerEarlyApproval',early_approved");
    expect(migration).toContain("'earlyCheckInViaEta',early_blocked and eta_ok");
  });

  it("keeps every other gate untouched", () => {
    for (const code of [
      "OUTSIDE_CHECKIN_WINDOW",
      "IDENTITY_VERIFICATION_REQUIRED",
      "REMAINING_BALANCE_REQUIRED",
      "ROOM_NOT_READY",
      "ROOM_UNDER_MAINTENANCE",
      "ROOM_ALREADY_ASSIGNED",
    ])
      expect(migration).toContain(code);
  });

  it("tells staff the three ways check-in opens instead of a fixed 3PM", () => {
    expect(checkinRoute).toContain("or the stated arrival time once the room is ready");
    expect(checkinRoute).not.toContain("3:00 PM check-in time has not been reached");
  });

  it("shows the ETA and its effect on the review step", () => {
    expect(arrivalDialog).toContain("Expected arrival");
    expect(arrivalDialog).toContain("check-in opens at this time once the room is ready");
  });
});
