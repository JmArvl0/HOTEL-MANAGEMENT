"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { roomPrimary } from "@/lib/room-images";

type RoomType = {
  id: string;
  name: string;
  description: string;
  max_guests: number;
  beds: string;
  size_sqm: number | null;
  amenities: unknown;
  base_rate: number;
  active: boolean;
  version: number;
  photo_urls: string[];
};
type Draft = { description: string; maxGuests: string; beds: string; sizeSqm: string; amenities: string; baseRate: string; active: boolean; photoUrls: string[]; reason: string };
type PhotoInput = { open: boolean; editing: RoomType | null };

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");
const amenityList = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)).join(", ") : "");

function draftFrom(t: RoomType): Draft {
  return {
    description: t.description,
    maxGuests: String(t.max_guests),
    beds: t.beds,
    sizeSqm: t.size_sqm ? String(t.size_sqm) : "",
    amenities: amenityList(t.amenities),
    baseRate: String(t.base_rate),
    active: t.active,
    photoUrls: Array.isArray(t.photo_urls) ? t.photo_urls : [],
    reason: "",
  };
}

export default function RoomCatalogPanel() {
  const dialogs = useActionDialogs();
  const [items, setItems] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RoomType | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const load = async () => {
    const response = await fetch("/api/catalog/room-types", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the room catalog."); setLoading(false); return; }
    setItems(body.data ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [items, search]);
  const openEditor = (item: RoomType) => { setEditing(item); setDraft(draftFrom(item)); };
  const closeEditor = () => { setEditing(null); setDraft(null); };

  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addUrl = async () => {
    if (!draft) return;
    const raw = draft.photoUrls;
    if (raw.length >= 24) { notify("A room type can hold up to 24 photos."); return; }
    const url = await dialogs.askPrompt({
      title: "Add photo URL",
      message: "Paste an image URL to add it to the photo gallery.",
      label: "Image URL",
      placeholder: "https://example.com/room-photo.jpg",
      inputType: "text",
      required: true,
      validation: (value) => { const s = String(value ?? "").trim(); if (!s) return "Paste an image URL."; try { new URL(s); return null; } catch { return "That is not a valid image URL."; } },
    });
    const trimmed = (url ?? "").trim();
    if (!trimmed) return;
    set("photoUrls", [...raw, trimmed]);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !draft) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { notify("Only JPEG, PNG, or WebP images are supported."); return; }
    if (file.size > 5 * 1024 * 1024) { notify("Image must be 5 MB or smaller."); return; }
    if (draft.photoUrls.length >= 24) { notify("A room type can hold up to 24 photos."); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/catalog/photos", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? "Upload failed."); return; }
      set("photoUrls", [...draft.photoUrls, body.url]);
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (!editing || !draft) return;
    if (draft.reason.trim().length < 3) { notify("Enter a reason for this change."); return; }
    const response = await fetch(`/api/catalog/room-types/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: draft.description.trim(),
        maxGuests: Number(draft.maxGuests),
        beds: draft.beds.trim(),
        sizeSqm: draft.sizeSqm ? Number(draft.sizeSqm) : null,
        amenities: draft.amenities.split(",").map((x) => x.trim()).filter(Boolean),
        baseRate: Number(draft.baseRate),
        active: draft.active,
        photoUrls: draft.photoUrls,
        reason: draft.reason.trim(),
        version: editing.version,
      }),
    });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to save the room type."); return; }
    notify(`${editing.name} updated.`);
    closeEditor();
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Customer-facing catalog</p>
          <h1>Room types &amp; photos</h1>
          <p>Edit the rooms shown to guests on Find a Room — details, rate, availability, and photo gallery (URL or upload).</p>
        </div>
        <button className="btn btn-accent" onClick={() => { if (error) void load(); else notify("Choose a room type below to edit its details and photos."); }} title="Refresh catalog">
          <RefreshCw size={16}/> Refresh
        </button>
      </div>
      <div className="table-tools">
        <label><Search size={17}/><input aria-label="Search room types" placeholder="Search room types..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {loading ? (
        <div className="empty"><Loader2 className="spin"/><h3>Loading room catalog…</h3></div>
      ) : error ? (
        <div className="empty"><Building2/><h3>Catalog unavailable</h3><p>{error}</p></div>
      ) : (
        <div className="data-panel">
          <div className="table-scroll">
            <table aria-label="Room types catalog">
              <thead><tr>{["", "Room type", "Guests", "Beds", "Rate", "Status", "Version", ""].map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {visible.map((item) => {
                  const primary = roomPrimary(item.photo_urls, item.name);
                  return (
                    <tr key={item.id}>
                      <td>{primary ? <img src={primary} alt="" className="catalog-thumb" loading="lazy"/> : <span className="catalog-thumb empty"><ImagePlus size={18}/></span>}</td>
                      <td><strong>{item.name}</strong><br/><small>{label(item.description.length > 80 ? item.description.slice(0, 80) + "…" : item.description)}</small></td>
                      <td>{item.max_guests}</td>
                      <td>{label(item.beds)}</td>
                      <td>{peso(item.base_rate)}</td>
                      <td><span className={`badge ${item.active ? "active" : "inactive"}`}>{item.active ? "Active" : "Inactive"}</span></td>
                      <td>{item.version}</td>
                      <td><button className="table-action view-action" onClick={() => openEditor(item)}><Pencil size={14}/> Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="empty"><Search/><h3>No room types match</h3><p>Try a different search.</p></div>}
        </div>
      )}
      {toast && <div className="toast"><Building2 size={18}/>{toast}</div>}
      {dialogs.view}

      {editing && draft && (
        <Modal isOpen onClose={closeEditor} title={`Edit ${editing.name}`} description="Changes are audited and apply to future bookings only. Room type name is fixed." size="lg">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label className="form-label">Photo gallery <span className="muted">({draft.photoUrls.length}/24)</span></label>
                <div className="photo-manager">
                  {draft.photoUrls.map((url, index) => (
                    <div className="photo-tile" key={url}>
                      <img src={url} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}/>
                      <div className="photo-tile-actions">
                        {index > 0 && <button type="button" className="table-action" onClick={() => { const next = [...draft.photoUrls]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; set("photoUrls", next); }}>←</button>}
                        {index < draft.photoUrls.length - 1 && <button type="button" className="table-action" onClick={() => { const next = [...draft.photoUrls]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; set("photoUrls", next); }}>→</button>}
                        <button type="button" className="table-action danger-action" onClick={() => set("photoUrls", draft.photoUrls.filter((_, i) => i !== index))}><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                  {draft.photoUrls.length === 0 && <p className="muted">No photos yet — guests will see the stock gallery until you add photos here.</p>}
                </div>
                <div className="photo-tools">
                  <button type="button" className="btn btn-soft" onClick={addUrl}><Plus size={15}/> Add URL</button>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
                  <button type="button" className="btn btn-soft" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="spin" size={15}/> : <Upload size={15}/>} {uploading ? "Uploading…" : "Upload photo"}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-desc" className="form-label">Description <span className="required">*</span></label>
                <textarea id="rt-desc" className="form-input" rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this room worth booking?"/>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="rt-guests" className="form-label">Max guests <span className="required">*</span></label>
                <input id="rt-guests" className="form-input" type="number" min={1} max={50} value={draft.maxGuests} onChange={(e) => set("maxGuests", e.target.value)}/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="rt-beds" className="form-label">Beds <span className="required">*</span></label>
                <input id="rt-beds" className="form-input" type="text" value={draft.beds} onChange={(e) => set("beds", e.target.value)} placeholder="1 King"/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="rt-size" className="form-label">Size (m²)</label>
                <input id="rt-size" className="form-input" type="number" min={1} value={draft.sizeSqm} onChange={(e) => set("sizeSqm", e.target.value)} placeholder="—"/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="rt-rate" className="form-label">Base rate / night <span className="required">*</span></label>
                <input id="rt-rate" className="form-input" type="number" min={0} value={draft.baseRate} onChange={(e) => set("baseRate", e.target.value)}/>
              </div>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-amenities" className="form-label">Amenities</label>
                <input id="rt-amenities" className="form-input" type="text" value={draft.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="Wi-Fi, Breakfast, Pool — comma separated"/>
              </div>
            </div>
            <div className="form-field">
              <label className="checkbox-option">
                <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)}/>
                <span>Active for future booking</span>
              </label>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-reason" className="form-label">Reason for change <span className="required">*</span></label>
                <input id="rt-reason" className="form-input" type="text" value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Audited with every save"/>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={closeEditor}>Cancel</button>
              <button type="button" className="btn btn-accent" onClick={save}>Save changes</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
