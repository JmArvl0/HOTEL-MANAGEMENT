"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MapPin, Plus, RefreshCw, ArrowUpRight, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { HavenErrorAlert, HavenSkeletonCard } from "@/components/ui/haven-data-controls";
import { ToastStack, useToasts } from "@/components/ui/toast-stack";
import { locationImageUrl, locationSaveSchema, SAMPLE_IMAGES, type LocationEditorData, type LocationHotel, type LocationCategory, type LocationPlace, type LocationRoute } from "@/lib/location-content";
import "./location-content-panel.css";

type Kind = "hotel" | "category" | "place" | "route";
type ContentRow = LocationHotel | LocationCategory | LocationPlace | LocationRoute;
type Fields = Record<string, string | number | boolean | null>;
type Editing = { kind: Kind; id: string | null; version: number; body: Fields; initial: string };
const tabs: [Kind | "images", string][] = [["hotel", "Hotel location"], ["place", "Nearby places"], ["category", "Categories"], ["route", "Route guides"], ["images", "Images"]];
const singular = { hotel: "Hotel location", category: "Category", place: "Nearby place", route: "Route guide" };
const geo = { latitude: null, longitude: null, maps_label: "", google_place_id: "", verification_source: "", verified_at: null };
const picture = { image_id: null, sample_image: null, image_alt: "" };
const distance = { distance_m: null, distance_basis: "walking", distance_reviewed_at: null };

