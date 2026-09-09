"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Building2, Check, Eye, ImagePlus, Images, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload, Users, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { RoomTypeDetailsBody } from "@/components/booking/room-details";
import { roomPrimary } from "@/lib/room-images";
import { canProposeRoomTypeRate, canSetRoomTypeRate } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { AvailableRoomType } from "@/lib/booking";

type Proposal = { id: string; proposed_rate: number; reason: string; status: string; created_at: string };
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
  physicalRooms?: number;
  activeRooms?: number;
  room_rate_proposals?: Proposal[] | null;
};
type Draft = { name: string; description: string; maxGuests: string; beds: string; sizeSqm: string; amenities: string; baseRate: string; active: boolean; reason: string };

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");
const amenityList = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)).join(", ") : "");
const amenityArray = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)) : []);
const pendingOf = (t: RoomType) => (Array.isArray(t.room_rate_proposals) ? t.room_rate_proposals.find((p) => p.status === "pending") : undefined);
const reasonCheck = (value: string) => (String(value ?? "").trim().length < 3 ? "Enter a reason (at least 3 characters)." : null);
// Why a type is not public — mirrors the server-side activation gates.
const publishHint = (t: RoomType) => (pendingOf(t) ? "Rate approval pending — publish after Owner/Admin decision." : Number(t.base_rate) === 0 ? "Nightly rate required before it can be published." : "Unpublished — guests cannot see or book this type.");
// The preview shows exactly what a guest sees, so it is fed the same shape the
// booking search produces (rate as a 1-night stand-in for the booking context).
const previewRoom = (t: RoomType): AvailableRoomType => ({
  id: t.id, name: t.name, description: t.description, maxGuests: Number(t.max_guests || 1), beds: String(t.beds ?? ""),
  sizeSqm: t.size_sqm ?? null, amenities: amenityArray(t.amenities),
  nightlyRate: Number(t.base_rate || 0), nights: 1, subtotal: Number(t.base_rate || 0),
  availableUnits: t.physicalRooms ?? 0, photos: Array.isArray(t.photo_urls) ? t.photo_urls : [],
});

function draftFrom(t: RoomType): Draft {
  return {
    name: t.name,
    description: t.description,
    maxGuests: String(t.max_guests),
    beds: t.beds,
    sizeSqm: t.size_sqm ? String(t.size_sqm) : "",
    amenities: amenityList(t.amenities),
    baseRate: String(t.base_rate),
    active: t.active,
    reason: "",
  };
}
const emptyDraft = (): Draft => ({ name: "", description: "", maxGuests: "2", beds: "", sizeSqm: "", amenities: "", baseRate: "", active: false, reason: "" });

