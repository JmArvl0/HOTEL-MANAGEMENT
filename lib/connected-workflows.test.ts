import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";import{canAccess}from"@/lib/permissions";
const migration=readFileSync("supabase/migrations/20260828050000_connected_hotel_workflows.sql","utf8");
const confirmationMigration=readFileSync("supabase/migrations/20260828060000_preserve_hold_policy_on_confirmation.sql","utf8");
const checkIn=readFileSync("app/api/front-desk/check-in/route.ts","utf8");
const customerCancel=readFileSync("app/api/account/reservations/[id]/cancel/route.ts","utf8");
const changeRequest=readFileSync("app/api/account/reservations/[id]/change-request/route.ts","utf8");
const resourceRoute=readFileSync("app/api/resources/[resource]/route.ts","utf8");
const dashboard=readFileSync("components/manager/manager-dashboard-client.tsx","utf8");
describe("connected hotel workflow schema",()=>{
 it("freezes configurable operational policy on holds and reservations",()=>{expect(migration).toContain("hotel_operational_policies");expect(migration).toContain("booking_holds_policy_snapshot");expect(migration).toContain("reservations_policy_snapshot");expect(migration).toContain("where operational_policy_snapshot is null");expect(confirmationMigration).toContain("h.operational_policy_snapshot")});
 it("gates check-in on confirmation, deposit, hotel-local date, ID, balance, room readiness, and overlap",()=>{for(const gate of["RESERVATION_NOT_CHECKIN_READY","RESERVATION_DEPOSIT_REQUIRED","OUTSIDE_CHECKIN_WINDOW","IDENTITY_VERIFICATION_REQUIRED","REMAINING_BALANCE_REQUIRED","ROOM_NOT_READY","ROOM_UNDER_MAINTENANCE","ROOM_ALREADY_ASSIGNED"])expect(migration).toContain(gate);expect(checkIn).toContain('p_staff_user_id:session.user.id')});
 it("records idempotent payments and folio charges without rewriting the lodging total",()=>{expect(migration).toContain("folio_charges_idempotency_unique");expect(migration).toContain("payments where idempotency_key=p_idempotency_key");expect(migration).not.toContain("set total=total+round(p_amount,2)")});
 it("cancels atomically using the booking-time policy and refunds paid deposit only",()=>{expect(migration).toContain("coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot())");expect(migration).toContain("purpose='reservation_deposit'and status='paid'");expect(migration).toContain("refund_requests");expect(customerCancel).toContain('session.user.role!=="guest"')});
 it("preserves original payments and records refunds as separate transactions",()=>{expect(migration).toContain("'manual_refund',trim(p_reference),'refund','paid'");expect(migration).toContain("idempotency_key=rr.id");expect(migration).toContain("refund_requests set status='processed'")});
 it("turns checkout and department completion into readiness side effects",()=>{expect(migration).toContain("Post-checkout room turnover");expect(migration).toContain("status='dirty',housekeeping='dirty'");expect(migration).toContain("Post-maintenance clean and readiness check");expect(resourceRoute).toContain('rpc("complete_housekeeping_task"');expect(resourceRoute).toContain('rpc("resolve_maintenance_order"')});
 it("enforces no-show cutoff while retaining the deposit",()=>{expect(migration).toContain("NO_SHOW_CUTOFF_NOT_REACHED");expect(migration).toContain("'depositRetained',r.deposit")});
});
describe("connected workflow authorization and UI",()=>{
 it("limits refunds to Owner, Admin, and Accounting",()=>{for(const role of["owner","admin","accounting"]as const)expect(canAccess(role,"refunds")).toBe(true);for(const role of["manager","front_desk","housekeeping","maintenance","guest"]as const)expect(canAccess(role,"refunds")).toBe(false)});
 it("keeps guest cancellation and modification ownership-scoped",()=>{expect(customerCancel).toContain("p_actor_user_id:session.user.id");expect(changeRequest).toContain('.eq("user_id",session.user.id)');expect(changeRequest).toContain("selfServiceModificationDays")});
 it("exposes staff workflow actions without direct refund mutation",()=>{for(const action of["Verify ID","Collect payment","Post charge","Complete checkout","Process refund"])expect(dashboard).toContain(action);expect(resourceRoute).toContain('["payments","refunds"].includes(resource)')});
});