import type { Role } from "@/lib/types";

export const ADMIN_ASSIGNABLE_ROLES = ["manager","front_desk","housekeeping","maintenance","accounting"] as const;
export const OWNER_ASSIGNABLE_ROLES = ["owner","admin",...ADMIN_ASSIGNABLE_ROLES,"guest"] as const;

export const ROLE_CAPABILITIES: Record<Role, string[]> = {
  owner: ["Executive oversight", "Admin governance", "Protected role governance", "Critical policy authority", "Owner-level exception authorization"],
  admin: ["User governance", "Room metadata", "Room types", "Operational policy", "Administrative audit"],
  manager: ["Operational oversight", "Approvals", "Escalations"],
  front_desk: ["Reservations", "Room assignment", "Check-in and checkout", "Guest coordination"],
  housekeeping: ["Room-care tasks", "Inspection", "Maintenance reporting"],
  maintenance: ["Work orders", "Diagnosis", "Technical serviceability"],
  accounting: ["Payments", "Folios", "Refunds", "Reconciliation"],
  guest: ["Own reservations", "Own payments", "Own requests"]
};

export const canAdministerSystem = (role: Role) => role === "owner" || role === "admin";
