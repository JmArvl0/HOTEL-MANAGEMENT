"use client";
import { FormFieldError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { ToastStack, useToasts } from "@/components/ui/toast-stack";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CarTaxiFront, Loader2, Pencil, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui";
import { HavenDataToolbar, HavenSearchInput } from "@/components/ui/haven-data-controls";
import { TablePagination, sortTableRows, useTablePagination } from "@/components/ui/table-pagination";

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
  const feedback = useToasts();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FormFieldErrors>({});
  const [saveError, setSaveError] = useState("");
  const fieldError = (field: string, message: string, id: string) => { setFields({ [field]: message }); requestAnimationFrame(() => document.getElementById(id)?.focus()); };

  const notify = (message: string, tone: "info" | "success" | "warning" | "error" = "success") => feedback.push({ title: message, tone, ...(tone === "error" || tone === "warning" ? { duration: 0 } : {}) });
  const load = async () => {
    const response = await fetchPublic("/api/catalog/transport-vehicle-types", { cache: "no-store" });
    const body = await readResponse(response);
    if (!response.ok) { setError(userMessage(body.error, "Unable to load the transfer vehicle rates.")); setLoading(false); return; }
    setItems(body.data ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => sortTableRows(items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), (item) => item.name), [items, search]);
  const page = useTablePagination(visible);
  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const openCreate = () => { setFields({}); setCreating(true); setEditing(null); setDraft(emptyDraft()); };
  const openEdit = (item: Vehicle) => { setFields({}); setEditing(item); setCreating(false); setDraft(draftFrom(item)); };
  const close = () => { setEditing(null); setCreating(false); setDraft(null); };

  const save = async () => {
    if (!draft) return;
    setSaveError("");
    const seats = Number(draft.seats);
    const fares = [draft.baseFare, draft.perKm, draft.perMinute, draft.bookingFee].map(Number);
    if (!Number.isInteger(seats) || seats < 1 || seats > 20) { fieldError("seats", "Please enter a whole number of seats from 1 to 20.", "tv-seats"); return; }
    if (!fares.every((value) => Number.isFinite(value) && value >= 0)) { fieldError(["baseFare", "perKm", "perMinute", "bookingFee"][fares.findIndex(value => !Number.isFinite(value) || value < 0)], "Please enter a fare of zero or greater.", ["tv-base", "tv-km", "tv-min", "tv-fee"][fares.findIndex(value => !Number.isFinite(value) || value < 0)]); return; }
    if (draft.name.trim().length < 1) { fieldError("name", "Please enter a vehicle name.", "tv-name"); return; }
    if (editing && draft.reason.trim().length < 3) { fieldError("reason", "Please enter a reason for this change.", "tv-reason"); return; }
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
    const response = await fetchPublic(editing ? `/api/catalog/transport-vehicle-types/${editing.id}` : "/api/catalog/transport-vehicle-types", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await readResponse(response);
    setSaving(false);
    if (!response.ok) { setFields(result.fieldErrors ?? result.fields ?? {}); setSaveError(userMessage(result.error, "Unable to save this transfer vehicle.")); return; }
    notify(editing ? `${draft.name} updated.` : `${draft.name} added to the fare table.`);
    close();
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <PageHeader variant="band" eyebrow="Fleet & guest transfer" title="Transfer vehicles & fares" subtitle="Vehicle types offered at booking checkout. Each ride to the hotel is priced as base fare + per-km + per-minute + booking fee from the live route; inactive vehicles are hidden from guests." actions={<button className="btn btn-accent" onClick={openCreate}><Plus size={16}/> Add vehicle</button>} />
      <HavenDataToolbar
        search={<HavenSearchInput value={search} onValueChange={setSearch} label="Search transfer vehicles" placeholder="Search transfer vehicles..." />}
        resultCount={visible.length}
        resultNoun="vehicle types"
        hasActiveFilters={search.trim() !== ""}
        onClearFilters={() => setSearch("")}
        label="Search transfer vehicles"
      />
      {loading ? (
        <div className="empty"><Loader2 className="spin"/><h3>Loading transfer vehicles…</h3></div>
      ) : error ? (
        <div className="empty"><CarTaxiFront/><h3>Catalog unavailable</h3><p>{error}</p></div>
      ) : (
        <div className="data-panel">
          <div className="table-scroll">
            <table>
              <thead><tr>{["Vehicle", "Seats", "Base fare", "Per km", "Per minute", "Booking fee", "Status", "Version", ""].map((x, i) => <th key={i}>{x}</th>)}</tr></thead>
              <tbody>
                {page.rows.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong>{item.description ? <small className="row-note">{item.description.length > 90 ? item.description.slice(0, 90) + "…" : item.description}</small> : null}</td>
                    <td>{item.seats}</td>
                    <td>{money(item.base_fare)}</td>
                    <td>{money(item.per_km)}</td>
                    <td>{money(item.per_minute)}</td>
                    <td>{money(item.booking_fee)}</td>
                    <td><StatusBadge status={item.active ? "active" : "inactive"} label={item.active ? "Active" : "Inactive"} /></td>
                    <td>{item.version}</td>
                    <td><button className="table-action view-action" onClick={() => openEdit(item)}><Pencil size={14}/> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...page} onPageChange={page.setPage} noun="vehicle types" allTotal={items.length} />
          {visible.length === 0 && <div className="empty"><Search/><h3>No transfer vehicles match</h3><p>Try a different search, or add a vehicle above.</p></div>}
        </div>
      )}
      <ToastStack controller={feedback} />

      {(editing || creating) && draft && (
        <Modal isOpen onClose={close} title={editing ? `Edit ${editing.name}` : "Add a transfer vehicle"} description={editing ? "Changes are audited and apply to new bookings at checkout." : "Offer a vehicle type for guest pickup transfers at booking checkout."} size="md" headerVariant="branded">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="tv-name" className="form-label">Vehicle name <span className="required">*</span></label>
                <input id="tv-name" className="form-input" type="text" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 4-seater" {...formFieldProps(fields, "name", "transfer")} /><FormFieldError errors={fields} field="name" prefix="transfer" />
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
                <input id="tv-seats" className="form-input" type="number" min={1} max={20} step={1} value={draft.seats} onChange={(e) => set("seats", e.target.value)} {...formFieldProps(fields, "seats", "transfer")} /><FormFieldError errors={fields} field="seats" prefix="transfer" />
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
                <input id="tv-base" className="form-input" type="number" min={0} step={0.01} value={draft.baseFare} onChange={(e) => set("baseFare", e.target.value)} {...formFieldProps(fields, "baseFare", "transfer")} /><FormFieldError errors={fields} field="baseFare" prefix="transfer" />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="tv-km" className="form-label">Per km <span className="required">*</span></label>
                <input id="tv-km" className="form-input" type="number" min={0} step={0.01} value={draft.perKm} onChange={(e) => set("perKm", e.target.value)} {...formFieldProps(fields, "perKm", "transfer")} /><FormFieldError errors={fields} field="perKm" prefix="transfer" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="tv-min" className="form-label">Per minute <span className="required">*</span></label>
                <input id="tv-min" className="form-input" type="number" min={0} step={0.01} value={draft.perMinute} onChange={(e) => set("perMinute", e.target.value)} {...formFieldProps(fields, "perMinute", "transfer")} /><FormFieldError errors={fields} field="perMinute" prefix="transfer" />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="tv-fee" className="form-label">Booking fee <span className="required">*</span></label>
                <input id="tv-fee" {...formFieldProps(fields, "bookingFee", "transfer")} className="form-input" type="number" min={0} step={0.01} value={draft.bookingFee} onChange={(e) => set("bookingFee", e.target.value)}/><FormFieldError errors={fields} field="bookingFee" prefix="transfer" />
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
                  <input id="tv-reason" className="form-input" type="text" value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Audited with every save" {...formFieldProps(fields, "reason", "transfer")} /><FormFieldError errors={fields} field="reason" prefix="transfer" />
                </div>
              </div>
            )}
            {saveError && <p className="booking-error" role="alert">{saveError}</p>}
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
