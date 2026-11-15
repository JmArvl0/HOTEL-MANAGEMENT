/** Client-safe read model. Task activity and Workforce availability are separate facts. */
export type WorkforceStatus = "unmapped" | "awaiting_sync" | "stale" | "inactive" | "department_mismatch" | "outside_shift" | "off_duty" | "on_break" | "on_leave" | "on_duty";
export const WORKFORCE_STATUS_LABELS: Record<WorkforceStatus, string> = {
  unmapped: "Employee not linked", awaiting_sync: "Awaiting Workforce update", stale: "Update expired",
  inactive: "Inactive", department_mismatch: "Department needs review", outside_shift: "Outside shift",
  off_duty: "Off duty", on_break: "On break", on_leave: "On leave", on_duty: "On duty",
};
export interface WorkforceMember {
  userId: string;
  name: string;
  role: string;
  linkId: string | null;
  employeeId: string | null;
  status: WorkforceStatus;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
  observedAt: string | null;
  receivedAt: string | null;
  validUntil: string | null;
  openTasks: number;
}
export interface WorkforceSnapshot {
  generatedAt: string;
  scope: "team" | "self";
  canManage: boolean;
  receiverConfigured: boolean;
  settings: { sourceSystem: string; propertyId: string; autoAssignCheckout: boolean; version: number };
  unassignedCheckoutTasks: number;
  staff: WorkforceMember[];
}
