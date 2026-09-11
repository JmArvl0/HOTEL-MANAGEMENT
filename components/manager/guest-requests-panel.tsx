"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, Bell, Boxes, ClipboardCheck, Search } from "lucide-react";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { canAccess } from "@/lib/permissions";
import { requestLabel } from "@/lib/request-options";
import { requestCode } from "@/lib/request-batches";
import type { Role } from "@/lib/types";

// Guest-request review workspace. Customer submissions arrive as batches (one
// portal submission = one batch_id = one Front Desk decision). Front Desk
// approves or declines; Manager sees the same queue read-only; Housekeeping
// receives its routed items with operational escalation controls. The inventory
// panel in the right rail is read-only supply context — stock edits stay with
// Housekeeping/Maintenance.
type StaffRequest = {
  id: string; reservation_id: string; guest_id: string | null; request: string; request_type: string | null;
  batch_id: string; approval_status: "pending" | "approved" | "rejected"; approval_note: string | null;
  approved_at: string | null; department: string; priority: string; status: string; created_at: string;
  escalation_status?: string | null;
  reservation?: { confirmation_number: string | null; guest_name: string | null; room_type: string | null; room_number: string | null } | null;
};
type InventoryItem = { id: string; name: string; category: string; quantity: number; reorder_point: number; unit: string; status: string };
type Batch = { key: string; items: StaffRequest[]; approval: "pending" | "approved" | "rejected" };

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const APPROVAL_LABELS: Record<Batch["approval"], string> = { pending: "Awaiting approval", approved: "Approved", rejected: "Declined" };
const QUEUES: [string, string][] = [["pending", "Awaiting approval"], ["approved", "Approved"], ["rejected", "Declined"], ["open", "Open work"], ["all", "All"]];

function groupBatches(requests: StaffRequest[]): Batch[] {
  const groups = new Map<string, StaffRequest[]>();
  for (const request of requests) {
    const key = String(request.batch_id ?? request.id);
    const existing = groups.get(key);
    if (existing) existing.push(request); else groups.set(key, [request]);
  }
  return Array.from(groups.values()).map((items): Batch => ({
    key: String(items[0].batch_id ?? items[0].id),
    items,
    approval: items.every((item) => item.approval_status === "pending") ? "pending" : items.some((item) => item.approval_status === "rejected") ? "rejected" : "approved",
  })).sort((a, b) => b.items[0].created_at.localeCompare(a.items[0].created_at));
}

