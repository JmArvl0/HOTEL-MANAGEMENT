import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-of-truth assertions: the check-in authority lives in the migration RPCs and
// the arrival/exception flow spans route handlers plus the arrival dialog. These tests
// pin the gates, the eligible-inventory contract, and the structured-ID exception
// request so a refactor cannot silently drop one.
const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260912020000_room_type_exception_checkin.sql");
const exceptionInventory = read("supabase/migrations/20260919010000_room_assignment_exception_inventory.sql");
const checkInRoute = read("app/api/front-desk/check-in/route.ts");
const eligible = read("app/api/front-desk/reservations/[id]/eligible-rooms/route.ts");
const requestRoute = read("app/api/manager/approvals/route.ts");
const reviewRoute = read("app/api/manager/approvals/[id]/review/route.ts");
const managerLib = read("lib/manager.ts");
const dashboard = read("components/manager/manager-dashboard-client.tsx");
const wizard = read("components/manager/front-desk-arrival-dialog.tsx");

describe("Front Desk check-in authority and readiness gates", () => {
  it("runs the null-safe Front Desk actor gate on every check-in entry", () => {
    expect(migration).toContain("if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN'");
    expect(checkInRoute).toContain('allowed=new Set(["front_desk"])');
    expect(eligible).toContain('const allowed = new Set(["front_desk"])');
  });
  it("re-checks identity, deposit, folio, window, and readiness atomically before any room step", () => {
    for (const rule of ["RESERVATION_NOT_CHECKIN_READY","GUEST_DETAILS_REQUIRED","RESERVATION_DEPOSIT_REQUIRED","OUTSIDE_CHECKIN_WINDOW","EARLY_CHECKIN_NOT_ALLOWED","IDENTITY_VERIFICATION_REQUIRED","FOLIO_NOT_FOUND","REMAINING_BALANCE_REQUIRED"]) expect(migration).toContain(rule);
    expect(migration).toContain("expire_booking_holds()");
    expect(migration).toContain("for update");
  });
  it("keeps room eligibility in one server-side RPC: clean, serviceable, conflict-free, active type", () => {
    // The route must not re-implement eligibility — it calls the inventory RPC.
    expect(eligible).toContain('supabase.rpc("front_desk_eligible_room_inventory"');
    // Room eligibility authority: active room type, administratively active room,
    // available, clean, not maintenance-blocked, no conflicting active assignment.
    for (const rule of ["and t.active", "coalesce(x.administratively_active,true)", "x.status='available'", "x.housekeeping='clean'", "not maintenance_room_is_blocked(x.id)", "ra.room_id=x.id", "ra.check_in<r.check_out and ra.check_out>r.check_in"]) expect(exceptionInventory).toContain(rule);
  });
  it("completes check-in through one shared assignment-and-occupied tail", () => {
    expect(migration).toContain("'Check-in assignment'");
    expect(migration).toContain("status='checked_in',checked_in_at=coalesce(checked_in_at,now())");
    expect(migration).toContain("update rooms set status='occupied'");
    expect(migration).toContain("'reservation_check_in'");
  });
});

