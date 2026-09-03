import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccess, canManageReservation, canPerformHousekeeping, canProcessRefund, canReviewManagerApprovals } from "@/lib/permissions";

const read=(path:string)=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/20260903010000_system_integration_hardening.sql");
const auth=read("lib/auth.ts");
const password=read("app/api/account/password/route.ts");
const customerRoutes=["app/api/account/profile/route.ts","app/api/account/requests/route.ts","app/api/account/reservations/[id]/cancel/route.ts","app/api/account/reservations/[id]/change-request/route.ts","app/api/account/reservations/[id]/payments/route.ts","app/api/booking/holds/route.ts","app/api/booking/holds/[token]/confirm/route.ts"].map(read);

describe("system-wide integration hardening",()=>{
  it("invalidates stale or disabled JWT authority and rotates sessions after password changes",()=>{
    expect(auth).toContain("token.authVersion !== databaseVersion");
    expect(password).toContain("auth_version:Number(account.auth_version??1)+1");
    expect(password).toContain('.eq("auth_version",account.auth_version??1)');
    for(const route of customerRoutes)expect(route).toContain("session.user.disabled");
  });

  it("keeps the application RBAC matrix at departmental least privilege",()=>{
    expect(canManageReservation("front_desk")).toBe(true);
    expect(canManageReservation("admin")).toBe(false);
    expect(canPerformHousekeeping("housekeeping")).toBe(true);
    expect(canPerformHousekeeping("owner")).toBe(false);
    expect(canProcessRefund("accounting")).toBe(true);
    expect(canProcessRefund("manager")).toBe(false);
    expect(canReviewManagerApprovals("manager")).toBe(true);
    expect(canReviewManagerApprovals("owner")).toBe(false);
    expect(canAccess("guest","reservations")).toBe(true);
  });

  it("re-declares the customer RPCs NULL-safe and keeps the service-role-only sellability/workflow boundary",()=>{
    // The single sellability gate (room_is_sellable with administratively_active,
    // maintenance_room_is_blocked, hotel_today) is already deployed remotely and is
    // locked to service_role by this migration's boundary block.
    for(const fn of ["room_is_sellable","create_booking_hold","submit_reservation_deposit","front_desk_assign_room","front_desk_check_in","front_desk_change_room","front_desk_checkout","front_desk_execute_manager_approval","request_manager_approval","review_manager_approval","manager_prioritize_housekeeping","manager_escalate_maintenance","maintenance_create_work_order","housekeeping_assign_task","record_staff_payment","accounting_execute_manager_financial_approval"])expect(migration).toContain(`'${fn}'`);
    for(const fn of ["customer_submit_guest_request","customer_request_reservation_change","customer_submit_stay_payment","verify_reservation_deposit"])expect(migration).toContain(`'${fn}'`);
    // NULL-safe actor guards (deny NULL and non-guest) with the ua.id qualification
    // that prevents the plpgsql 42702 ambiguous-column error on RETURNS TABLE(id,...).
    expect(migration).toContain("if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED'");
    expect(migration).toContain("from user_accounts ua where ua.id=p_user_id and ua.active");
    // No non-NULL-safe guard survives outside the explanatory comments.
    const withoutComments=migration.replace(/--[^\n]*/g,"");
    expect(withoutComments).not.toContain("if actor<>'guest'then");
  });

  it("is definition-only and contains no destructive data operation",()=>{
    expect(migration).not.toMatch(/\b(drop\s+table|drop\s+schema|truncate|delete\s+from|reset|reseed)\b/i);
    // DML legitimately appears inside re-declared function bodies; strip plpgsql
    // bodies ($$...$$) so this asserts no TOP-LEVEL business-data mutation.
    const topLevelOnly=migration.replace(/\$\$[\s\S]*?\$\$/g,"$$…$$");
    expect(topLevelOnly).not.toMatch(/\b(update|insert\s+into|delete\s+from)\s+(reservations|payments|rooms|room_types|housekeeping_tasks|maintenance_orders|user_accounts|guests|guest_requests|audit_logs|invoices|booking_holds|manager_approval_requests|reservation_change_requests|reservation_room_assignments|financial_adjustments|refund_requests)\b/i);
    expect(topLevelOnly).not.toMatch(/\bcreate\s+(or\s+replace\s+)?(table|schema)\b/i);
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("grant execute on function");
    expect(migration).toContain("to service_role");
  });
});