export default function GuestRequestsPanel({ role, onEscalate }: { role: Role; onEscalate?: (request: StaffRequest) => void | Promise<void> }) {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const dialogs = useActionDialogs();
  const canReview = role === "front_desk";
  const canEscalate = role === "housekeeping" && Boolean(onEscalate);
  const showInventory = canAccess(role, "inventory");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/resources/guest_requests", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load guest requests.");
      setRequests(body.data ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load guest requests.");
    }
    if (!quiet) setLoading(false);
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => load(), 0); const timer = window.setInterval(() => load(true), 30000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  useEffect(() => {
    if (!showInventory) return;
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/resources/inventory", { cache: "no-store" });
      const body = await response.json();
      if (!cancelled && response.ok) setInventory(body.data ?? []);
    })();
    return () => { cancelled = true; };
  }, [showInventory]);

  async function review(batch: Batch, decision: "approve" | "reject", note?: string) {
    const response = await fetch("/api/front-desk/guest-requests/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: batch.key, decision, note }) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to review this submission."); return; }
    notify(decision === "approve" ? "Submission approved." : "Submission declined.");
    await load(true);
  }
  async function act(batch: Batch, decision: "approve" | "reject") {
    if (decision === "approve") {
      const ok = await dialogs.askConfirm({ title: "Approve submission", message: `Grant all ${batch.items.length} request${batch.items.length !== 1 ? "s" : ""} from ${batch.items[0].reservation?.guest_name ?? "this guest"}? Each routes to its department queue.`, confirmText: "Approve" });
      if (ok) await review(batch, "approve");
      return;
    }
    const note = await dialogs.askPrompt({ title: "Decline submission", message: "The guest sees this reason, and every request in the submission is cancelled — including pending Housekeeping tasks.", label: "Reason", multiline: true, rows: 3, required: true, validation: (v: string | number | boolean) => (String(v ?? "").trim() ? null : "A reason is required.") });
    if (note) await review(batch, "reject", String(note).trim());
  }
  async function escalate(item: StaffRequest) {
    await onEscalate?.(item);
    await load(true);
  }

  const batches = useMemo(() => groupBatches(requests), [requests]);
  const counts = {
    all: batches.length,
    pending: batches.filter((batch) => batch.approval === "pending").length,
    approved: batches.filter((batch) => batch.approval === "approved").length,
    rejected: batches.filter((batch) => batch.approval === "rejected").length,
    open: batches.filter((batch) => batch.approval === "approved" && batch.items.some((item) => ["open", "in_progress"].includes(item.status))).length,
  };
  const visible = batches.filter((batch) => {
    if (queue === "pending" && batch.approval !== "pending") return false;
    if (queue === "approved" && batch.approval !== "approved") return false;
    if (queue === "rejected" && batch.approval !== "rejected") return false;
    if (queue === "open" && !(batch.approval === "approved" && batch.items.some((item) => ["open", "in_progress"].includes(item.status)))) return false;
    return JSON.stringify(batch.items).toLowerCase().includes(search.toLowerCase());
  });
  const lowStock = inventory.filter((item) => item.status !== "healthy");

  // Control area (title, filters, search) stays full-width; the two-column
  // region starts below it so the inventory rail aligns with the request
  // content, not the page heading.
  return <div>
    <div className="page-title module-title">
      <div><p className="eyebrow">Hotel operations</p><h1>Guest requests</h1><p>{role === "housekeeping" ? "Approved guest requests routed to Housekeeping. Review each destination room and escalate unresolved work when coordination is needed." : "Customer submissions grouped as they were filed. Front Desk approves or declines each submission as one decision; approved items route to their department queue."}</p></div>
    </div>
    {error && <div className="empty"><Bell /><h3>Guest requests unavailable</h3><p>{error}</p></div>}
    {!error && (<>
      <ModuleSummaryCards cards={[
        { label: "Awaiting approval", value: counts.pending, hint: "Submission batches pending", icon: ClipboardCheck, tone: "attention", queue: "pending" },
        { label: "Open work", value: counts.open, hint: "Approved, in department queues", icon: Bell, tone: "today", queue: "open" },
        { label: "Approved", value: counts.approved, hint: "Granted submissions", icon: ClipboardCheck, tone: "done", queue: "approved" },
        { label: "Declined", value: counts.rejected, hint: "Refused submissions", icon: Bell, queue: "rejected" },
      ]} activeQueue={queue} onSelect={setQueue} ariaLabel="Guest requests summary"/>
      <div className="reservation-filters"><div>{QUEUES.map(([value, text]) => <button key={value} className={queue === value ? "active" : ""} onClick={() => setQueue(value)}>{text} <b>{counts[value as keyof typeof counts]}</b></button>)}</div></div>
      <div className="table-tools"><label><Search size={17} /><input placeholder="Search guest, reservation, request..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className={showInventory ? "grp-layout" : undefined}>
        <div className="grp-main">
        <div className="grp-batches">
          {visible.map((batch) => { const first = batch.items[0]; const roomNumber = first.reservation?.room_number; return (
            <article key={batch.key} className="grp-batch">
              <header>
                <div>
                  <strong>{first.reservation?.guest_name ?? first.guest_id ?? "Guest"} · Request #{requestCode(batch)}</strong>
                  <small>{first.reservation?.confirmation_number ?? first.reservation_id}{first.reservation?.room_type ? ` · ${first.reservation.room_type}` : ""} · submitted {new Date(first.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</small>
                </div>
                <div className="grp-batch-meta">
                  <div className="grp-batch-badges">
                    <span className={`grp-room ${roomNumber ? "assigned" : "unassigned"}`} title={roomNumber ? `Deliver to room ${roomNumber}` : "A physical room has not been assigned"}>
                      <BedDouble size={13} aria-hidden="true" />
                      {roomNumber ? `Room ${roomNumber}` : "Room not assigned"}
                    </span>
                    <span className={`badge grp-approval ${batch.approval}`}>{APPROVAL_LABELS[batch.approval]}</span>
                  </div>
                  {canReview && batch.approval === "pending" && <div className="reservation-actions">
                    <button className="table-action view-action" onClick={() => act(batch, "approve")}>Approve</button>
                    <button className="table-action" onClick={() => act(batch, "reject")}>Decline</button>
                  </div>}
                </div>
              </header>
              <ul>{batch.items.map((item) => (
                <li key={item.id}>
                  <div><b>{item.request_type ? requestLabel(item.request_type) : item.request}</b><small>{label(item.department)} · {label(item.status)}</small>{item.approval_status === "rejected" && item.approval_note && <small className="grp-note">{item.approval_note}</small>}</div>
                  <div className="grp-item-actions">
                    <span className={`badge ${item.status}`}>{label(item.status)}</span>
                    {canEscalate && item.status !== "completed" && item.escalation_status !== "escalated" && <button className="table-action" onClick={() => void escalate(item)}>Escalate</button>}
                    {canEscalate && item.escalation_status === "escalated" && <span className="badge escalated">Escalated</span>}
                  </div>
                </li>
              ))}</ul>
            </article>
          ); })}
        </div>
          {loading ? <div className="empty"><ClipboardCheck /><h3>Loading guest requests…</h3></div> : visible.length === 0 && <div className="empty"><Search /><h3>No submissions</h3><p>No submissions match this view.</p></div>}
        </div>
        {showInventory && <aside className="grp-inventory" aria-label="Inventory summary">
          <header>
            <span className="grp-inventory-icon"><Boxes size={15} aria-hidden="true" /></span>
            <div><b>Inventory</b><small>Supply snapshot</small></div>
            {lowStock.length > 0 && <span className="badge low">{lowStock.length} to reorder</span>}
          </header>
          {inventory.length ? <ul>{inventory.slice(0, 6).map((item) => (
            <li key={item.id} className={item.status === "healthy" ? undefined : "grp-low"}>
              <div className="grp-inv-top"><span className="grp-inv-name">{item.name}</span><span className={`badge ${item.status}`}>{label(item.status)}</span></div>
              <p className="grp-inv-qty"><b>{item.quantity}</b><span className="grp-inv-target">/ {item.reorder_point}</span><span className="grp-inv-unit">{item.unit}</span></p>
            </li>
          ))}</ul> : <small className="grp-inventory-empty">Loading stock levels…</small>}
          <small className="grp-inventory-note">View only — stock updates stay within Housekeeping, Maintenance, and the Inventory module.</small>
        </aside>}
      </div>
    </>)}
    {toast && <div className="toast"><ClipboardCheck size={18} />{toast}</div>}
    {dialogs.view}
  </div>;
}
