import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-of-truth assertions: the check-in authority lives in the migration RPCs and
// the arrival/exception flow spans route handlers plus the arrival dialog. These tests
// pin the gates, the eligible-inventory contract, and the structured-ID exception
// request so a refactor cannot silently drop one.
const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260912020000_room_type_exception_checkin.sql");
const exceptionInventory = read("supabase/migrations/20260919010000_room_assignment_exception_inventory.sql");
// 20260922010000 recreates every RPC below (check-in, request, review, execute) and is
// the LIVE authority for them — behavior pins target this file, not the superseded ones.
const repricing = read("supabase/migrations/20260922010000_room_type_change_responsibility.sql");
const checkInRoute = read("app/api/front-desk/check-in/route.ts");
const eligible = read("app/api/front-desk/reservations/[id]/eligible-rooms/route.ts");
const requestRoute = read("app/api/manager/approvals/route.ts");
const reviewRoute = read("app/api/manager/approvals/[id]/review/route.ts");
const acceptanceRoute = read("app/api/manager/approvals/[id]/record-acceptance/route.ts");
const managerLib = read("lib/manager.ts");
const dashboard = read("components/manager/manager-dashboard-client.tsx");
const wizard = read("components/manager/front-desk-arrival-dialog.tsx");
const approvalDisplay = read("lib/approval-display.ts");

describe("Front Desk check-in authority and readiness gates", () => {
  it("runs the null-safe Front Desk actor gate on every check-in entry", () => {
    expect(repricing).toContain("if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN'");
    expect(checkInRoute).toContain('allowed=new Set(["front_desk"])');
    expect(eligible).toContain('const allowed = new Set(["front_desk"])');
  });
  it("re-checks identity, deposit, folio, window, and readiness atomically before any room step", () => {
    for (const rule of ["RESERVATION_NOT_CHECKIN_READY","GUEST_DETAILS_REQUIRED","RESERVATION_DEPOSIT_REQUIRED","OUTSIDE_CHECKIN_WINDOW","EARLY_CHECKIN_NOT_ALLOWED","IDENTITY_VERIFICATION_REQUIRED","FOLIO_NOT_FOUND","REMAINING_BALANCE_REQUIRED"]) expect(repricing).toContain(rule);
    expect(repricing).toContain("expire_booking_holds()");
    expect(repricing).toContain("for update");
  });
  it("keeps room eligibility in one server-side RPC: clean, serviceable, conflict-free, active type", () => {
    // The route must not re-implement eligibility — it calls the inventory RPC.
    expect(eligible).toContain('supabase.rpc("front_desk_eligible_room_inventory"');
    // Room eligibility authority: active room type, administratively active room,
    // available, clean, not maintenance-blocked, no conflicting active assignment.
    for (const rule of ["and t.active", "coalesce(x.administratively_active,true)", "x.status='available'", "x.housekeeping='clean'", "not maintenance_room_is_blocked(x.id)", "ra.room_id=x.id", "ra.check_in<r.check_out and ra.check_out>r.check_in"]) expect(exceptionInventory).toContain(rule);
  });
  it("completes check-in through one shared assignment-and-occupied tail", () => {
    expect(repricing).toContain("'Check-in assignment'");
    expect(repricing).toContain("status='checked_in',checked_in_at=coalesce(checked_in_at,now())");
    expect(repricing).toContain("update rooms set status='occupied'");
    expect(repricing).toContain("'reservation_check_in'");
  });
});

