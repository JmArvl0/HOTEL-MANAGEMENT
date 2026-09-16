"use client";

import { useEffect, useState } from "react";
import { QrCode, Download } from "lucide-react";

/**
 * Guest-facing stay QR. Fetched from the server each time the reservation
 * page opens — the endpoint is idempotent, so every view re-renders the SAME
 * stable code for the active reservation/stay. The QR contains only an opaque
 * token, no personal data — and presenting it at the Front Desk merely opens
 * the standard workflow. All check-in rules still apply. Validity follows the
 * stay lifecycle, not a countdown: it stays usable until the stay is
 * completed or the reservation is otherwise closed.
 */
export function CheckInQr({ reservationId, confirmationNumber }: { reservationId: string; confirmationNumber?: string }) {
  const [qr, setQr] = useState<{ dataUrl: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/qr/reservation/${reservationId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((body) => { if (!cancelled && body?.data) setQr(body.data); else if (!cancelled) setFailed(true); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [reservationId]);

  if (failed) return null;
  if (!qr) {
    return (
      <div className="customer-checkin-qr" aria-busy="true">
        <div className="customer-checkin-qr-head customer-checkin-qr-skeleton">
          <i /> <i /> <small>Preparing your check-in QR…</small>
        </div>
        <div className="customer-checkin-qr-figure customer-checkin-qr-skeleton">
          <i className="customer-checkin-qr-tile" aria-hidden="true" />
        </div>
      </div>
    );
  }

  // The QR is stable for the whole stay, so the file is a snapshot of the
  // code shown — it stays scannable until the stay is completed or closed.
  const download = () => {
    const link = document.createElement("a");
    link.href = qr.dataUrl;
    link.download = `haven-check-in-${confirmationNumber ?? "qr"}.png`;
    link.click();
  };

  return (
    <div className="customer-checkin-qr">
      <div className="customer-checkin-qr-head">
        <h3><QrCode size={15} aria-hidden /> Reservation QR</h3>
        <p>Present this QR to the Front Desk. It remains valid for this reservation until the stay is completed or the reservation is otherwise closed. Identification and any balance due are still verified in person.</p>
      </div>
      <div className="customer-checkin-qr-figure">
        <img src={qr.dataUrl} alt={confirmationNumber ? `Reservation QR for ${confirmationNumber}` : "HAVEN reservation QR code"} width={150} height={150} />
      </div>
      <div className="customer-checkin-qr-foot">
        <div className="customer-checkin-qr-validity">
          <small>Valid for this stay</small>
          <strong>Until checkout or closure</strong>
          <span>The same code is shown on every visit — no need to request a new one.</span>
        </div>
        <button type="button" className="btn btn-soft" onClick={download}><Download size={15} aria-hidden />Download QR</button>
      </div>
    </div>
  );
}

/**
 * Terminal reservation state: the stay's QR is permanently inactive and no
 * replacement can be issued. Rendered instead of CheckInQr — never alongside
 * a generate/regenerate affordance.
 */
export function CheckInQrExpired({ completed }: { completed: boolean }) {
  return (
    <div className="customer-checkin-qr">
      <div className="customer-checkin-qr-head">
        <h3><QrCode size={15} aria-hidden /> QR expired</h3>
        <p>{completed ? "This stay has been completed." : "This reservation is closed — its QR is permanently inactive and cannot be reissued."}</p>
      </div>
    </div>
  );
}
