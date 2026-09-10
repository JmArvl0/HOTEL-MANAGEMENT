// lib/request-batches.ts
// One submission = one batch of guest-request items. Portal submissions share
// the client idempotency key as batch_id (customer_submit_guest_requests);
// checkout auto-filed rows share md5(reservation_id||'|checkout')
// (file_booking_guest_requests). Group only by that identifier — never by
// guest, reservation, timestamp, or category: two submissions made at the same
// instant must stay two cards. Client-safe; shared by the portal history page
// and the staff review panel.

export type RequestBatchItem = {
  id: string;
  reservation_id: string;
  request: string;
  request_type: string | null;
  batch_id: string | null;
  approval_status: string;
  approval_note: string | null;
  approved_at: string | null;
  department: string;
  status: string;
  created_at: string;
};

export type RequestBatch = {
  key: string;
  items: RequestBatchItem[];
  approval: "pending" | "approved" | "rejected";
};

export function groupRequestBatches(requests: RequestBatchItem[]): RequestBatch[] {
  const groups = new Map<string, RequestBatchItem[]>();
  for (const request of requests) {
    const key = String(request.batch_id ?? request.id);
    const existing = groups.get(key);
    if (existing) existing.push(request);
    else groups.set(key, [request]);
  }
  return Array.from(groups.values())
    .map((items): RequestBatch => {
      // Natural (filed) order inside a submission, newest submission first.
      const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        key: String(sorted[0].batch_id ?? sorted[0].id),
        items: sorted,
        approval: sorted.every((item) => item.approval_status === "pending")
          ? "pending"
          : sorted.some((item) => item.approval_status === "rejected")
            ? "rejected"
            : "approved",
      };
    })
    .sort((a, b) => b.items[0].created_at.localeCompare(a.items[0].created_at));
}

// Deterministic per-submission display number: submission date + first 6 hex
// of the batch id. No schema — the same batch always renders the same code.
export function requestCode(batch: RequestBatch): string {
  const date = new Date(batch.items[0].created_at);
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `HVN-${stamp}-${batch.key.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}