describe("eligible-inventory endpoint contract", () => {
  it("always offers alternative types — a guest-requested voluntary upgrade is legitimate while reserved-type rooms remain", () => {
    expect(eligible).toContain("data: reservedRooms.map((item) => room(item, colorKeys))");
    expect(eligible).toContain("alternativeRoomTypes,");
    expect(eligible).toContain("legitimate exception even while reserved-type rooms remain");
    expect(eligible).not.toContain("reservedRooms.length === 0 ? alternativeRoomTypes");
  });
  it("never offers the reserved type, inactive types, or zero-eligibility types as alternatives", () => {
    expect(eligible).toContain("item.room_type_name === reservation.room_type");
    expect(exceptionInventory).toContain("join room_types t on t.active");
    expect(eligible).toContain("type.eligibleRoomCount > 0");
  });
  it("serves an alternative type's eligible physical rooms and reports inventory changes", () => {
    expect(eligible).toContain('search.get("roomTypeId")');
    expect(eligible).toContain('"Room inventory changed. No eligible rooms remain for that room type."');
    expect(eligible).toContain("typeRate: type?.base_rate ?? null");
  });
  it("serves only the exact approved exception room while an approval awaits execution", () => {
    expect(eligible).toContain('.eq("request_type", "room_type_exception")');
    expect(eligible).toContain('.eq("execution_status", "awaiting_execution")');
    expect(eligible).toContain("!approvedRoomId || item.room_id === approvedRoomId");
  });
  it("returns the server-stamped financials and acceptance state with an approved exception", () => {
    expect(eligible).toContain("financials: (action.financials ?? null)");
    expect(eligible).toContain("guestAcceptedAt: approved?.guest_accepted_at ?? null");
  });
});

