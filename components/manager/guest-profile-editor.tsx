"use client";

import { useRef, useState, type FormEvent } from "react";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import type { RecordItem } from "@/lib/types";
import styles from "./staff-booking-dialog.module.css";

function profileFields(guest: RecordItem) {
  return {
    phone: typeof guest.phone === "string" ? guest.phone : null,
    address: typeof guest.address === "string" ? guest.address : null,
    preferences: typeof guest.preferences === "string" ? guest.preferences : null,
  };
}

export default function GuestProfileEditor({ guest, onSaved }: { guest: RecordItem; onSaved: () => void }) {
  const [expected, setExpected] = useState(() => profileFields(guest));
  const [draft, setDraft] = useState(expected);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [stale, setStale] = useState(false);
  const pending = useRef(false);

  function open() {
    const profile = profileFields(guest);
    setExpected(profile);
    setDraft(profile);
    setAnnouncement("");
    setError("");
    setStale(false);
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || stale) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetchPublic(`/api/staff/guests/${encodeURIComponent(String(guest.id))}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected, phone: draft.phone ?? "", address: draft.address ?? "", preferences: draft.preferences ?? "" }),
      });
      const body = await readResponse(response);
      if (!response.ok) {
        setError(body.error ?? "The guest profile could not be saved.");
        setStale(body.code === "GUEST_PROFILE_CHANGED");
        return;
      }
      setAnnouncement("Guest profile saved.");
      setEditing(false);
      onSaved();
    } catch {
      setError("The save could not be confirmed. Retry to check the guest profile.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <section className={styles.editor} aria-label="Saved guest details">
    <h3>Saved contact and preferences</h3>
    {announcement && <p role="status">{announcement}</p>}
    {editing ? <form className={styles.form} onSubmit={save}>
      <div className={styles.fields}>
        <label>Phone<input value={draft.phone ?? ""} type="tel" maxLength={40} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label>Address<input value={draft.address ?? ""} maxLength={400} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
        <label className={styles.wide}>Preferences confirmed by the guest<textarea rows={3} value={draft.preferences ?? ""} maxLength={1000} onChange={event => setDraft({ ...draft, preferences: event.target.value })} /></label>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.editorActions}>
        {stale ? <button type="button" className="btn btn-soft" onClick={() => { setEditing(false); onSaved(); }}>Reload profile</button> : <button type="submit" className="btn btn-accent" disabled={saving}>{saving ? "Saving…" : "Save guest profile"}</button>}
        <button type="button" className="btn btn-soft" disabled={saving} onClick={() => setEditing(false)}>Cancel edit</button>
      </div>
    </form> : <button type="button" className="btn btn-soft" onClick={open}>Edit guest profile</button>}
  </section>;
}
