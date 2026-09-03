"use client";
import { useEffect, useMemo, useState } from "react";
import { CarTaxiFront, Loader2, Pencil, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type TransportService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  active: boolean;
  sort: number;
  version: number;
};
type Draft = { name: string; description: string; price: string; unit: string; sort: string; active: boolean; reason: string };

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const emptyDraft = (): Draft => ({ name: "", description: "", price: "", unit: "per trip", sort: "0", active: true, reason: "" });
const draftFrom = (s: TransportService): Draft => ({ name: s.name, description: s.description ?? "", price: String(s.price), unit: s.unit || "per trip", sort: String(s.sort ?? 0), active: s.active, reason: "" });

export default function TransportServicesPanel() {
  const [items, setItems] = useState<TransportService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TransportService | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const load = async () => {
    const response = await fetch("/api/catalog/transport-services", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the transport price list."); setLoading(false); return; }
    setItems(body.data ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [items, search]);
  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const openCreate = () => { setCreating(true); setEditing(null); setDraft(emptyDraft()); };
  const openEdit = (item: TransportService) => { setEditing(item); setCreating(false); setDraft(draftFrom(item)); };
  const close = () => { setEditing(null); setCreating(false); setDraft(null); };

  const save = async () => {
    if (!draft) return;
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) { notify("Enter a price greater than zero."); return; }
    if (draft.name.trim().length < 1) { notify("Enter a service name."); return; }
    if (editing && draft.reason.trim().length < 3) { notify("Enter a reason for this change."); return; }
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      price,
      unit: draft.unit.trim() || "per trip",
      sort: Number(draft.sort) || 0,
      active: draft.active,
      ...(editing ? { reason: draft.reason.trim(), version: editing.version } : {}),
    };
    const response = await fetch(editing ? `/api/catalog/transport-services/${editing.id}` : "/api/catalog/transport-services", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { notify(result.error ?? "Unable to save this transport service."); return; }
    notify(editing ? `${draft.name} updated.` : `${draft.name} added to the price list.`);
    close();
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Fleet &amp; guest transport</p>
          <h1>Transport services</h1>
          <p>Maintain the hotel transport price list offered at booking checkout. Each selected line is charged to the stay folio as its own item, paid separately from the room.</p>
        </div>
        <button className="btn btn-accent" onClick={openCreate}><Plus size={16}/> Add service</button>
      </div>
      <div className="table-tools">
        <label><Search size={17}/><input placeholder="Search transport services..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {loading ? (
        <div className="empty"><Loader2 className="spin"/><h3>Loading transport services…</h3></div>
      ) : error ? (
        <div className="empty"><CarTaxiFront/><h3>Catalog unavailable</h3><p>{error}</p></div>
      ) : (
        <div className="data-panel">
          <div className="table-scroll">
            <table>
              <thead><tr>{["Service", "Description", "Price", "Unit", "Status", "Version", ""].map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description ? <small>{item.description.length > 90 ? item.description.slice(0, 90) + "…" : item.description}</small> : <span className="muted">—</span>}</td>
                    <td>{peso(item.price)}</td>
                    <td>{item.unit}</td>
                    <td><span className={`badge ${item.active ? "active" : "inactive"}`}>{item.active ? "Active" : "Inactive"}</span></td>
                    <td>{item.version}</td>
                    <td><button className="table-action view-action" onClick={() => openEdit(item)}><Pencil size={14}/> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="empty"><Search/><h3>No transport services match</h3><p>Try a different search, or add a service above.</p></div>}
        </div>
      )}
      {toast && <div className="toast"><CarTaxiFront size={18}/>{toast}</div>}

      {(editing || creating) && draft && (
        <Modal isOpen onClose={close} title={editing ? `Edit ${editing.name}` : "Add a transport service"} description={editing ? "Changes are audited and apply to new bookings at checkout." : "Offer a hotel transport service at booking checkout."} size="md">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="ts-name" className="form-label">Service name <span className="required">*</span></label>
                <input id="ts-name" className="form-input" type="text" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Makati → NAIA airport transfer"/>
              </div>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="ts-desc" className="form-label">Description</label>
                <textarea id="ts-desc" className="form-input" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Route, capacity, or what the guest should expect"/>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="ts-price" className="form-label">Price (PHP) <span className="required">*</span></label>
                <input id="ts-price" className="form-input" type="number" min={1} value={draft.price} onChange={(e) => set("price", e.target.value)}/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="ts-unit" className="form-label">Unit / basis</label>
                <input id="ts-unit" className="form-input" type="text" value={draft.unit} onChange={(e) => set("unit", e.target.value)} placeholder="per trip"/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="ts-sort" className="form-label">Display order</label>
                <input id="ts-sort" className="form-input" type="number" min={0} value={draft.sort} onChange={(e) => set("sort", e.target.value)}/>
              </div>
            </div>
            <div className="form-field">
              <label className="checkbox-option">
                <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)}/>
                <span>Offered at booking checkout</span>
              </label>
            </div>
            {editing && (
              <div className="form-field">
                <div className="form-field-wrapper">
                  <label htmlFor="ts-reason" className="form-label">Reason for change <span className="required">*</span></label>
                  <input id="ts-reason" className="form-input" type="text" value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Audited with every save"/>
                </div>
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? <Loader2 className="spin" size={16}/> : editing ? <Pencil size={16}/> : <Plus size={16}/>} {saving ? "Saving…" : editing ? "Save changes" : "Add service"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
