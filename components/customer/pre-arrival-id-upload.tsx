"use client";

import { useState, type FormEvent } from "react";

/**
 * Pre-arrival ID upload for confirmed stays. Submits an ID photo for Front
 * Desk review — the upload alone never verifies identity. Shows the review
 * state (pending / verified) returned by the server.
 */
export function PreArrivalIdUpload({ reservationId }: { reservationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Choose an ID photo to upload.");
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(`/api/account/reservations/${reservationId}/id-document`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Upload failed. Please try again.");
        return;
      }
      setDone(true);
      setMessage("ID received — the Front Desk will verify it before your arrival.");
    } catch {
      setMessage("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p role="status">ID submitted for verification.</p>;
  return (
    <form onSubmit={submit} className="customer-id-upload" aria-label="Pre-arrival ID upload">
      <label>
        Valid ID photo (JPEG/PNG/WebP, max 5 MB)
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <p>Speeds up arrival and enables express self-check-in once verified.</p>
      <button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload ID"}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
