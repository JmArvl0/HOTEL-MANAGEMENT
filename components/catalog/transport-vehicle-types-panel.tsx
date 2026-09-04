"use client";
import { useEffect, useMemo, useState } from "react";
import { CarTaxiFront, Loader2, Pencil, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type Vehicle = {
  id: string;
  name: string;
  description: string | null;
  seats: number;
  base_fare: number;
  per_km: number;
  per_minute: number;
  booking_fee: number;
  active: boolean;
  sort: number;
  version: number;
};
type Draft = { name: string; description: string; seats: string; baseFare: string; perKm: string; perMinute: string; bookingFee: string; sort: string; active: boolean; reason: string };

const money = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value || 0));
const emptyDraft = (): Draft => ({ name: "", description: "", seats: "4", baseFare: "", perKm: "", perMinute: "", bookingFee: "", sort: "0", active: true, reason: "" });
const draftFrom = (v: Vehicle): Draft => ({ name: v.name, description: v.description ?? "", seats: String(v.seats), baseFare: String(v.base_fare), perKm: String(v.per_km), perMinute: String(v.per_minute), bookingFee: String(v.booking_fee), sort: String(v.sort ?? 0), active: v.active, reason: "" });

export default function TransportVehicleTypesPanel() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const load = async () => {
    const response = await fetch("/api/catalog/transport-vehicle-types", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the transfer vehicle rates."); setLoading(false); return; }
    setItems(body.data ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [items, search]);
  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const openCreate = () => { setCreating(true); setEditing(null); setDraft(emptyDraft()); };
  const openEdit = (item: Vehicle) => { setEditing(item); setCreating(false); setDraft(draftFrom(item)); };
  const close = () => { setEditing(null); setCreating(false); setDraft(null); };

  const save = async () => {
    if (!draft) return;
    const seats = Number(draft.seats);
    const fares = [draft.baseFare, draft.perKm, draft.perMinute, draft.bookingFee].map(Number);
    if (!Number.isInteger(seats) || seats < 1 || seats > 20) { notify("Seats must be a whole number from 1 to 20."); return; }
    if (!fares.every((value) => Number.isFinite(value) && value >= 0)) { notify("Fares must be zero or greater."); return; }
    if (draft.name.trim().length < 1) { notify("Enter a vehicle name."); return; }
    if (editing && draft.reason.trim().length < 3) { notify("Enter a reason for this change."); return; }
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      seats,
      baseFare: fares[0],
      perKm: fares[1],
      perMinute: fares[2],
      bookingFee: fares[3],
      sort: Number(draft.sort) || 0,
      active: draft.active,
      ...(editing ? { reason: draft.reason.trim(), version: editing.version } : {}),
    };
    const response = await fetch(editing ? `/api/catalog/transport-vehicle-types/${editing.id}` : "/api/catalog/transport-vehicle-types", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { notify(result.error ?? "Unable to save this transfer vehicle."); return; }
    notify(editing ? `${draft.name} updated.` : `${draft.name} added to the fare table.`);
    close();
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Fleet &amp; guest transfer</p>
          <h1>Transfer vehicles &amp; fares</h1>
          <p>Vehicle types offered at booking checkout. Each ride to the hotel is priced as base fare + per-km + per-minute + booking fee from the live route; inactive vehicles are hidden from guests.</p>
        </div>
        <button className="btn btn-accent" onClick={openCreate}><Plus size={16}/> Add vehicle</button>
      </div>
      <div className="table-tools">
        <label><Search size={17}/><input placeholder="Search transfer vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {loading ? (
        <div className="empty"><Loader2 className="spin"/><h3>Loading transfer vehicles…</h3></div>
      ) : error ? (
        <div className="empty"><CarTaxiFront/><h3>Catalog unavailable</h3><p>{error}</p></div>
      ) : (
        <div className="data-panel">
          <div className="table-scroll">
            <table>
              <thead><tr>{["Vehicle", "Seats", "Base fare", "Per km", "Per minute", "Booking fee", "Status", "Version", ""].map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong>{item.description ? <small className="row-note">{item.description.length > 90 ? item.description.slice(0, 90) + "…" : item.description}</small> : null}</td>
                    <td>{item.seats}</td>
                    <td>{money(item.base_fare)}</td>
                    <td>{money(item.per_km)}</td>
                    <td>{money(item.per_minute)}</td>
                    <td>{money(item.booking_fee)}</td>
                    <td><span className={`badge ${item.active ? "active" : "inactive"}`}>{item.active ? "Active" : "Inactive"}</span></td>
                    <td>{item.version}</td>
                    <td><button className="table-action view-action" onClick={() => openEdit(item)}><Pencil size={14}/> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="empty"><Search/><h3>No transfer vehicles match</h3><p>Try a different search, or add a vehicle above.</p></div>}
        </div>
      )}
      {toast && <div className="toast"><CarTaxiFront size={18}/>{toast}</div>}

      {(editing || creating) && draft && (
        <Modal isOpen onClose={close} title={editing ? `Edit ${editing.name}` : "Add a transfer vehicle"} description={editing ? "Changes are audited and apply to new bookings at checkout." : "Offer a vehicle type for guest pickup transfers at booking checkout."} size="md">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="tv-name" className="form-label">Vehicle name <span className="required">*</span></label>
                <input id="tv-name" className="form-input" type="text" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 4-seater"/>
              </div>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="tv-desc" className="form-label">Description</label>
                <textarea id="tv-desc" className="form-input" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Capacity, vehicle type, or what the guest should expect"/>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="tv-seats" className="form-label">Seats</label>
                <input id="tv-seats" className="form-input" type="number" min={1} max={20} step={1} value={draft.seats} onChange={(e) => set("seats", e.target.value)}/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="tv-sort" className="form-label">Display order</label>
                <input id="tv-sort" className="form-input" type="number" min={0} value={draft.sort} onChange={(e) => set("sort", e.target.value)}/>
              </div>
            </div>
            <p className="form-section-label">Fare components (PHP)</p>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="tv-base" className="form-label">Base fare <span className="required">*</span></label>
                <input id="tv-base" className="form-input" type="number" min={0} step={0.01} value={draft.baseFare} onChange={(e) => set("baseFare", e.target.value)}/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="tv-km" className="form-label">Per km <span className="required">*</span></label>
                <input id="tv-km" className="form-input" type="number" min={0} step={0.01} value={draft.perKm} onChange={(e) => set("perKm", e.target.value)}/>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="tv-min" className="form-label">Per minute <span className="required">*</span></label>
                <input id="tv-min" className="form-input" type="number" min={0} step={0.01} value={draft.perMinute} onChange={(e) => set("perMinute", e.target.value)}/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="tv-fee" className="form-label">Booking fee <span className="required">*</span></label>
                <input id="tv-fee" className="form-input" type="number" min={0} step={0.01} value={draft.bookingFee} onChange={(e) => set("bookingFee", e.target.value)}/>
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
                  <label htmlFor="tv-reason" className="form-label">Reason for change <span className="required">*</span></label>
                  <input id="tv-reason" className="form-input" type="text" value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Audited with every save"/>
                </div>
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? <Loader2 className="spin" size={16}/> : editing ? <Pencil size={16}/> : <Plus size={16}/>} {saving ? "Saving…" : editing ? "Save changes" : "Add vehicle"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
