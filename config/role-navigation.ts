import type { AccountingSection, ManagerSection, Resource, Role } from "@/lib/types";
import { canAccess, canUseStaffWorkspace } from "@/lib/permissions";

export type Section = "overview" | "room_rack" | Resource | "reports" | AccountingSection | ManagerSection;

// Single authority for staff workspace navigation structure (labels,
// sections, role scope, sidebar groups). Icons stay presentational in
// manager-dashboard-client.tsx, which derives its `nav` from NAV_ITEMS —
// structure changes happen here, once.
//
// Domain boundaries enforced here:
// - Guest Requests: front_desk inbox (review), manager read-only,
//   housekeeping fulfillment. Maintenance has no tab (its render path never
//   existed); maintenance files work orders from its own queue.
// - Payment History gives staff access to recorded payment status.
// - Approvals & Escalations: manager command center; filing roles
//   (front_desk/housekeeping/maintenance/accounting) see filed-by-me scope.

export type NavGroupId = "workspace" | "front_office" | "operations" | "finance" | "management";

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "front_office", label: "Front Office" },
  { id: "operations", label: "Operations" },
  { id: "finance", label: "Cashiering" },
  { id: "management", label: "Management" },
];

export type NavItem = { label: string; section: Section; roles?: Role[]; group: NavGroupId; hidden?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", section: "overview", group: "workspace" },
  { label: "Hotel Operations", section: "hotel_operations", roles: ["front_desk","manager","housekeeping","maintenance","accounting"], group: "operations" },
  { label: "Room Management", section: "room_rack", roles: ["front_desk", "manager", "owner"], group: "front_office" },
  { label: "Bookings", section: "reservations", group: "front_office" },
  // The legacy rooms route remains available for existing links; the room
  // calendar and authorized configuration entry live under Room Management.
  { label: "Rooms", section: "rooms", group: "front_office", hidden: true },
  { label: "Guest Management", section: "guests", group: "front_office" },
  { label: "Guest Requests", section: "guest_requests", roles: ["front_desk", "manager", "housekeeping"], group: "front_office" },
  { label: "Transportation", section: "transportation", roles: ["front_desk", "manager", "owner"], group: "front_office" },
  { label: "Approvals & Escalations", section: "approvals", roles: ["manager", "front_desk", "housekeeping", "maintenance", "accounting"], group: "operations" },
  { label: "Housekeeping", section: "housekeeping_tasks", group: "operations" },
  { label: "Maintenance", section: "maintenance_orders", group: "operations" },
  { label: "Hotel Supplies", section: "inventory", roles: ["manager", "housekeeping", "maintenance"], group: "operations" },
  { label: "Reports", section: "reports", roles: ["manager", "accounting", "front_desk"], group: "operations" },
  { label: "Billing", section: "invoices", roles: ["accounting"], group: "finance" },
  { label: "Transactions", section: "transactions", roles: ["accounting"], group: "finance" },
  { label: "Guest Folios", section: "folios", roles: ["accounting"], group: "finance" },
  { label: "Payment History", section: "payments", roles: ["accounting"], group: "finance" },
  { label: "Refunds", section: "refunds", roles: ["accounting"], group: "finance" },
  { label: "Cash & Shifts", section: "cash_shifts", roles: ["front_desk", "accounting"], group: "finance" },
  { label: "Reconciliation", section: "reconciliation", roles: ["accounting"], group: "finance" },
  { label: "Financial Documents", section: "documents", roles: ["accounting"], group: "finance" },
  { label: "Operational Handover", section: "team_operations", roles: ["manager", "front_desk", "housekeeping", "maintenance", "accounting"], group: "operations" },
  { label: "Lost & Found", section: "lost_found", roles: ["manager", "front_desk", "housekeeping"], group: "operations" },
  { label: "Staff & Duty", section: "staff_duty", roles: ["manager"], group: "management" },
  { label: "Room Types & Photos", section: "room_types", roles: ["manager"], group: "management" },
  { label: "Transfer Vehicles", section: "transport_services", roles: ["manager"], group: "management" },
  { label: "Request Types", section: "request_types", roles: ["manager"], group: "management" },
  { label: "Predictive Analytics", section: "insights", roles: ["manager"], group: "management" },
  { label: "HAVEN AI", section: "ai", roles: ["manager"], group: "management" },
];

export const groupedNav = <T extends { section: Section; group: NavGroupId }>(items: T[]) =>
  NAV_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.id) })).filter(
    (group) => group.items.length > 0
  );

export const canOpenSection = (allowed: readonly Section[], section: Section) =>
  section === "room_rack"
    ? allowed.includes("reservations") && allowed.includes("rooms")
    : allowed.includes(section);

export const staffSections = (role: Role): Section[] => {
  if (!canUseStaffWorkspace(role)) return [];
  const sections = NAV_ITEMS.filter(item =>
    item.section === "overview" || (item.roles ? item.roles.includes(role) : canAccess(role, item.section as Resource)),
  ).map(item => item.section);
  return sections.filter(section => canOpenSection(sections, section));
};