describe("room-type exception request", () => {
  it("widens the approval allowlist to the new type", () => {
    expect(migration).toContain("manager_approval_requests_request_type_check");
    expect(migration).toContain("'room_type_exception'");
    expect(managerLib).toContain('"room_type_exception"');
    expect(requestRoute).toContain("z.enum(MANAGER_APPROVAL_TYPES)");
  });
  it("requires structured IDs, an active target type differing from the reserved type, and an eligible room", () => {
    expect(repricing).toContain("p_request_type='room_type_exception'then");
    for (const code of ["ROOM_TYPE_EXCEPTION_TYPE_REQUIRED","ROOM_TYPE_EXCEPTION_SAME_TYPE","ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE"]) expect(repricing).toContain(code);
    // Insert-time guard (recreated in 20260922010000): fabricated or stale IDs are
    // rejected immediately.
    expect(repricing).toContain("validate_room_type_exception_request");
    for (const code of ["ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE","ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH"]) expect(repricing).toContain(code);
    expect(repricing).toContain("nullif(new.requested_action->>'roomType','') is distinct from t.name");
    expect(repricing).toContain("not public.front_desk_room_is_eligible(requested_room.id,r.id)");
    expect(requestRoute).toContain('value.type==="room_type_exception"&&(typeof action.roomType!=="string"||typeof action.requestedRoomTypeId!=="string"||typeof action.requestedRoomId!=="string")');
    expect(requestRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(requestRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH");
  });
  it("requests under the Front Desk request authority with its own audit trail", () => {
    expect(repricing).toContain("actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN'");
    expect(repricing).toContain("'request_manager_approval'");
  });
  it("no longer allows a free-typed target room type anywhere in the UI", () => {
    // The arrival dialog offers server-fed selects instead of free text…
    expect(wizard).toContain("Select an available room type");
    expect(wizard).toContain("requestedRoomTypeId: alternative.roomTypeId");
    expect(wizard).toContain("requestedRoomId: room.id");
    expect(wizard).toContain("originalRoomTypeId: reservedRoomTypeId");
    expect(wizard).toContain("originalRoomType: reservation?.room_type");
    expect(wizard).not.toContain("Enter an active room type");
    // …and the generic exception form no longer offers this type at all.
    expect(dashboard).not.toContain("exceptionRoomType");
  });
});

describe("Manager review of a room-type exception", () => {
  it("stays Manager-gated and version-safe", () => {
    expect(repricing).toContain("MANAGER_REVIEW_FORBIDDEN");
    expect(repricing).toContain("SELF_APPROVAL_FORBIDDEN");
    expect(repricing).toContain("a.status<>'pending'or a.version<>p_expected_version");
  });
  it("approves only when no same-type room is eligible and the exact requested room still is", () => {
    expect(repricing).toContain("p_decision='approve'and a.request_type='room_type_exception'then");
    for (const code of ["ROOM_TYPE_EXCEPTION_SAME_TYPE","ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE","ROOM_TYPE_EXCEPTION_NOT_NEEDED","ROOM_TYPE_EXCEPTION_UNAVAILABLE"]) expect(repricing).toContain(code);
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_NOT_NEEDED");
    expect(repricing).toContain("validate_room_type_exception_approval");
    expect(repricing).toContain("requested_room.type<>t.name");
    expect(repricing).toContain("if not public.front_desk_room_is_eligible(requested_room.id,r.id)");
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH");
  });
  it("leaves the approved exception awaiting Front Desk execution", () => {
    expect(repricing).toContain("awaiting_execution");
  });
});

describe("check-in consumption and financial responsibility", () => {
  it("consumes only the approved, unexecuted exception whose type matches the chosen room", () => {
    expect(repricing).toContain("request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1");
  });
  it("revalidates the exact approved room and its live eligibility at check-in", () => {
    expect(exceptionInventory).toContain("validate_room_type_exception_check_in");
    expect(exceptionInventory).toContain("a.requested_action->>'requestedRoomTypeId'=target_id::text");
    expect(exceptionInventory).toContain("a.requested_action->>'requestedRoomId'=new.room_id");
    expect(exceptionInventory).toContain("ROOM_TYPE_EXCEPTION_ROOM_CHANGED");
    expect(exceptionInventory).toContain("not public.front_desk_room_is_eligible(new.room_id,old.id)");
  });
  it("derives the priced outcome from the stamped responsibility instead of repricing to the live rate", () => {
    // The request-time snapshot governs; only the night count is re-derived so a date
    // change cannot silently invalidate the approved numbers.
    expect(repricing).toContain("if coalesce((appr.requested_action->'financials'->>'nights')::int,0)<>(r.check_out-r.check_in)then raise exception'APPROVAL_STALE'");
    // Guest pays a positive difference: acceptance must already be recorded (the charge
    // was posted to the folio at acceptance) and the total becomes the stamped target.
    expect(repricing).toContain("if appr.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED'");
    expect(repricing).toContain("new_total:=round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0),2)");
    // Hotel-caused or downgrade: the original agreed total stands — no repricing, no refund.
    expect(repricing).toContain("new_total:=r.total;");
    // The unconditional invoice rewrite is gone: the folio already reflects any posted
    // difference, and overwriting invoices.amount would drop unrelated charges. (The
    // reservation_modification branch still legitimately rewrites the invoice.)
    expect(repricing).not.toContain("update invoices set amount=new_total,balance=round(");
    expect(repricing).not.toContain("ROOM_TYPE_EXCEPTION_BALANCE_DUE");
  });
  it("marks the approval executed and audits the exception with derived financials", () => {
    expect(repricing).toContain("update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id");
    expect(repricing).toContain("'execute_room_type_exception'");
    expect(repricing).toContain("'previousRoomType',r.room_type");
    expect(repricing).toContain("'hotelAbsorbedAmount'");
    expect(repricing).toContain("'guestPaidDifference'");
  });
  it("surfaces the new gate messages through the check-in and eligible-room routes", () => {
    expect(checkInRoute).toContain("ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED");
    expect(checkInRoute).toContain("APPROVAL_STALE");
    expect(checkInRoute).toContain('"The approved room type is no longer active."');
    expect(checkInRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(checkInRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_CHANGED");
    expect(eligible).toContain('.eq("request_type", "room_type_exception")');
  });
});

describe("reason-coded financial responsibility", () => {
  it("derives responsibility from a structured reason code in one SQL helper", () => {
    expect(repricing).toContain("create or replace function public.room_type_change_responsibility(p_reason text)returns text");
    for (const code of ["hotel_type_unavailable","hotel_room_unserviceable","hotel_maintenance","hotel_overbooking","hotel_error","hotel_early_checkin_failure","guest_larger_room","guest_premium_type","guest_better_view","guest_early_arrival_upgrade"]) expect(repricing).toContain(code);
  });
  it("requires a valid reason code for room_type_exception and room_upgrade, and an approved early check-in for the failure reason", () => {
    for (const code of ["ROOM_TYPE_EXCEPTION_REASON_REQUIRED","ROOM_TYPE_EXCEPTION_REASON_INVALID","ROOM_TYPE_EXCEPTION_EARLY_CHECKIN_PRECONDITION"]) {
      expect(repricing).toContain(code);
      expect(requestRoute).toContain(code);
    }
    expect(repricing).toContain("if p_request_type in('room_type_exception','room_upgrade')then");
    expect(repricing).toContain("and r.early_check_in_approved_until is null then raise exception'ROOM_TYPE_EXCEPTION_EARLY_CHECKIN_PRECONDITION'");
  });
  it("stamps the server-computed financial snapshot and never trusts client-submitted financial fields", () => {
    expect(repricing).toContain("p_requested_action:=p_requested_action-'financials'-'priceDifference'-'waived'-'guest_charge'-'hotel_absorbed_amount'-'financial_responsibility'");
    expect(repricing).toContain("'financials',jsonb_build_object('reasonCode'");
    expect(requestRoute).toContain("const CLIENT_FINANCIAL_FIELDS=");
    expect(requestRoute).toContain("Financial responsibility is derived from the reason code, not submitted manually.");
    expect(requestRoute).toContain('["room_upgrade","room_type_exception"].includes(value.type)&&!ROOM_TYPE_CHANGE_REASONS.some');
  });
  it("gates the same-type-available rejections to hotel-caused changes only", () => {
    // review RPC + insert/approval triggers + room_upgrade execution all branch on the
    // derived responsibility before raising NOT_NEEDED / SAME_TYPE_AVAILABLE / STALE.
    expect(repricing).toContain("if coalesce(a.requested_action->'financials'->>'responsibility','')='hotel'then");
    expect(repricing).toContain("if coalesce(new.requested_action->'financials'->>'responsibility','')='hotel'");
  });
  it("rejects legacy room-type-change requests that predate the reason model at review", () => {
    expect(repricing).toContain("if a.requested_action->'financials'is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED'");
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_REASON_REQUIRED");
    expect(dashboard).toContain("predates reason-coded financial responsibility");
  });
  it("executes mid-stay room_upgrades with the stamped difference and requires recorded guest acceptance", () => {
    expect(repricing).toContain("round((a.requested_action->'financials'->>'difference')::numeric,2)");
    expect(repricing).toContain("if a.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED'");
    expect(repricing).toContain("'manager_approval',a.id::text");
    expect(dashboard).not.toContain('priceDifference: String');
  });
  it("records guest acceptance through a dedicated Front Desk RPC that posts to the folio idempotently", () => {
    expect(repricing).toContain("create or replace function public.record_room_type_change_acceptance");
    // Idempotent: a replay is a no-op once acceptance is stamped, and the folio insert
    // is keyed on the approval id.
    expect(repricing).toContain("if a.guest_accepted_at is not null then return;end if");
    expect(repricing).toContain("p_staff_user_id,a.id,'manager_approval',a.id::text");
    expect(repricing).toContain("perform sync_invoice_financials(i.id)");
    expect(repricing).toContain("revoke all on function public.record_room_type_change_acceptance(uuid,uuid) from public,anon,authenticated");
    expect(acceptanceRoute).toContain("record_room_type_change_acceptance");
    expect(acceptanceRoute).toContain("Front Desk execution authority required");
  });
  it("picks the reason in the UI but never a payer control", () => {
    expect(wizard).toContain("reasonCode: requestedReasonCode");
    expect(wizard).toContain("Hotel-caused — the hotel absorbs the difference");
    expect(wizard).toContain("Guest-requested — the guest pays the difference");
    expect(dashboard).toContain('requestedAction.reasonCode = String(data.reasonCode)');
    // The manual "who pays?" inputs are gone everywhere.
    expect(dashboard).not.toContain('name: "priceDifference"');
    expect(dashboard).not.toContain('name: "waived"');
  });
  it("renders the financial snapshot for the Manager and hides raw machine fields in the queue", () => {
    expect(dashboard).toContain("Financial responsibility");
    expect(dashboard).toContain("no automatic refund applies; review before approving");
    expect(approvalDisplay).toContain('"financials"');
    expect(approvalDisplay).toContain("roomTypeChangeReasonLabel");
  });
});
