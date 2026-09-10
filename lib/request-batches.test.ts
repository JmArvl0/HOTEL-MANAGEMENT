import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupRequestBatches, requestCode, type RequestBatchItem } from "@/lib/request-batches";

// The six grouping rules for guest-request history: one submission = one card.
let seq = 0;
const item = (overrides: Partial<RequestBatchItem> = {}): RequestBatchItem => ({
  id: `gr-${++seq}`,
  reservation_id: "RSV-1",
  request: "Extra towels",
  request_type: "extra_towels",
  batch_id: null,
  approval_status: "pending",
  approval_note: null,
  approved_at: null,
  department: "housekeeping",
  status: "open",
  created_at: "2026-09-05T08:00:00.000Z",
  ...overrides,
});

describe("guest-request submission grouping", () => {
  it("keeps a multi-item submission as one batch in filed order", () => {
    const batches = groupRequestBatches([
      item({ id: "b", batch_id: "11111111-1111-1111-1111-111111111111", created_at: "2026-09-05T08:00:02.000Z", request_type: "toiletries", request: "Toiletries" }),
      item({ id: "a", batch_id: "11111111-1111-1111-1111-111111111111", created_at: "2026-09-05T08:00:01.000Z" }),
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("separates two submissions into two batches, newest first", () => {
    const batches = groupRequestBatches([
      item({ batch_id: "11111111-1111-1111-1111-111111111111" }),
      item({ batch_id: "22222222-2222-2222-2222-222222222222", created_at: "2026-09-05T09:00:00.000Z" }),
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0].key).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("never merges same-instant submissions on the same reservation (grouping is by batch id, not time)", () => {
    const sameMoment = "2026-09-05T08:00:00.000Z";
    const batches = groupRequestBatches([
      item({ batch_id: "11111111-1111-1111-1111-111111111111", created_at: sameMoment }),
      item({ batch_id: "22222222-2222-2222-2222-222222222222", created_at: sameMoment }),
    ]);
    expect(batches).toHaveLength(2);
  });

  it("separates two submissions on the same reservation made at different times", () => {
    const batches = groupRequestBatches([
      item({ batch_id: "11111111-1111-1111-1111-111111111111", created_at: "2026-09-05T08:00:00.000Z" }),
      item({ batch_id: "22222222-2222-2222-2222-222222222222", created_at: "2026-09-06T08:00:00.000Z" }),
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0].key).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("files one checkout multi-select as one batch (shared stamp + deterministic regroup, never timestamps)", () => {
    const migration = readFileSync("supabase/migrations/20260909010000_checkout_request_batch.sql", "utf8");
    expect(migration).toContain("b:=md5(r.id||'|checkout')::uuid");
    // Both insert paths (per-option and the special_requests 'general' row) stamp the shared batch.
    expect(migration.match(/batch_id,batch_id|,batch_id,idempotency_key\)/g)?.length).toBe(2);
    expect(migration).toContain("set batch_id=md5(g.reservation_id||'|checkout')::uuid");
    expect(migration).toContain("idempotency_key=md5(r.id||'|general')::uuid");
  });

  it("keeps mixed item statuses inside one batch and derives the batch approval safely", () => {
    const batches = groupRequestBatches([
      item({ id: "done", batch_id: "33333333-3333-3333-3333-333333333333", status: "completed", approval_status: "approved", approved_at: "2026-09-05T10:00:00.000Z" }),
      item({ id: "working", batch_id: "33333333-3333-3333-3333-333333333333", status: "in_progress", approval_status: "approved", approved_at: "2026-09-05T10:00:00.000Z" }),
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((entry) => entry.status)).toEqual(["completed", "in_progress"]);
    expect(batches[0].approval).toBe("approved");
    expect(groupRequestBatches([item({ batch_id: "x1" }), item({ batch_id: "x1", approval_status: "rejected" })])[0].approval).toBe("rejected");
    expect(groupRequestBatches([item({ batch_id: "x1" })])[0].approval).toBe("pending");
  });

  it("derives a stable HVN-style code per submission from the batch id", () => {
    const [batch] = groupRequestBatches([item({ batch_id: "a2e64733-4501-888b-3966-64a95e6fb0d", created_at: "2026-09-05T08:00:00.000Z" })]);
    expect(requestCode(batch)).toBe("HVN-260905-A2E647");
    expect(requestCode(batch)).toBe(requestCode(groupRequestBatches(batch.items)[0]));
  });
});