export default function RoomCatalogPanel({ role }: { role: Role }) {
  const dialogs = useActionDialogs();
  const canSetRate = canSetRoomTypeRate(role);
  const canPropose = canProposeRoomTypeRate(role);
  const [items, setItems] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RoomType | null>(null); // null + draft open = create mode
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photoType, setPhotoType] = useState<RoomType | null>(null); // photo manager target
  const [photoDraft, setPhotoDraft] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<RoomType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const createFileRef = useRef<HTMLInputElement>(null);
  const [createPhotos, setCreatePhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const [createDragOver, setCreateDragOver] = useState(false);
  const keepCreatePhotos = useRef(false); // true after a successful create — the photos belong to the new type now

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
  const openCreate = () => { setEditing(null); setDraft(emptyDraft()); setCreatePhotos([]); setPhotoError(false); keepCreatePhotos.current = false; };
  // Closing the create modal: if the type was never created, its uploaded photos
  // are orphans in storage — remove them best-effort. After a successful create
  // keepCreatePhotos suppresses the cleanup so attached photos survive.
  const closeEditor = () => {
    if (!editing && draft && !keepCreatePhotos.current) for (const url of createPhotos) void deletePhoto(url);
    if (!editing) { setCreatePhotos([]); setPhotoError(false); keepCreatePhotos.current = false; }
    setEditing(null); setDraft(null);
  };
  const openPhotos = (item: RoomType) => { setPhotoType(item); setPhotoDraft(Array.isArray(item.photo_urls) ? [...item.photo_urls] : []); };
  const closePhotos = () => { setPhotoType(null); setPhotoDraft(null); };

  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setPhotos = (next: string[]) => setPhotoDraft((prev) => (prev == null ? prev : next));

  const addUrl = async () => {
    if (photoDraft == null) return;
    if (photoDraft.length >= 24) { notify("A room type can hold up to 24 photos."); return; }
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
    setPhotos([...photoDraft, trimmed]);
  };

  // Best-effort storage cleanup for a photo abandoned before the type existed.
  const deletePhoto = (url: string) => { void fetch("/api/catalog/photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {}); };

  // Shared upload — same rules the server enforces (JPEG/PNG/WebP, ≤5 MB).
  const uploadPhoto = async (file: File): Promise<string | null> => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { notify("Only JPEG, PNG, or WebP images are supported."); return null; }
    if (file.size > 5 * 1024 * 1024) { notify("Image must be 5 MB or smaller."); return null; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/catalog/photos", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? "Upload failed."); return null; }
      return body.url as string;
    } finally { setUploading(false); }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || photoDraft == null) return;
    if (photoDraft.length >= 24) { notify("A room type can hold up to 24 photos."); return; }
    const url = await uploadPhoto(file);
    if (url) setPhotos([...photoDraft, url]);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Create-modal uploads go straight to storage (upload-first, delete-on-abandon):
  // the previews are the persisted public URLs the RPC stores with the new type.
  const onPickCreateFiles = async (files: FileList | null | undefined) => {
    if (!files?.length) return;
    let next = [...createPhotos];
    for (const file of Array.from(files)) {
      if (next.length >= 24) { notify("A room type can hold up to 24 photos."); break; }
      const url = await uploadPhoto(file);
      if (url) { next = [...next, url]; setCreatePhotos(next); }
    }
    if (createFileRef.current) createFileRef.current.value = "";
    setPhotoError(false);
  };

  const removeCreatePhoto = (index: number) => {
    deletePhoto(createPhotos[index]); // dropped before creation — clean the orphan now
    setCreatePhotos(createPhotos.filter((_, i) => i !== index));
  };

  // Gallery edits reorder in place; the first photo is the cover guests see first.
  const movePhoto = (from: number, to: number) => { if (photoDraft == null || to < 0 || to >= photoDraft.length) return; const next = [...photoDraft]; [next[from], next[to]] = [next[to], next[from]]; setPhotos(next); };
  const moveCreatePhoto = (from: number, to: number) => { if (to < 0 || to >= createPhotos.length) return; const next = [...createPhotos]; [next[from], next[to]] = [next[to], next[from]]; setCreatePhotos(next); };

  // Photos persist through the same audited, version-checked update as any other
  // edit — the type's other fields are sent back unchanged.
  const savePhotos = async () => {
    if (!photoType || photoDraft == null) return;
    const reason = await dialogs.askPrompt({
      title: "Save photo changes",
      message: `Audited with the update to ${photoType.name}'s photo gallery.`,
      label: "Reason",
      inputType: "text",
      required: true,
      validation: reasonCheck,
    });
    if (reason == null || reason.trim() === "") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/catalog/room-types/${photoType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: photoType.description,
          maxGuests: Number(photoType.max_guests),
          beds: String(photoType.beds),
          sizeSqm: photoType.size_sqm ?? null,
          amenities: amenityArray(photoType.amenities),
          baseRate: Number(photoType.base_rate),
          active: photoType.active,
          photoUrls: photoDraft,
          reason: reason.trim(),
          version: photoType.version,
        }),
      });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? "Unable to save the photo changes."); await load(); return; }
      notify(`Photos for ${photoType.name} saved.`);
      closePhotos();
      await load();
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft) return;
    const creating = !editing;
    if (creating && draft.name.trim().length < 3) { notify("Enter a room type name (at least 3 characters)."); return; }
    if (creating && createPhotos.length === 0) { setPhotoError(true); notify("At least one room photo is required."); return; }
    if (draft.reason.trim().length < 3) { notify("Enter a reason for this change."); return; }
    setBusy(true);
    try {
      const payload = {
        ...(creating ? { name: draft.name.trim(), photoUrls: createPhotos } : {}),
        description: draft.description.trim(),
        maxGuests: Number(draft.maxGuests),
        beds: draft.beds.trim(),
        sizeSqm: draft.sizeSqm ? Number(draft.sizeSqm) : null,
        amenities: draft.amenities.split(",").map((x) => x.trim()).filter(Boolean),
        baseRate: Number(draft.baseRate || 0),
        active: draft.active,
        reason: draft.reason.trim(),
        ...(!creating ? { version: editing!.version } : {}),
      };
      const response = await fetch(creating ? "/api/catalog/room-types" : `/api/catalog/room-types/${editing!.id}`, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? (creating ? "Unable to create the room type." : "Unable to save the room type.")); return; }
      notify(creating ? `${draft.name.trim()} created.` : `${editing!.name} updated.`);
      if (creating) keepCreatePhotos.current = true; // photos now belong to the type — skip abandon cleanup
      closeEditor();
      await load();
    } finally { setBusy(false); }
  };

  const proposeRate = async (item: RoomType) => {
    const rate = await dialogs.askPrompt({
      title: "Propose new rate",
      message: `Current rate for ${item.name} is ${peso(item.base_rate)} per night. The new rate applies only after Owner or Admin approval.`,
      label: "Proposed rate per night (₱)",
      inputType: "number",
      required: true,
      validation: (value) => { const n = Number(value); if (!Number.isFinite(n) || n < 0) return "Enter a valid rate."; return null; },
    });
    const amount = Number(rate);
    if (rate == null || rate.trim() === "") return;
    const reason = await dialogs.askPrompt({
      title: "Reason for the rate change",
      message: "Audited with the proposal and shown to whoever reviews it.",
      label: "Reason",
      inputType: "text",
      required: true,
      validation: reasonCheck,
    });
    if (reason == null || reason.trim() === "") return;
    const response = await fetch(`/api/catalog/room-types/${item.id}/rate-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate: amount, reason: reason.trim(), version: item.version }),
    });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to submit the rate proposal."); return; }
    notify(`Rate proposal for ${item.name} sent for approval.`);
    await load();
  };

  const reviewProposal = async (item: RoomType, proposal: Proposal, decision: "approve" | "reject") => {
    const reason = await dialogs.askPrompt({
      title: decision === "approve" ? "Approve rate proposal" : "Reject rate proposal",
      message: `${item.name}: ${peso(item.base_rate)} → ${peso(proposal.proposed_rate)} per night. Proposed: “${proposal.reason}”`,
      label: "Decision reason",
      inputType: "text",
      required: true,
      validation: reasonCheck,
    });
    if (reason == null || reason.trim() === "") return;
    const response = await fetch(`/api/catalog/room-types/rate-proposals/${proposal.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: reason.trim() }),
    });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to review the rate proposal."); return; }
    notify(decision === "approve" ? `Rate for ${item.name} set to ${peso(proposal.proposed_rate)}.` : `Rate proposal for ${item.name} rejected.`);
    await load();
  };

  return (
    <div className="workspace-body-inner">
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Customer-facing catalog</p>
          <h1>Room types &amp; photos</h1>
          <p>{canPropose
            ? "Create and maintain the rooms shown to guests on Find a Room — details, photos, availability. Rate changes go to Owner/Admin for approval."
            : "Create and maintain the rooms shown to guests on Find a Room — details, rate, availability, and photo gallery (URL or upload)."}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-soft" onClick={() => { if (error) void load(); else notify("Choose a room type below to edit its details and photos."); }} title="Refresh catalog">
            <RefreshCw size={16}/> Refresh
          </button>
          <button className="btn btn-accent" onClick={openCreate}>
            <Plus size={16}/> Add room type
          </button>
        </div>
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
          <div className="catalog-cards">
            {visible.map((item) => {
              const primary = roomPrimary(item.photo_urls, item.name);
              const pending = pendingOf(item);
              return (
                <article className="catalog-card" key={item.id}>
                  <div className="catalog-card-media">
                    {primary ? <img src={primary} alt="" loading="lazy"/> : <span className="catalog-card-empty"><ImagePlus size={22}/></span>}
                    <span className={`badge ${item.active ? "active" : "inactive"}`}>{item.active ? "Published" : "Unpublished"}</span>
                  </div>
                  <div className="catalog-card-body">
                    <h3>{item.name}</h3>
                    <p className="catalog-card-desc">{label(item.description.length > 120 ? item.description.slice(0, 120) + "…" : item.description)}</p>
                    <ul className="catalog-card-facts">
                      <li><Users size={13} aria-hidden="true"/> {item.max_guests} guests</li>
                      <li><BedDouble size={13} aria-hidden="true"/> {label(item.beds)}</li>
                      {item.size_sqm ? <li>{item.size_sqm} m²</li> : null}
                      <li><Building2 size={13} aria-hidden="true"/> {item.physicalRooms ?? 0} room{(item.physicalRooms ?? 0) !== 1 ? "s" : ""} · {item.activeRooms ?? 0} in service</li>
                    </ul>
                    <div className="catalog-card-rate">
                      <strong>{peso(item.base_rate)}</strong>
                      <small>/ night{pending ? "" : " · base rate"}</small>
                      {pending && <small className="muted">→ {peso(pending.proposed_rate)} awaiting approval</small>}
                    </div>
                    {!item.active && <p className="catalog-card-why">{publishHint(item)}</p>}
                    <div className="btn-row catalog-card-actions">
                      {pending && canSetRate && (
                        <>
                          <button className="table-action view-action" onClick={() => void reviewProposal(item, pending, "approve")} title={`Approve ${peso(pending.proposed_rate)} per night`}><Check size={14}/> Approve rate</button>
                          <button className="table-action danger-action" onClick={() => void reviewProposal(item, pending, "reject")} title="Reject this rate proposal"><X size={14}/> Reject</button>
                        </>
                      )}
                      <button className="table-action view-action" onClick={() => setPreview(item)} title="See this type as guests see it"><Eye size={14}/> Preview</button>
                      <button className="table-action view-action" onClick={() => openPhotos(item)}><Images size={14}/> Manage photos ({(item.photo_urls ?? []).length})</button>
                      <button className="table-action view-action" onClick={() => openEditor(item)}><Pencil size={14}/> Edit</button>
                    </div>
                    <p className="catalog-card-version muted">v{item.version} · changes are audited</p>
                  </div>
                </article>
              );
            })}
          </div>
          {visible.length === 0 && <div className="empty"><Search/><h3>No room types match</h3><p>Try a different search, or add a room type.</p></div>}
        </div>
      )}
      {toast && <div className="toast" role="status"><Building2 size={18}/>{toast}</div>}
      {dialogs.view}

      {preview && (
        <Modal isOpen onClose={() => setPreview(null)} title={preview.name}
          description={`Rooms & suites · up to ${preview.max_guests} guest${preview.max_guests !== 1 ? "s" : ""}`}
          size="full" headerVariant="branded" className="room-details-modal"
          footer={<span className="rd-foot-rate"><small>Nightly base rate</small><strong>{peso(preview.base_rate)}</strong></span>}>
          {!preview.active && <strong className="rd-draft-banner">DRAFT — not visible to guests{pendingOf(preview) ? " (rate approval pending)" : ""}</strong>}
          <RoomTypeDetailsBody
            room={previewRoom(preview)}
            note={<p className="rd-note">{preview.physicalRooms ?? 0} physical room{(preview.physicalRooms ?? 0) !== 1 ? "s" : ""} back this type · {preview.activeRooms ?? 0} in service</p>}
            rateLine={null}
          />
        </Modal>
      )}

      {photoType && photoDraft != null && (
        <Modal isOpen onClose={closePhotos} title={`Manage photos — ${photoType.name}`}
          description="The first photo is the cover guests see. Reorder, set a new cover, add by URL or upload."
          size="lg" headerVariant="branded">
          <div className="form-dialog">
            <div className="form-field">
              <div className="form-field-wrapper">
                <label className="form-label">Photo gallery <span className="muted">({photoDraft.length}/24)</span></label>
                <div className="photo-manager">
                  {photoDraft.map((url, index) => (
                    <div className="photo-tile" key={url}>
                      {index === 0 && <span className="photo-cover-tag">Cover</span>}
                      <img src={url} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}/>
                      <div className="photo-tile-actions">
                        {index > 0 && <button type="button" className="table-action" onClick={() => movePhoto(index, index - 1)} aria-label="Move earlier">←</button>}
                        {index > 0 && <button type="button" className="table-action" onClick={() => movePhoto(index, 0)} aria-label="Set as cover" title="Make this the cover photo">☆</button>}
                        {index < photoDraft.length - 1 && <button type="button" className="table-action" onClick={() => movePhoto(index, index + 1)} aria-label="Move later">→</button>}
                        <button type="button" className="table-action danger-action" onClick={() => setPhotos(photoDraft.filter((_, i) => i !== index))} aria-label="Remove photo"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                  {photoDraft.length === 0 && <p className="muted">No photos yet — guests will see the stock gallery until you add photos here.</p>}
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
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={closePhotos}>Cancel</button>
              <button type="button" className="btn btn-accent" onClick={savePhotos} disabled={busy}>{busy ? <Loader2 className="spin" size={15}/> : null} Save photos</button>
            </div>
          </div>
        </Modal>
      )}

      {draft && (
        <Modal isOpen onClose={closeEditor} title={editing ? `Edit ${editing.name}` : "Add room type"}
          description={editing
            ? "Changes are audited and apply to future bookings only. Room type name is fixed."
            : canPropose
              ? "New room types start inactive. As Manager, your rate goes to Owner/Admin for approval before the type can go live."
              : "Create a guest-facing room type. It appears on Find a Room once active."}
          size="lg" headerVariant="branded">
          <div className="form-dialog">
            {!editing && (
              <div className="form-field">
                <div className="form-field-wrapper">
                  <label htmlFor="rt-name" className="form-label">Room type name <span className="required">*</span></label>
                  <input id="rt-name" className="form-input" type="text" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Garden Twin Deluxe"/>
                  <small className="muted">Names are permanent — physical rooms and past reservations reference them.</small>
                </div>
              </div>
            )}
            {editing && (
              <div className="form-field">
                <div className="form-field-wrapper">
                  <label className="form-label">Photos <span className="muted">({(editing.photo_urls ?? []).length}/24)</span></label>
                  <button type="button" className="btn btn-soft" onClick={async () => {
                    // Photo edits save independently, so the editor must close first —
                    // confirm when there are unsaved changes to lose.
                    if (JSON.stringify(draft) !== JSON.stringify(draftFrom(editing)) && !(await dialogs.askConfirm({ title: "Discard edits?", message: "Opening the photo manager closes this editor. Unsaved changes are lost.", confirmText: "Discard edits" }))) return;
                    closeEditor();
                    openPhotos(editing);
                  }}><Images size={15}/> Open photo manager</button>
                </div>
              </div>
            )}
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-desc" className="form-label">Description <span className="required">*</span></label>
                <textarea id="rt-desc" className="form-input" rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this room worth booking?"/>
              </div>
            </div>
            {!editing && (
              <div className="form-field">
                <div className="form-field-wrapper">
                  <label className="form-label">Room photos <span className="required">*</span></label>
                  <small className="muted">Upload at least one guest-facing room photo. You can add, reorder, or change photos later.</small>
                  <input ref={createFileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onPickCreateFiles(e.target.files)}/>
                  <button type="button" className={`photo-drop${createDragOver ? " dragover" : ""}`} onClick={() => createFileRef.current?.click()} disabled={uploading}
                    aria-label="Upload room photos"
                    onDragOver={(e) => { e.preventDefault(); setCreateDragOver(true); }}
                    onDragLeave={() => setCreateDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setCreateDragOver(false); void onPickCreateFiles(e.dataTransfer.files); }}>
                    {uploading ? <Loader2 className="spin" size={18}/> : <ImagePlus size={18} aria-hidden="true"/>}
                    <span>{uploading ? "Uploading…" : "Drag images here or choose photos"}</span>
                    <small>JPG, PNG, or WebP · up to 5 MB each</small>
                  </button>
                  {createPhotos.length > 0 && (
                    <div className="photo-manager">
                      {createPhotos.map((url, index) => (
                        <div className="photo-tile" key={url}>
                          {index === 0 && <span className="photo-cover-tag">Cover</span>}
                          <img src={url} alt={`Room photo ${index + 1}`} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}/>
                          <div className="photo-tile-actions">
                            {index > 0 && <button type="button" className="table-action" onClick={() => moveCreatePhoto(index, index - 1)} aria-label="Move earlier">←</button>}
                            {index > 0 && <button type="button" className="table-action" onClick={() => moveCreatePhoto(index, 0)} aria-label="Set as cover" title="Make this the cover photo">☆</button>}
                            {index < createPhotos.length - 1 && <button type="button" className="table-action" onClick={() => moveCreatePhoto(index, index + 1)} aria-label="Move later">→</button>}
                            <button type="button" className="table-action danger-action" onClick={() => removeCreatePhoto(index)} aria-label="Remove photo"><Trash2 size={13}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoError && <small className="form-error" role="alert">At least one room photo is required.</small>}
                </div>
              </div>
            )}
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
                <label htmlFor="rt-rate" className="form-label">Base rate / night {canSetRate && <span className="required">*</span>}</label>
                <input id="rt-rate" className="form-input" type="number" min={0} value={draft.baseRate} onChange={(e) => set("baseRate", e.target.value)} readOnly={!!editing && canPropose}/>
                {editing && canPropose && <small className="muted">Read-only for Manager — use “Propose new rate” below; Owner/Admin approve changes.</small>}
                {!editing && canPropose && <small className="muted">Goes to Owner/Admin for approval; the type starts inactive.</small>}
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
                <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} disabled={!editing && canPropose}/>
                <span>Active for future booking{!editing && canPropose ? " — enabled after the rate is approved" : ""}</span>
              </label>
            </div>
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="rt-reason" className="form-label">Reason for change <span className="required">*</span></label>
                <input id="rt-reason" className="form-input" type="text" value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Audited with every save"/>
              </div>
            </div>
            <div className="form-actions">
              {editing && canPropose && <button type="button" className="btn btn-soft" onClick={() => void proposeRate(editing)}>Propose new rate…</button>}
              <button type="button" className="btn btn-soft" onClick={closeEditor}>Cancel</button>
              <button type="button" className="btn btn-accent" onClick={save} disabled={busy || (!editing && uploading)}>{busy ? <Loader2 className="spin" size={15}/> : null} {editing ? "Save changes" : "Create room type"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
