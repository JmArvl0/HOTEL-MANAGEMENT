"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ListChecks, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TablePagination, sortTableRows, useTablePagination } from "@/components/ui/table-pagination";

// Manager-maintained guest request catalog. What is active here is exactly
// what the portal Requests module offers guests — nothing else can be
// submitted (the /api/account/requests route validates against this table).
type RequestType = { id: string; value: string; label: string; department: string; active: boolean; sort_order: number };
type Draft = { label: string; department: string; active: boolean };

const DEPARTMENTS = [["front_desk", "Front Desk"], ["housekeeping", "Housekeeping"], ["maintenance", "Maintenance"]] as const;
const departmentLabel = (value: string) => DEPARTMENTS.find(([key]) => key === value)?.[1] ?? value;
const emptyDraft = (): Draft => ({ label: "", department: "front_desk", active: true });

export default function RequestTypesPanel() {
  const [items, setItems] = useState<RequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RequestType | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const load = async () => {
    const response = await fetch("/api/catalog/request-types", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the request types."); setLoading(false); return; }
    setItems(body.data ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => sortTableRows(items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), (item) => item.label), [items, search]);
  const page = useTablePagination(visible);
  const close = () => { setEditing(null); setCreating(false); setDraft(null); };

  const save = async () => {
    if (!draft || draft.label.trim().length < 2) { notify("Enter a request type label."); return; }
    setSaving(true);
    const response = await fetch(editing ? `/api/catalog/request-types/${editing.id}` : "/api/catalog/request-types", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { label: draft.label.trim(), department: draft.department, active: draft.active } : { label: draft.label.trim(), department: draft.department }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { notify(body.error ?? "Unable to save this request type."); return; }
    notify(editing ? `${draft.label} updated.` : `${draft.label} added to the request list.`);
    close();
    await load();
  };

  const toggleActive = async (item: RequestType) => {
    const response = await fetch(`/api/catalog/request-types/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to change this request type."); return; }
    notify(`${item.label} is now ${item.active ? "hidden from guests" : "offered to guests"}.`);
    await load();
  };

  const remove = async (item: RequestType) => {
    if (!window.confirm(`Delete "${item.label}"? Guests can no longer request it; past submissions keep their history.`)) return;
    const response = await fetch(`/api/catalog/request-types/${item.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to delete this request type."); return; }
    notify(`${item.label} deleted.`);
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Guest services</p>
          <h1>Request types</h1>
          <p>The request types guests can choose in the Requests module. Active types appear in the guest form exactly as listed here — guests cannot submit anything outside this list, and each type routes to its department for handling.</p>
        </div>
        <button className="btn btn-accent" onClick={() => { setCreating(true); setEditing(null); setDraft(emptyDraft()); }}><Plus size={16}/> Add request type</button>
      </div>
      <div className="table-tools">
        <label><Search size={17}/><input placeholder="Search request types..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {loading ? (
        <div className="empty"><Loader2 className="spin"/><h3>Loading request types…</h3></div>
      ) : error ? (
        <div className="empty"><ListChecks/><h3>Request types unavailable</h3><p>{error}</p></div>
      ) : (
        <div className="data-panel">
          <div className="table-scroll">
            <table>
              <thead><tr>{["Request type", "Form key", "Routed to", "Status", "Actions"].map((x, i) => <th key={i}>{x}</th>)}</tr></thead>
              <tbody>
                {page.rows.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.label}</strong></td>
                    <td><code>{item.value}</code></td>
                    <td>{departmentLabel(item.department)}</td>
                    <td><span className={`badge ${item.active ? "active" : "inactive"}`}>{item.active ? "Offered" : "Hidden"}</span></td>
                    <td className="rt-actions">
                      <div className="reservation-actions">
                        <button className="table-action view-action" onClick={() => toggleActive(item)}>{item.active ? <><EyeOff size={14}/> Hide</> : <><Eye size={14}/> Offer</>}</button>
                        <button className="table-action view-action" onClick={() => { setEditing(item); setCreating(false); setDraft({ label: item.label, department: item.department, active: item.active }); }}><Pencil size={14}/> Edit</button>
                        <button className="table-action danger-action" onClick={() => remove(item)}><Trash2 size={14}/> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...page} onPageChange={page.setPage} noun="request types" allTotal={items.length} />
          {visible.length === 0 && <div className="empty"><Search/><h3>No request types match</h3><p>Try a different search, or add a request type above.</p></div>}
        </div>
      )}
      {toast && <div className="toast"><ListChecks size={18}/>{toast}</div>}

      {(editing || creating) && draft && (
        <Modal isOpen onClose={close} title={editing ? `Edit ${editing.label}` : "Add a request type"} description={editing ? "Guests see the updated label immediately; the form key never changes, so history stays intact." : "The new type appears in the guest Requests module once it is offered."} size="sm" headerVariant="branded">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-label" className="form-label">Label <span className="required">*</span></label>
                <input id="rt-label" className="form-input" type="text" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Extra blankets"/>
              </div>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-department" className="form-label">Routed to <span className="required">*</span></label>
                <select id="rt-department" className="form-input" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>
                  {DEPARTMENTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </div>
            </div>
            {editing && (
              <div className="form-field">
                <label className="checkbox-option">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })}/>
                  <span>Offered to guests</span>
                </label>
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? <Loader2 className="spin" size={16}/> : editing ? <Pencil size={16}/> : <Plus size={16}/>} {saving ? "Saving…" : editing ? "Save changes" : "Add request type"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