describe("eligible-inventory endpoint contract", () => {
  it("returns reserved-type rooms plus alternative types only when the reserved type is empty", () => {
    expect(eligible).toContain("reservedRooms.length === 0 ? alternativeRoomTypes : []");
  });
  it("never offers the reserved type, inactive types, or zero-eligibility types as alternatives", () => {
    expect(eligible).toContain("item.room_type_name === reservation.room_type");
    expect(exceptionInventory).toContain("join room_types t on t.active");
    expect(eligible).toContain("type.eligibleRoomCount > 0");
  });
  it("serves an alternative type's eligible physical rooms and reports inventory changes", () => {
    expect(eligible).toContain('search.get("roomTypeId")');
    expect(eligible).toContain('"Room inventory changed. No eligible rooms remain for that room type."');
  });
  it("serves only the exact approved exception room while an approval awaits execution", () => {
    expect(eligible).toContain('.eq("request_type", "room_type_exception")');
    expect(eligible).toContain('.eq("execution_status", "awaiting_execution")');
    expect(eligible).toContain("!approvedRoomId || item.room_id === approvedRoomId");
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
    expect(migration).toContain("p_request_type='room_type_exception'then");
    for (const code of ["ROOM_TYPE_EXCEPTION_TYPE_REQUIRED","ROOM_TYPE_EXCEPTION_SAME_TYPE","ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE"]) expect(migration).toContain(code);
    // Insert-time guard: fabricated or stale IDs are rejected immediately.
    expect(exceptionInventory).toContain("validate_room_type_exception_request");
    for (const code of ["ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE","ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH"]) expect(exceptionInventory).toContain(code);
    expect(exceptionInventory).toContain("nullif(new.requested_action->>'roomType','') is distinct from t.name");
    expect(exceptionInventory).toContain("not public.front_desk_room_is_eligible(requested_room.id,r.id)");
    expect(requestRoute).toContain('value.type==="room_type_exception"&&(typeof action.roomType!=="string"||typeof action.requestedRoomTypeId!=="string"||typeof action.requestedRoomId!=="string")');
    expect(requestRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(requestRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH");
  });
  it("requests under the Front Desk request authority with its own audit trail", () => {
    expect(migration).toContain("actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN'");
    expect(migration).toContain("'request_manager_approval'");
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
    expect(migration).toContain("MANAGER_REVIEW_FORBIDDEN");
    expect(migration).toContain("SELF_APPROVAL_FORBIDDEN");
    expect(migration).toContain("a.status<>'pending'or a.version<>p_expected_version");
  });
  it("approves only when no same-type room is eligible and the exact requested room still is", () => {
    expect(migration).toContain("p_decision='approve'and a.request_type='room_type_exception'then");
    for (const code of ["ROOM_TYPE_EXCEPTION_SAME_TYPE","ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE","ROOM_TYPE_EXCEPTION_NOT_NEEDED","ROOM_TYPE_EXCEPTION_UNAVAILABLE"]) expect(migration).toContain(code);
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_NOT_NEEDED");
    expect(exceptionInventory).toContain("validate_room_type_exception_approval");
    expect(exceptionInventory).toContain("requested_room.type<>t.name");
    expect(exceptionInventory).toContain("if not public.front_desk_room_is_eligible(requested_room.id,r.id)");
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(reviewRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH");
  });
  it("leaves the approved exception awaiting Front Desk execution", () => {
    expect(migration).toContain("awaiting_execution");
  });
});

describe("check-in consumption and repricing", () => {
  it("consumes only the approved, unexecuted exception whose type matches the chosen room", () => {
    expect(migration).toContain("request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1");
  });
  it("revalidates the exact approved room and its live eligibility at check-in", () => {
    expect(exceptionInventory).toContain("validate_room_type_exception_check_in");
    expect(exceptionInventory).toContain("a.requested_action->>'requestedRoomTypeId'=target_id::text");
    expect(exceptionInventory).toContain("a.requested_action->>'requestedRoomId'=new.room_id");
    expect(exceptionInventory).toContain("ROOM_TYPE_EXCEPTION_ROOM_CHANGED");
    expect(exceptionInventory).toContain("not public.front_desk_room_is_eligible(new.room_id,old.id)");
  });
  it("reprices the folio to the target base rate x nights and rolls back when a balance remains", () => {
    expect(migration).toContain("new_total:=round(t.base_rate*(r.check_out-r.check_in),2);new_paid:=i.paid;");
    expect(migration).toContain("if new_total>new_paid then raise exception'ROOM_TYPE_EXCEPTION_BALANCE_DUE'");
    expect(migration).toContain("update invoices set amount=new_total,balance=round(greatest(new_total-new_paid,0),2),credit_balance=round(greatest(new_paid-new_total,0),2)");
    expect(migration).toContain("total=case when appr.id is null then r.total else new_total end");
  });
  it("marks the approval executed and audits the exception", () => {
    expect(migration).toContain("update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id");
    expect(migration).toContain("'execute_room_type_exception'");
    expect(migration).toContain("'previousRoomType',r.room_type");
  });
  it("surfaces the new gate messages through the check-in and eligible-room routes", () => {
    expect(checkInRoute).toContain('"Collect the repriced balance for the approved room type before check-in."');
    expect(checkInRoute).toContain('"The approved room type is no longer active."');
    expect(checkInRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE");
    expect(checkInRoute).toContain("ROOM_TYPE_EXCEPTION_ROOM_CHANGED");
    expect(eligible).toContain('.eq("request_type", "room_type_exception")');
  });
});

describe("Front Desk arrival UI wiring", () => {
  it("exposes the guided arrival flow from the Reservations row and detail action", () => {
    expect(dashboard).toContain("checkIn={openArrival}");
    expect(dashboard).toContain("FrontDeskArrivalDialog");
    expect(dashboard).toContain("Assign & check in");
    expect(wizard).toContain("/api/front-desk/check-in");
  });
  it("routes approved room-type exceptions and the generic request through the new type", () => {
    expect(dashboard).toContain("room_type_exception");
    expect(dashboard).toContain("executeException");
    expect(wizard).toContain("room_type_exception");
    expect(wizard).toContain("Request Manager approval");
  });
  it("keeps a readiness summary for confirmed arrivals", () => {
    expect(dashboard).toContain("Arrival readiness");
    expect(dashboard).toContain("arrival-chip");
  });
});
