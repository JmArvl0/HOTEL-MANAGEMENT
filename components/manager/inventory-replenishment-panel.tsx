"use client";
import { useMemo, useState } from "react";

export type PoLine = { itemId: string; name: string; quantity: number; unit: string; unitCost?: number };
export type PoOrder = {
  id: string; status: string; total: number; items: PoLine[];
  created_at?: string; version?: number; vendor_id?: string | null;
};
export type PoVendor = { id: string; name: string };

const FILTERS = ["all", "draft", "pending_approval", "approved", "received", "cancelled"] as const;

function peso(n: number) {
  return `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Purchase-order workspace: tabbed status filter + per-order lifecycle actions.
// Suggestion cards stay in the dashboard's existing strip above; this owns the
// order queue. Server RPCs remain the authority — buttons only call them.
export default function PurchaseOrderList({ orders, vendors, onSubmit, onReceive, onCancel }: {
  orders: PoOrder[]; vendors: PoVendor[];
  onSubmit: (o: PoOrder) => void; onReceive: (o: PoOrder) => void; onCancel: (o: PoOrder) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);
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
              <strong>{(o.items ?? []).map((l) => `${l.name} × ${l.quantity}`).join(", ")}</strong>
            </p>
            <small>
              {o.vendor_id ? `${vendorName.get(o.vendor_id) ?? "Vendor"} · ` : ""}
              Total {peso(o.total)}
              {o.created_at ? ` · ${String(o.created_at).slice(0, 10)}` : ""}
            </small>
          </div>
          <div className="hk-queue-actions">
            {o.status === "draft" && <button className="table-action action-primary" onClick={() => onSubmit(o)}>Submit</button>}
            {o.status === "approved" && <button className="table-action action-primary" onClick={() => onReceive(o)}>Confirm stock restock</button>}
            {(o.status === "draft" || o.status === "pending_approval" || o.status === "approved") && (
              <button className="table-action" onClick={() => onCancel(o)}>Cancel</button>
            )}
            {o.status === "pending_approval" && <span>Awaiting Owner/Admin approval</span>}
            {o.status === "received" && <span>Received — immutable</span>}
            {o.status === "cancelled" && <span>Cancelled</span>}
          </div>
        </article>
      ))}
    </section>
  );
}
