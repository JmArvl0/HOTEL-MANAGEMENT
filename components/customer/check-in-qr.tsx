"use client";

import { useEffect, useState } from "react";
import { QrCode, Download } from "lucide-react";

/**
 * Guest-facing check-in QR. Fetched fresh from the server each time the
 * reservation page opens — the QR contains only an opaque token, no personal
 * data — and presenting it at the Front Desk merely opens the standard
 * check-in workflow. All check-in rules still apply.
 */
export function CheckInQr({ reservationId, confirmationNumber }: { reservationId: string; confirmationNumber?: string }) {
  const [qr, setQr] = useState<{ dataUrl: string; expiresAt: string } | null>(null);
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

  const expires = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(qr.expiresAt));

  // The QR rotates on every page open, so the file is a snapshot of the code
  // currently shown — re-open the page for a fresh one before presenting it.
  const download = () => {
    const link = document.createElement("a");
    link.href = qr.dataUrl;
    link.download = `haven-check-in-${confirmationNumber ?? "qr"}.png`;
    link.click();
  };

  return (
    <div className="customer-checkin-qr">
      <div className="customer-checkin-qr-head">
        <h3><QrCode size={15} aria-hidden /> Check-in QR</h3>
        <p>Show this code at the Front Desk to start check-in. Identification and any balance due are still verified in person.</p>
      </div>
      <div className="customer-checkin-qr-figure">
        <img src={qr.dataUrl} alt={confirmationNumber ? `Check-in QR for reservation ${confirmationNumber}` : "HAVEN check-in QR code"} width={150} height={150} />
      </div>
      <div className="customer-checkin-qr-foot">
        <div className="customer-checkin-qr-validity">
          <small>Valid until</small>
          <strong>{expires}</strong>
          <span>The code refreshes securely each time you open this page.</span>
        </div>
        <button type="button" className="btn btn-soft" onClick={download}><Download size={15} aria-hidden />Download QR</button>
      </div>
    </div>
  );
}
