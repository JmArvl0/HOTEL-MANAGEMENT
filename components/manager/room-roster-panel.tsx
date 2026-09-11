"use client";
import { useEffect, useState } from "react";
import { DoorClosed, Loader2, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";

// Configuration-only roster for physical rooms. Occupancy, housekeeping, and
// maintenance state belong to their own workflows and are shown read-only —
// nothing here can write them. Every save goes through the audited,
// version-checked catalog route.
type Room = {
  id: string; number: string; floor: number; type: string;
  status: string; housekeeping: string;
  wing: string | null; administrative_designation: string | null;
  administratively_active: boolean;
  deactivated_at: string | null; deactivation_reason: string | null;
  configuration_version: number;
  commitments: number;
};
type RoomType = { id: string; name: string; active: boolean; badge_color_key?: string | null };
type Draft = { number: string; type: string; floor: string; wing: string; designation: string; active: boolean; reason: string };

const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");
const day = (value: string | null) => (value ? String(value).slice(0, 10) : "");
const emptyDraft = (type: string): Draft => ({ number: "", type, floor: "", wing: "", designation: "", active: true, reason: "" });
const draftFrom = (room: Room): Draft => ({
  number: room.number, type: room.type, floor: String(room.floor ?? ""),
  wing: room.wing ?? "", designation: room.administrative_designation ?? "",
  active: room.administratively_active, reason: "",
});
// Why the row reads the way it does: the administrative switch and the
// operational picture are independent facts, so both are stated.
const adminLine = (room: Room) =>
  room.administratively_active
    ? "Active"
    : `Inactive — retired ${day(room.deactivated_at) || "earlier"}${room.deactivation_reason ? `: ${room.deactivation_reason}` : ""}`;

export default function RoomRosterPanel({ onClose }: { onClose: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Room | null>(null); // null + open draft = create mode
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const load = async () => {
    const response = await fetch("/api/catalog/rooms", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the physical room roster."); setLoading(false); return; }
    setRooms(body.data ?? []);
    setTypes(body.roomTypes ?? []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const selectable = types.filter((type) => type.active);
  // Physical rooms inherit the badge color from their room type (rooms.type is
  // the type name) — no per-room color anywhere.
  const colorOf = (typeName: string) => types.find((type) => type.name === typeName)?.badge_color_key ?? null;
  const openEditor = (room: Room) => { setEditing(room); setDraft(draftFrom(room)); };
  const openCreate = () => { setEditing(null); setDraft(emptyDraft(selectable[0]?.name ?? "")); };
  const closeEditor = () => { setEditing(null); setDraft(null); };
  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  // Floors ascending, room number ascending inside a floor — the order someone
  // walking the building would use.
  const floors = Array.from(new Set(rooms.map((room) => Number(room.floor)))).sort((a, b) => a - b);
  const onFloor = (floor: number) => rooms.filter((room) => Number(room.floor) === floor)
    .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));

  const save = async () => {
    if (!draft) return;
    const creating = !editing;
    if (creating && draft.number.trim() === "") { notify("Enter a room number."); return; }
    if (draft.type.trim() === "") { notify("Choose a room type."); return; }
    if (draft.floor.trim() === "" || Number(draft.floor) < 0) { notify("Enter a floor."); return; }
    if (draft.reason.trim().length < 3) { notify("Enter a reason for this change (at least 3 characters)."); return; }
    setBusy(true);
    try {
      const payload = {
        ...(creating ? { number: draft.number.trim() } : {}),
        type: draft.type,
        floor: Number(draft.floor),
        wing: draft.wing.trim(),
        designation: draft.designation.trim(),
        active: draft.active,
        reason: draft.reason.trim(),
        ...(editing ? { version: editing.configuration_version } : {}),
      };
      const response = await fetch(creating ? "/api/catalog/rooms" : `/api/catalog/rooms/${editing!.id}`, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? (creating ? "Unable to add the physical room." : "Unable to save the room configuration.")); return; }
      notify(creating ? `Room ${draft.number.trim()} added.` : `Room ${editing!.number} updated.`);
      closeEditor();
      await load();
    } finally { setBusy(false); }
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title="Manage physical rooms" size="xl" headerVariant="branded"
        description="Configuration only — occupancy, housekeeping, and maintenance state are owned by their workflows and shown here read-only."
        footer={<div className="room-roster-foot">
          <button type="button" className="btn btn-accent" onClick={openCreate} disabled={loading || selectable.length === 0}><Plus size={15}/> Add physical room</button>
          <small className="muted">{rooms.length} room{rooms.length !== 1 ? "s" : ""} · changes are audited</small>
        </div>}>
        {loading ? (
          <div className="empty"><Loader2 className="spin"/><h3>Loading room roster…</h3></div>
        ) : error ? (
          <div className="empty"><DoorClosed/><h3>Roster unavailable</h3><p>{error}</p></div>
        ) : rooms.length === 0 ? (
          <div className="empty"><DoorClosed/><h3>No physical rooms yet</h3><p>Add the building&rsquo;s rooms to make its room types bookable.</p></div>
        ) : (
          <div className="room-roster">
            {floors.map((floor) => (
              <section key={floor}>
                <h3 className="room-roster-floor">Floor {floor}</h3>
                {onFloor(floor).map((room) => (
                  <div className={`room-roster-row${room.administratively_active ? "" : " retired"}`} key={room.id}>
                    <div className="room-roster-id">
                      <b>{label(room.number)}</b>
                      <RoomTypeBadge name={label(room.type)} colorKey={colorOf(room.type)}/>
                      {room.administrative_designation && <small>{label(room.administrative_designation)}</small>}
                    </div>
                    <div className="room-roster-state">
                      <span className={`badge ${room.administratively_active ? "active" : "inactive"}`}>{room.administratively_active ? "Active" : "Inactive"}</span>
                      <small>{adminLine(room)}</small>
                    </div>
                    <div className="room-roster-ops">
                      <span className={`badge ${room.status}`}>{label(room.status)}</span>
                      <small>{label(room.housekeeping)} · workflow-owned</small>
                    </div>
                    <button type="button" className="table-action view-action" onClick={() => openEditor(room)}><Pencil size={13}/> Edit</button>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Modal>

      {toast && <div className="toast"><DoorClosed size={18}/>{toast}</div>}

      {draft && (
        <Modal isOpen onClose={closeEditor} size="lg" headerVariant="branded"
          title={editing ? `Edit Room ${editing.number}` : "Add physical room"}
          description={editing
            ? "Floor, wing, designation, room type, and the administrative switch. Room number is fixed."
            : "A new room joins inventory ready for housekeeping — its operational state is set by the workflows, not here."}>
          <div className="form-dialog">
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="pr-number" className="form-label">Room number {!editing && <span className="required">*</span>}</label>
                {editing
                  ? <><p className="room-roster-fixed">{editing.number}</p><small className="muted">Room numbers are permanent — reservation, housekeeping, and maintenance history reference them.</small></>
                  : <><input id="pr-number" className="form-input" type="text" value={draft.number} onChange={(event) => set("number", event.target.value)} placeholder="101"/><small className="muted">Room numbers are permanent — choose carefully.</small></>}
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="pr-type" className="form-label">Room type <span className="required">*</span></label>
                <select id="pr-type" className="form-input" value={draft.type} onChange={(event) => set("type", event.target.value)} disabled={!!editing && editing.commitments > 0}>
                  {selectable.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
                  {editing && !selectable.some((type) => type.name === editing.type) && <option value={editing.type}>{editing.type}</option>}
                </select>
                {editing && editing.commitments > 0 && <small className="muted">{editing.commitments} upcoming reservation{editing.commitments !== 1 ? "s" : ""} — reassign to change type.</small>}
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="pr-floor" className="form-label">Floor <span className="required">*</span></label>
                <input id="pr-floor" className="form-input" type="number" min={0} max={200} value={draft.floor} onChange={(event) => set("floor", event.target.value)} placeholder="1"/>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field-wrapper">
                <label htmlFor="pr-wing" className="form-label">Wing</label>
                <input id="pr-wing" className="form-input" type="text" value={draft.wing} onChange={(event) => set("wing", event.target.value)} placeholder="Garden"/>
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="pr-designation" className="form-label">Designation</label>
                <input id="pr-designation" className="form-input" type="text" value={draft.designation} onChange={(event) => set("designation", event.target.value)} placeholder="Accessible"/>
              </div>
            </div>
            <div className="form-field">
              <label className="checkbox-option">
                <input type="checkbox" checked={draft.active} onChange={(event) => set("active", event.target.checked)}/>
                <span>Part of sellable inventory</span>
              </label>
              <small className="muted">Clearing this retires the room from inventory. It is not a substitute for maintenance — report a work order for a room that is temporarily out of service.</small>
            </div>
            {editing && (
              <p className="room-roster-ops-note">
                Operational state: {label(editing.status)} · {label(editing.housekeeping)} — set by the Front Desk, Housekeeping, and Maintenance workflows. Not editable here.
              </p>
            )}
            <div className="form-field">
              <div className="form-field-wrapper">
                <label htmlFor="pr-reason" className="form-label">Reason for change <span className="required">*</span></label>
                <input id="pr-reason" className="form-input" type="text" value={draft.reason} onChange={(event) => set("reason", event.target.value)} placeholder="Audited with every save"/>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-soft" onClick={closeEditor}>Cancel</button>
              <button type="button" className="btn btn-accent" onClick={save} disabled={busy}>{busy ? <Loader2 className="spin" size={15}/> : null} {editing ? "Save changes" : "Add room"}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
