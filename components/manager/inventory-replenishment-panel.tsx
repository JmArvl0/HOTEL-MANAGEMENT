"use client";
import { useMemo, useState } from "react";
import { useActionDialogs } from "@/components/ui/action-dialogs";

export type PoLine = { itemId: string; name: string; quantity: number; unit: string; unitCost?: number };
export type PoOrder = {
  id: string; status: string; total: number; items: PoLine[];
  purchase_order_receipts?: { id: string; items: {itemId:string; quantity:number}[]; created_at:string }[]; received_quantities?: Record<string, number>; created_at?: string; version?: number; vendor_id?: string | null;
};
export type PoVendor = { id: string; name: string };
export type PoReceiptLine = { itemId: string; quantity: number };

const FILTERS = ["all", "draft", "pending_approval", "approved", "partially_received", "received", "cancelled"] as const;

function peso(n: number) {
  return `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Purchase-order workspace: tabbed status filter + per-order lifecycle actions.
// Suggestion cards stay in the dashboard's existing strip above; this owns the
// order queue. Server RPCs remain the authority — buttons only call them.
export default function PurchaseOrderList({ orders, vendors, onSubmit, onReceive, onCancel, receivingOnly = false }: {
  receivingOnly?: boolean; orders: PoOrder[]; vendors: PoVendor[];
  onSubmit: (o: PoOrder) => void; onReceive: (o: PoOrder, items: PoReceiptLine[]) => void; onCancel: (o: PoOrder) => void;
}) {
  const dialogs = useActionDialogs();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  async function receive(order: PoOrder) {
    const outstanding = (order.items ?? []).map((line) => ({
      ...line,
      remaining: line.quantity - (order.received_quantities?.[line.itemId] ?? 0),
    })).filter((line) => line.remaining > 0);
    const data = await dialogs.askForm({
      title: `Receive PO ${order.id.slice(0, 8)}`,
      description: "Confirming adds this delivery to inventory. Outstanding quantities stay open for the next delivery.",
      fields: outstanding.map((line, index) => ({
        key: `q${index}`,
        label: `Received — ${line.name} (${line.remaining} ${line.unit} remaining)`,
        type: "number",
        required: true,
        defaultValue: line.remaining,
        min: 0,
        max: line.remaining,
        step: 1,
        validation: (value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= line.remaining
          ? null : `Enter a whole quantity from 0 to ${line.remaining}.`,
      })),
      submitText: "Confirm stock restock",
    });
    if (!data) return;
    const items = outstanding.map((line, index) => ({
      itemId: line.itemId,
      quantity: Number(data[`q${index}`]),
    })).filter((line) => line.quantity > 0);
    onReceive(order, items);
  }

  return (
    <section className="hk-queue-group" aria-label="Purchase orders">
      <header>
        <h3>Purchase orders <i>{orders.length}</i></h3>
        <p>
          Draft → submit (auto-approved at or below threshold, else Owner/Admin
          exception) → received restocks inventory atomically. Received orders
          are immutable.
        </p>
      </header>
      <div className="haven-filter-badges" role="group" aria-label="Filter purchase orders by status">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`haven-filter-badge${filter === f ? " active" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f.replace(/_/g, " ")}
            {f !== "all" && <span className="haven-filter-count">{orders.filter((o) => o.status === f).length}</span>}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="hk-queue-service">No purchase orders in this view.</p>
      ) : visible.map((o) => (
        <article key={String(o.id)} className="hk-queue-card">
          <div className="hk-queue-main">
            <header>
              <b>PO {String(o.id).slice(0, 8)}</b>
              <span className={`badge badge-${o.status}`}>{String(o.status).replace(/_/g, " ")}</span>
            </header>
            <p className="hk-queue-service">
              <strong>{(o.items ?? []).map((l) => o.status === "received" && !Object.keys(o.received_quantities ?? {}).length ? `${l.name}: ${l.quantity} ordered · historical receipt details unavailable` : `${l.name}: ${Number(o.received_quantities?.[l.itemId] ?? 0)} / ${l.quantity} received`).join(", ")}</strong>
            </p>
            <small>
              {o.vendor_id ? `${vendorName.get(o.vendor_id) ?? "Vendor"} · ` : ""}
              {!receivingOnly && <>Total {peso(o.total)}</>}
              {o.created_at ? ` · ${String(o.created_at).slice(0, 10)}` : ""}
            </small>
          </div>
          <div className="hk-queue-actions">
            {!receivingOnly && o.status === "draft" && <button className="table-action action-primary" onClick={() => onSubmit(o)}>Submit</button>}
            {["approved", "partially_received"].includes(o.status) && <button className="table-action action-primary" onClick={() => void receive(o)}>Receive delivery</button>}
            {!receivingOnly && (o.status === "draft" || o.status === "pending_approval" || o.status === "approved") && (
              <button className="table-action" onClick={() => onCancel(o)}>Cancel</button>
            )}
            {o.status === "pending_approval" && <span>Awaiting Owner/Admin approval</span>}
            {o.status === "received" && <span>Received — immutable</span>}
            {o.status === "cancelled" && <span>Cancelled</span>}
          </div>
        </article>
      ))}
      {dialogs.view}
    </section>
  );
}
