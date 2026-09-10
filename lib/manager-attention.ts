import type { RecordItem } from "@/lib/types";

/**
 * MANAGER RESERVATION ATTENTION — derived, read-only operational indicators.
 *
 * Pure presentation state over server-authorized reservation data: the rules
 * here never mutate a reservation, never invent financial state, and never
 * re-derive room serviceability (they read the same authoritative room
 * fields — status/housekeeping/maintenance serviceability — that the rest of
 * HAVEN reads). Operational state changes stay in the Front Desk /
 * Accounting / Housekeeping / Maintenance workflows.
 */

export type AttentionSeverity = "high" | "warning" | "info";

export interface AttentionIssue {
  key: string;
  label: string;
  severity: AttentionSeverity;
  /** Supporting text shown under the badge / in the detail list. */
  detail?: string;
}

/** A reservation row plus the optional manager decorations lib/staff-data adds. */
export interface AttentionRow extends RecordItem {
  room_status?: string | null;
  room_housekeeping?: string | null;
  room_administratively_active?: boolean | null;
  room_maintenance_blocked?: boolean | null;
  pending_approval_type?: string | null;
  pending_approval_severity?: string | null;
  transport_status?: string | null;
  transport_pickup_date?: string | null;
  refund_pending?: boolean | null;
  escalated_request?: boolean | null;
}

const ACTIVE_STATUSES = ["pending", "confirmed", "checked_in"];
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const pretty = (value: string) => value.replaceAll("_", " ");
const isHighSeverity = (value: string | null | undefined) => ["high", "critical"].includes(String(value));

/**
 * Derive the ordered issue list for one reservation. The first issue is what
 * the manager table badges show; the whole list appears in the detail view.
 * Terminal reservations (checked_out/cancelled/no_show) never produce issues.
 */
export function deriveReservationAttention(row: AttentionRow, today: string): AttentionIssue[] {
  const status = String(row.status);
  const issues: AttentionIssue[] = [];
  const push = (key: string, label: string, severity: AttentionSeverity, detail?: string) =>
    issues.push({ key, label, severity, ...(detail ? { detail } : {}) });

  if (status === "checked_in") {
    const overdueDays = daysBetween(String(row.check_out), today);
    if (overdueDays > 0) {
      push("overdue_checkout", "Overdue checkout", "high", `Checkout date passed ${overdueDays} day${overdueDays !== 1 ? "s" : ""} ago`);
    }
  }

  // Arrival-day room readiness (authoritative room state only — never a second rule).
  if (status === "confirmed" && String(row.check_in) === today && row.room_number) {
    if (row.room_maintenance_blocked) {
      push("maintenance_conflict", "Maintenance conflict", "high", `Room ${String(row.room_number)} blocked by an open work order`);
    } else if (row.room_administratively_active === false) {
      push("room_unavailable", "Room unavailable", "high", `Room ${String(row.room_number)} is administratively inactive`);
    } else if (String(row.room_housekeeping) === "inspection") {
      push("awaiting_inspection", "Waiting for inspection", "high", `Room ${String(row.room_number)} is not sellable until inspected`);
    } else if (row.room_housekeeping && String(row.room_housekeeping) !== "clean") {
      push("room_not_ready", "Room not ready", "high", `Room ${String(row.room_number)} housekeeping state: ${pretty(String(row.room_housekeeping))}`);
    }
  }

  if (status === "confirmed" && String(row.check_in) < today) {
    const days = daysBetween(String(row.check_in), today);
    push("arrival_unresolved", "Arrival unresolved", "warning", `Check-in date passed ${days} day${days !== 1 ? "s" : ""} ago — possible no-show`);
  }

  if (row.pending_approval_type) {
    push(
      "manager_review",
      "Manager review required",
      isHighSeverity(row.pending_approval_severity) ? "warning" : "info",
      pretty(String(row.pending_approval_type)),
    );
  }

  if (status === "confirmed" && String(row.check_in) === today && !row.room_number) {
    push("room_assignment_pending", "Room assignment pending", "warning", "Arrival today");
  }

  if (["confirmed", "checked_in"].includes(status) && Number(row.folio_balance ?? 0) > 0) {
    push("outstanding_balance", "Outstanding balance", "info");
  }

  if (row.refund_pending) {
    push("refund_pending", "Refund exception pending", "info");
  }

  if (
    ACTIVE_STATUSES.includes(status) &&
    String(row.transport_status) === "REQUESTED" &&
    String(row.transport_pickup_date ?? "9999-12-31") <= today
  ) {
    push("transportation_pending", "Transportation unreviewed", "info", "Arrival transport still REQUESTED");
  }

  if (row.escalated_request) {
    push("escalated_request", "Escalated guest issue", "info");
  }

  return issues;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { high: 0, warning: 1, info: 2 };

/** True when the reservation carries any derived issue (drives the Attention Required filter). */
export const needsAttention = (row: AttentionRow, today: string) =>
  deriveReservationAttention(row, today).length > 0;

/** Attention rows sorted worst-first, then by stay date — the display order of the attention queue. */
export function byAttentionThenStay(today: string) {
  const rank = (row: AttentionRow) => {
    const top = deriveReservationAttention(row, today)[0];
    return top ? SEVERITY_RANK[top.severity] : 3;
  };
  return (a: AttentionRow, b: AttentionRow) => {
    const left = rank(a);
    const right = rank(b);
    if (left !== right) return left - right;
    return String(a.check_in).localeCompare(String(b.check_in));
  };
}