export default function LocationContentPanel() {
  const [data, setData] = useState<LocationEditorData | null>(null), [tab, setTab] = useState<Kind | "images">("hotel"), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null), [formError, setFormError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const dialogs = useActionDialogs(), toasts = useToasts();
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/admin/location", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load location content."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const controller = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(controller); }, [load]);
  function open(kind: Kind, row?: ContentRow) {
    let body: Fields;
    if (row) { body = Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "version", "updated_at"].includes(key))) as Fields; if (kind === "hotel") delete body.location_revision; }
    else if (kind === "category") body = { name: "", slug: "", status: "draft", sort_order: data?.categories.length ?? 0 };
    else if (kind === "place") body = { ...geo, ...picture, ...distance, name: "", description: "", category_id: data?.categories[0]?.id ?? null, featured: false, maps_search: "", location_revision: data?.hotel?.location_revision ?? 1, status: "draft", sort_order: data?.places.length ?? 0 };
    else body = { ...geo, ...picture, ...distance, distance_basis: "driving", origin_name: "", description: "", travel_mode: "driving", location_revision: data?.hotel?.location_revision ?? 1, status: "draft", sort_order: data?.routes.length ?? 0 };
    setFormError(""); setEditing({ kind, id: row?.id ?? null, version: row?.version ?? 0, body, initial: JSON.stringify(body) });
  }
  const change = (key: string, value: Fields[string]) => setEditing(current => current ? { ...current, body: { ...current.body, [key]: value } } : current);
  async function close() {
    if (busy || uploading) return;
    if (editing && JSON.stringify(editing.body) !== editing.initial && !(await dialogs.askConfirm({ title: "Discard changes?", message: "Your unsaved content will be lost. Uploaded images remain private in Images until used or deleted.", confirmText: "Discard changes" }))) return;
    setEditing(null); setFormError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy || uploading) return;
    const parsed = locationSaveSchema.safeParse(editing);
    if (!parsed.success) { setFormError(parsed.error.issues.map(issue => issue.message).join(" ")); return; }
    if (editing.kind === "hotel" && data?.hotel && ["address", "latitude", "longitude", "maps_label", "embed_url", "is_demo"].some(key => editing.body[key] !== (data.hotel as unknown as Fields)[key])) {
      if (!(await dialogs.askConfirm({ title: "Change the hotel location?", message: "All nearby places and route guides will return to draft. Review their locations, images and distances before publishing them for this hotel pin.", confirmText: "Save new location" }))) return;
    }
    setBusy(true); setFormError("");
    try { const response = await fetch("/api/admin/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setEditing(null); toasts.push({ title: "Content saved", tone: "success", detail: "Published changes appear on the next landing-page visit." }); await load(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to save. Your changes are still in this form."); }
    finally { setBusy(false); }
  }
  async function remove(kind: Kind, row: ContentRow) {
    if (busy || !(await dialogs.askConfirm({ title: kind === "hotel" ? "Clear the hotel location?" : `Delete this ${singular[kind].toLowerCase()}?`, message: kind === "hotel" ? "The map/address will be cleared and all nearby places and routes returned to draft. Hotel operations and bookings are unaffected." : "This removes the content record. Uploaded images stay private and can be cleaned up in Images. Categories in use cannot be deleted.", confirmText: kind === "hotel" ? "Clear location" : "Delete", variant: "danger" }))) return;
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/location", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: row.id, version: row.version }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); toasts.push({ title: "Content removed", tone: "success" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete this item."); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    if (!file.size || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setFormError("Choose a nonempty JPEG, PNG or WebP image, 5 MB or smaller."); return; }
    setUploading(true); setFormError("");
    try { const form = new FormData(); form.append("file", file); const response = await fetch("/api/admin/location/images", { method: "POST", body: form }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(current => current ? { ...current, images: [body.data, ...current.images] } : current); setEditing(current => current ? { ...current, body: { ...current.body, image_id: body.data.id, sample_image: null } } : current); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Upload failed. Please try again."); }
    finally { setUploading(false); }
  }
  async function removeImage(id: string) {
    if (busy || !(await dialogs.askConfirm({ title: "Delete this unused image?", message: "This removes the private file. Images attached to any draft or published content cannot be deleted.", confirmText: "Delete image", variant: "danger" }))) return;
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/location/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); toasts.push({ title: "Image deleted", tone: "success" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove image."); }
    finally { setBusy(false); }
  }
  const list: ContentRow[] = !data ? [] : tab === "hotel" ? data.hotel ? [data.hotel] : [] : tab === "category" ? data.categories : tab === "place" ? data.places : tab === "route" ? data.routes : [];
  const d = editing?.body ?? {};
  function field(key: string, label: string, type: "text" | "number" | "date" | "textarea" = "text", required = false, hint?: string) {
    const value = d[key] === null || d[key] === undefined ? "" : String(d[key]);
    return <label className={type === "textarea" ? "le-wide" : undefined} key={key}>{label}{type === "textarea" ? <textarea value={value} required={required} maxLength={key === "address" ? 500 : key.includes("description") ? 1500 : 1000} onChange={event => change(key, event.target.value)} /> : <input type={type} value={value} required={required} step={type === "number" ? "any" : undefined} maxLength={type === "text" ? key === "embed_url" ? 8192 : key === "verification_source" ? 1000 : 200 : undefined} onChange={event => change(key, type === "number" ? event.target.value === "" ? null : Number(event.target.value) : type === "date" ? event.target.value || null : event.target.value)} />}{hint && <small>{hint}</small>}</label>;
  }
  function select(key: string, label: string, options: [string, string][], nullable = false) { return <label key={key}>{label}<select value={String(d[key] ?? "")} onChange={event => { change(key, nullable ? event.target.value || null : event.target.value); if (key === "image_id" && event.target.value) change("sample_image", null); }}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }
  return <section className="location-editor" aria-labelledby="location-editor-title"><ToastStack controller={toasts} />
    <div className="le-heading"><div><h2 id="location-editor-title"><MapPin size={23} aria-hidden="true" />Location &amp; Places</h2><p>Your landing-page address, map, local guide and arrival routes.</p></div><div className="btn-row"><a className="btn btn-soft" href="/#how-to-go" target="_blank" rel="noopener noreferrer">View landing page <ArrowUpRight size={15} /></a><button type="button" className="btn btn-soft" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} />Refresh</button></div></div>
    <nav className="le-tabs" aria-label="Location management">{tabs.map(([key, title]) => <button key={key} type="button" className={`btn ${tab === key ? "btn-accent" : "btn-soft"}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</nav>
    {error && <HavenErrorAlert title="Location content needs attention" body={error} action={<button type="button" className="btn btn-soft" onClick={() => void load()}>Try again</button>} />}
    {loading ? <HavenSkeletonCard hasHeader /> : data && <>
      {data.hotel?.is_demo && <p className="le-notice">Demo mode is enabled. The public landmark, AI sample photos and manual sample distances are labeled on the landing page. Configure your client’s actual hotel, turn off demo mode, then re-verify and publish the guide.</p>}
      <div className="le-list-heading"><h3>{tabs.find(([key]) => key === tab)?.[1]}</h3>{tab !== "hotel" && tab !== "images" && <button type="button" className="btn btn-accent" disabled={busy} onClick={() => open(tab)}><Plus size={16} />Add {singular[tab].toLowerCase()}</button>}</div>
      {tab === "images" ? <div className="le-images">{data.images.length ? data.images.map(image => { const used = [...data.places, ...data.routes].filter(item => item.image_id === image.id).length; return <article key={image.id} className="data-panel">{!image.deleting && <Image src={`/api/location/images/${image.id}?preview=1`} alt="Uploaded location content" width={240} height={150} unoptimized />}<p>{image.width} × {image.height} · {Math.ceil(image.bytes / 1024)} KB</p><p>{image.deleting ? "Private file cleanup pending" : used ? `Used in ${used} ${used === 1 ? "item" : "items"}` : "Unused private upload"}</p><button type="button" className="btn btn-soft" disabled={busy || used > 0} onClick={() => void removeImage(image.id)}>{image.deleting ? "Retry cleanup" : "Delete unused image"}</button></article>; }) : <div className="empty"><ImageIcon /><h3>No uploaded images.</h3><p>Upload a photo while editing a nearby place or route. Draft uploads stay private.</p></div>}</div> : <div className="le-list">{list.length ? list.map(row => <article className="data-panel le-row" key={row.id}><div><h3>{"origin_name" in row ? row.origin_name : row.name}{"featured" in row && row.featured && <span className="le-state">Featured</span>}</h3><p>{"address" in row ? row.address || "Address not configured" : "description" in row ? row.description : "slug" in row ? row.slug : ""}</p><p className="le-meta"><span className={`le-state le-${row.status}`}>{row.status === "published" ? "Published" : "Draft"}</span>{"sort_order" in row && <span>Order {row.sort_order}</span>}{"location_revision" in row && row.location_revision !== data.hotel?.location_revision && <span>Location review required</span>}</p></div><div className="btn-row"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => open(tab as Kind, row)}><Pencil size={15} />Edit</button><button type="button" className="btn btn-soft" disabled={busy} onClick={() => void remove(tab as Kind, row)}><Trash2 size={15} />{tab === "hotel" ? "Clear location" : "Delete"}</button></div></article>) : <div className="empty"><MapPin /><h3>No content yet.</h3><p>{tab === "hotel" ? "The location configuration is unavailable. Check that the content migration is applied." : "Create a draft, add the details, then publish when it is ready."}</p></div>}</div>}
    </>}
    <Modal isOpen={!!editing} onClose={() => void close()} title={editing ? `${editing.id ? "Edit" : "Add"} ${singular[editing.kind].toLowerCase()}` : "Edit content"} size="lg" className="location-edit-dialog" closeOnOverlayClick={!busy && !uploading} closeOnEscape={!busy && !uploading}>
      {editing && <form className="location-form" onSubmit={event => void save(event)}>{formError && <HavenErrorAlert title="Check this content" body={formError} />}
        <fieldset disabled={busy || uploading}><legend>Content details</legend><div className="le-fields">
          {editing.kind === "route" ? field("origin_name", "Origin name", "text", true) : field("name", editing.kind === "hotel" ? "Hotel display name" : "Name", "text", true)}
          {select("status", "Publication status", [["draft", "Draft"], ["published", "Published"]])}
          {editing.kind !== "hotel" && field("sort_order", "Display order", "number", true, "Lower numbers appear first.")}
          {editing.kind === "category" && field("slug", "Category slug", "text", true, "Use lowercase words with hyphens, for example dining.")}
          {editing.kind === "hotel" ? <>{field("address", "Published address", "textarea")}{field("entrance_notes", "Arrival and entrance notes", "textarea")}{field("directions_title", "Directions section title", "text", true)}{field("directions_description", "Directions introduction", "textarea")}{field("nearby_title", "Nearby section title", "text", true)}{field("nearby_description", "Nearby introduction", "textarea")}<label className="le-check le-wide"><input type="checkbox" checked={d.is_demo === true} onChange={event => change("is_demo", event.target.checked)} />Label this website location as a demo (sample photos and distances)</label></> : editing.kind !== "category" && field("description", "Description / arrival guide", "textarea")}
          {editing.kind === "place" && <>{select("category_id", "Place category", [["", "Choose a category"], ...(data?.categories.map(item => [item.id, `${item.name}${item.status !== "published" ? " (draft)" : ""}`] as [string, string]) ?? [])], true)}<label className="le-check"><input type="checkbox" checked={d.featured === true} onChange={event => change("featured", event.target.checked)} />Feature this destination (replaces the current selection)</label></>}
        </div></fieldset>
        {editing.kind !== "category" && <fieldset disabled={busy || uploading}><legend>Map and verification</legend><div className="le-fields">{field("latitude", editing.kind === "route" ? "Origin latitude" : "Latitude", "number")}{field("longitude", editing.kind === "route" ? "Origin longitude" : "Longitude", "number")}{field("maps_label", "Google Maps place / address", "text", false, "Optional precise place name/address. Verified coordinates are still required for client content.")}{field("google_place_id", "Google place ID (optional)")}{field("verification_source", "Verification source URL", "text", false, "A complete HTTPS link showing the verified location.")}{field("verified_at", "Location verified on", "date")}
          {editing.kind === "hotel" && field("embed_url", "Google Maps embed URL", "text", false, "Google Maps → Share → Embed a map. Paste the https://www.google.com/maps/embed?pb=… URL from src; do not paste HTML. No paid API key is needed.")}
          {editing.kind === "route" && select("travel_mode", "Navigation mode", [["driving", "Driving"], ["walking", "Walking"], ["transit", "Public transport"], ["bicycling", "Cycling"]])}
          {editing.kind === "place" && (data?.hotel?.is_demo || !!d.maps_search) && field("maps_search", "Demo category search (optional)", "text", false, "For generic samples only. Clear this search before publishing real client content; use verified place coordinates instead.")}
          {editing.kind !== "hotel" && <label className="le-check le-wide"><input type="checkbox" checked={d.location_revision === data?.hotel?.location_revision} onChange={event => change("location_revision", event.target.checked ? data?.hotel?.location_revision ?? 1 : 0)} />Reviewed for the current hotel location (revision {data?.hotel?.location_revision})</label>}
        </div></fieldset>}
        {(editing.kind === "place" || editing.kind === "route") && <>
          <fieldset disabled={busy || uploading}><legend>Manually maintained distance (optional)</legend><div className="le-fields">{field("distance_m", "Distance in metres", "number")}{select("distance_basis", "Distance basis", [["walking", "Walking"], ["driving", "Driving"], ["straight_line", "Straight-line"]])}{field("distance_reviewed_at", "Distance reviewed on", "date")}</div><p>Leave the distance empty if unknown. No travel time is calculated or invented.</p></fieldset>
          <fieldset disabled={busy || uploading}><legend>Image (optional)</legend><div className="le-fields"><label className="le-wide">Upload a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /><small>{uploading ? "Validating and uploading…" : "JPEG, PNG or WebP, up to 5 MB / 6000 × 6000 px. Images are checked, resized and stored privately."}</small></label>{select("image_id", "Use an uploaded image", [["", "No uploaded image"], ...(data?.images.filter(item => !item.deleting).map(item => [item.id, `Photo ${item.id.slice(0, 8)} · ${item.width} × ${item.height}`] as [string, string]) ?? [])], true)}{(data?.hotel?.is_demo || !!d.sample_image) && <label>Demo photo (clear for client content)<select value={String(d.sample_image ?? "")} onChange={event => { change("sample_image", event.target.value || null); if (event.target.value) change("image_id", null); }}><option value="">No sample photo</option>{SAMPLE_IMAGES.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}{field("image_alt", "Image description (alt text)", "text", false, "Describe the image accurately. Distinguish an AI concept from a photograph of a named place.")}</div>
            {locationImageUrl({ image_id: d.image_id as string | null, sample_image: d.sample_image as LocationPlace["sample_image"] }, true) && <Image className="le-photo-preview" src={locationImageUrl({ image_id: d.image_id as string | null, sample_image: d.sample_image as LocationPlace["sample_image"] }, true)!} alt={String(d.image_alt || "Selected photo preview")} width={400} height={225} unoptimized />}
          </fieldset>
        </>}
        <div className="le-form-actions"><button type="submit" className="btn btn-accent" disabled={busy || uploading}>{busy ? "Saving…" : uploading ? "Uploading…" : d.status === "published" ? "Save and publish" : "Save draft"}</button><button type="button" className="btn btn-soft" disabled={busy || uploading} onClick={() => void close()}>Cancel</button></div>
      </form>}
    </Modal>{dialogs.view}
  </section>;
}
