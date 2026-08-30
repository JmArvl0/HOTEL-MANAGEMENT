import type { Resource, Role } from "@/lib/types";
const financial: Resource[] = ["reservations","invoices","payments","refunds"];
const access: Record<Role, Resource[]> = {
 owner:["reservations","rooms","guests","guest_requests","housekeeping_tasks","maintenance_orders","invoices","payments","refunds","inventory","staff"],
 admin:["reservations","rooms","guests","guest_requests","housekeeping_tasks","maintenance_orders","invoices","payments","refunds","inventory","staff"],
 manager:["reservations","rooms","guests","guest_requests","housekeeping_tasks","maintenance_orders"],
 front_desk:["reservations","rooms","guests","guest_requests","housekeeping_tasks","invoices","payments"],
 housekeeping:["rooms","guest_requests","housekeeping_tasks","inventory"],
 maintenance:["rooms","guest_requests","maintenance_orders","inventory"],
 accounting:[...financial,"inventory"],
 guest:["reservations","invoices"]
};
export const canAccess=(role:Role,resource:Resource)=>access[role]?.includes(resource)??false;
export const canViewGuestContact=(role:Role)=>["owner","admin","manager","front_desk"].includes(role);
export const canManageReservation=(role:Role)=>["owner","admin","front_desk"].includes(role);
export const canViewReservationFinancials=(role:Role)=>["owner","admin","manager","front_desk","accounting"].includes(role);
export const canVerifyDeposit=(role:Role)=>["owner","admin","front_desk","accounting"].includes(role);
// Financial authority. Single source of truth for the TS side; every route re-checks server-side
// and the underlying RPC gates the same roles again, so UI hiding is never the only control.
const financialAuthority:Role[]=["owner","admin","accounting"];
const cashHandling:Role[]=["owner","admin","front_desk","accounting"];
export const canCollectPayment=(role:Role)=>cashHandling.includes(role);
export const canPostFolioCharge=(role:Role)=>["owner","admin","front_desk"].includes(role);
export const canProcessRefund=(role:Role)=>financialAuthority.includes(role);
export const canAdjustFolio=(role:Role)=>financialAuthority.includes(role);
export const canAcceptOverpayment=(role:Role)=>financialAuthority.includes(role);
export const canReconcileFinancials=(role:Role)=>financialAuthority.includes(role);
export const canOperateCashShift=(role:Role)=>cashHandling.includes(role);
export const canIssueFinancialDocument=(role:Role)=>cashHandling.includes(role);
export const canViewAccountingLedger=(role:Role)=>financialAuthority.includes(role);
export const canReviewManagerApprovals=(role:Role)=>["owner","admin","manager"].includes(role);
export const canRequestManagerApproval=(role:Role)=>["owner","admin","front_desk","housekeeping","maintenance","accounting"].includes(role);
export const canExecuteManagerApproval=(role:Role)=>["owner","admin","front_desk"].includes(role);
export const canExecuteManagerFinancialApproval=(role:Role)=>["owner","admin","accounting"].includes(role);
export const canCoordinateOperations=(role:Role)=>["owner","admin","manager"].includes(role);

export const canPerformHousekeeping=(role:Role)=>["owner","admin","housekeeping"].includes(role);
export const canReportHousekeepingMaintenance=canPerformHousekeeping;
