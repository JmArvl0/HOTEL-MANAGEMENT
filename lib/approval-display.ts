// Pure display helpers for the Manager Approvals & Escalations queue.
// Kept free of React so the formatting and the pending-first ordering are testable.

export type ApprovalRecord = Record<string, unknown>;

// Backend severity values (manager_approval_requests.severity): normal | high | critical.
const severityRank: Record<string, number> = { critical: 0, high: 1, normal: 2 };

// Pending-first operational order: severity, then longest-waiting (oldest) first.
// Undated or unknown-severity rows sort last inside their group.
export function compareApprovalUrgency(a: ApprovalRecord, b: ApprovalRecord): number {
  const rankA = severityRank[String(a.severity)] ?? 3;
  const rankB = severityRank[String(b.severity)] ?? 3;
  if (rankA !== rankB) return rankA - rankB;
  const timeA = Date.parse(String(a.requested_at ?? ""));
  const timeB = Date.parse(String(b.requested_at ?? ""));
  if (Number.isNaN(timeA)) return 1;
  if (Number.isNaN(timeB)) return -1;
  return timeA - timeB;
}

// Elapsed waiting time for pending requests, derived from requested_at at render
// time (the dashboard re-polls every 30s) — never stored alongside the row.
export function waitingSince(iso: unknown, now: number = Date.now()): string {
  const then = Date.parse(String(iso ?? ""));
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { const rest = minutes % 60; return rest ? `${hours}h ${rest}m` : `${hours}h`; }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

const detailLabels: Record<string, string> = {
  requestedRoomType: "Requested room type",
  priceDifference: "Price difference",
  waived: "Price difference waived",
  roomType: "Room type",
  originalRoomType: "Original room type",
  requestedRoomNumber: "Requested room",
  checkIn: "Check in",
  checkOut: "Check out",
  requestedTime: "Requested time",
  requestedUntil: "Requested until",
  amount: "Amount",
  arrangement: "Arrangement",
  requestedResolution: "Requested resolution",
};

const numberFormat = new Intl.NumberFormat("en-PH");

// Humanizes a requested_action / normal_policy_result JSONB object into
// "Label: value · Label: value". Empty values (null, "", false, 0-length) and
// raw uuid identifiers (requestedRoomTypeId & co — machine keys, never display
// data) are dropped; booleans read yes; numbers get separators.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Machine identifiers submitted alongside the human-readable fields (rooms use
// RM-XXXXXXXX ids) — never display data for the approval queue.
const hiddenKeys = new Set(["requestedRoomId", "requestedRoomTypeId", "originalRoomTypeId"]);

export function formatDetail(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (hiddenKeys.has(key)) continue;
    if (raw === null || raw === undefined || raw === false || raw === "") continue;
    const text = typeof raw === "boolean" ? "yes" : typeof raw === "number" ? numberFormat.format(raw) : String(raw);
    if (!text.trim() || uuidPattern.test(text)) continue;
    const name = detailLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    parts.push(`${name.charAt(0).toUpperCase()}${name.slice(1)}: ${text}`);
  }
  return parts.join(" · ");
}

// guest_escalation is the one escalation kind; every other request type is an
// approval exception raised by a department.
export function approvalKind(requestType: unknown): "escalation" | "approval" {
  return String(requestType) === "guest_escalation" ? "escalation" : "approval";
}
