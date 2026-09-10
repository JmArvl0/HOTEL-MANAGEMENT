"use client";

import { useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import "./qr-placard.css";

/**
 * Room operations placard. Print it and mount it by the room entrance. The QR
 * contains only an opaque token; every scan is validated server-side against
 * the scanner's role and the room's current state.
 */
export function QrPlacard({
  room, dataUrl, canRotate,
}: { room: { id: string; number: string; floor: number; type: string }; dataUrl: string; canRotate: boolean }) {
  const [current, setCurrent] = useState(dataUrl);
  const [rotating, setRotating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rotate = async () => {
    if (rotating || !confirm("Rotate this room's QR? The current printed placard will stop working immediately.")) return;
    setRotating(true);
    setNote(null);
    try {
      const response = await fetch(`/api/qr/room/${room.id}/rotate`, { method: "POST" });
      const body = await response.json();
      if (response.ok && body?.data?.dataUrl) {
        setCurrent(body.data.dataUrl);
        setNote("Rotated. Print the new placard — the old one is now invalid.");
      } else {
        setNote(body?.error ?? "Unable to rotate the QR.");
      }
    } catch {
      setNote("Unable to reach HAVEN.");
    } finally {
      setRotating(false);
    }
  };

  return (
    <main className="qr-placard-page">
      <div className="qr-placard-sheet" id="qr-placard-sheet">
        <header>
          <p className="qr-placard-brand">HAVEN HOTEL</p>
          <h1>Room {room.number}</h1>
          <p className="qr-placard-sub">Floor {room.floor} · {room.type}</p>
        </header>
        <img className="qr-placard-code" src={current} alt={`HAVEN operations QR code for room ${room.number}`} />
        <p className="qr-placard-hint">Scan for guest services and room operations</p>
        <footer className="qr-placard-footer">
          <span>Haven Hotel · Guest Services</span>
          <span>This code contains no personal data</span>
        </footer>
      </div>
      <div className="qr-placard-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print placard
        </button>
        {canRotate && (
          <button type="button" className="btn btn-secondary" onClick={rotate} disabled={rotating}>
            <RefreshCw size={16} /> {rotating ? "Rotating…" : "Rotate QR"}
          </button>
        )}
        {note && <p className="qr-placard-note" role="status">{note}</p>}
      </div>
    </main>
  );
}
