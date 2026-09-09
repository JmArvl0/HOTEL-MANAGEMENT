import type { Resource, Role } from "@/lib/types";

const financial: Resource[] = ["reservations", "invoices", "payments", "refunds"];
const access: Record<Role, Resource[]> = {
  // Owner has executive read visibility. Generic mutations are blocked separately and
  // departmental execution always uses the explicit capability functions below.
  owner: ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "maintenance_orders", "invoices", "payments", "refunds", "inventory", "staff"],
  admin: [],
  manager: ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "maintenance_orders", "inventory"],
  front_desk: ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "invoices", "payments", "inventory"],
  housekeeping: ["rooms", "guest_requests", "housekeeping_tasks", "inventory"],
  maintenance: ["rooms", "guest_requests", "maintenance_orders", "inventory"],
  accounting: [...financial],
  guest: ["reservations", "invoices"]
};

export const canAccess = (role: Role, resource: Resource) => access[role]?.includes(resource) ?? false;
export const canViewGuestContact = (role: Role) => ["owner", "manager", "front_desk"].includes(role);
export const canManageReservation = (role: Role) => role === "front_desk";
export const canViewReservationFinancials = (role: Role) => ["owner", "manager", "front_desk", "accounting"].includes(role);
// Proof review (deposits, guest-submitted stay payments) is Accounting's decision alone;
// front desk collects money but never blesses the proof.
export const canVerifyDeposit = (role: Role) => role === "accounting";

const financialAuthority: Role[] = ["accounting"];
const cashHandling: Role[] = ["front_desk", "accounting"];
export const canCollectPayment = (role: Role) => cashHandling.includes(role);
export const canPostFolioCharge = (role: Role) => role === "front_desk";
export const canProcessRefund = (role: Role) => financialAuthority.includes(role);
export const canAdjustFolio = (role: Role) => financialAuthority.includes(role);
export const canAcceptOverpayment = (role: Role) => financialAuthority.includes(role);
export const canReconcileFinancials = (role: Role) => financialAuthority.includes(role);
export const canOperateCashShift = (role: Role) => cashHandling.includes(role);
export const canIssueFinancialDocument = (role: Role) => cashHandling.includes(role);
// Executive financial visibility is intentionally distinct from Accounting mutation authority.
export const canViewAccountingLedger = (role: Role) => ["owner", "accounting"].includes(role);
// Room-type catalog pricing is propose-then-approve: Manager maintains content and
// proposes rates; only Owner/Admin decide them (or set rates directly).
export const canSetRoomTypeRate = (role: Role) => role === "owner" || role === "admin";
export const canProposeRoomTypeRate = (role: Role) => role === "manager";
export const canReviewManagerApprovals = (role: Role) => role === "manager";
export const canRequestManagerApproval = (role: Role) => ["front_desk", "housekeeping", "maintenance", "accounting"].includes(role);
export const canExecuteManagerApproval = (role: Role) => role === "front_desk";
export const canExecuteManagerFinancialApproval = (role: Role) => role === "accounting";
export const canCoordinateOperations = (role: Role) => role === "manager";
export const canPerformHousekeeping = (role: Role) => role === "housekeeping";
export const canReportHousekeepingMaintenance = canPerformHousekeeping;
// Transportation: Front Desk executes the operational path; Manager may only
// cancel/reject (supervisory exception handling); Owner has read visibility.
// Daily operations reporting: Front Desk generates and submits the day's
// snapshot; only the Manager reviews it.
export const canGenerateFrontDeskReport = (role: Role) => role === "front_desk";
export const canReviewFrontDeskReports = (role: Role) => role === "manager";
export const canViewTransportation = (role: Role) => ["front_desk", "manager", "owner"].includes(role);
export const canOperateTransportation = (role: Role) => role === "front_desk";
export const canCancelTransportation = (role: Role) => ["front_desk", "manager"].includes(role);
// Staff & Duty is operational supervision for the Manager alone: a hotel-wide
// workforce view department staff must not see, and deliberately NOT account
// administration — employee lifecycle stays with Owner/Admin governance.
export const canViewStaffDuty = (role: Role) => role === "manager";