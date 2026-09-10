"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, RefreshCw, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import "./qr-scanner.css";

/**
 * HAVEN QR scanner, rendered as a dashboard modal (opened from the Overview
 * and Reservations modules). Camera scanning via jsQR (works in every modern
 * browser, including iPhone Safari) with a manual token entry fallback for
 * cameras that are blocked or unavailable. Every scan is validated
 * server-side by /api/qr/resolve — the scanner itself decides nothing.
 */

interface ResolvedReservation {
  id: string;
  guestName?: string;
  confirmationNumber: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  roomId?: string | null;
  roomNumber?: string | null;
  paymentStatus?: string;
}

interface ResolveResponse {
  result: "authorized" | "invalid" | "expired" | "revoked" | "unauthorized" | "ineligible";
  message: string;
  resourceType?: "reservation" | "room";
  action?: string;
  reservation?: ResolvedReservation;
  room?: { id?: string; number: string; floor?: number; type?: string; status?: string; housekeeping?: string };
  openTasks?: number;
  openOrders?: number;
  currentStay?: { guestName: string; checkIn: string; checkOut: string } | null;
}

/** "blocked" = permission refused; "unavailable" = no/in-use camera or stream
 *  failure; "insecure" = no getUserMedia at all (http context, old browser). */
type CameraState = "idle" | "starting" | "on" | { error: "blocked" | "unavailable" | "insecure" };

// Outcome CTAs are dashboard actions now — the dashboard maps them to sections
// (or opens the reservation detail) instead of navigating to a page.
const CTA_LABELS: Record<string, string> = {
  check_in: "Open reservation",
  room_tasks: "Open Housekeeping queue",
  work_orders: "Open Maintenance module",
  room_summary: "Done"
};

export function QrScannerModal({ onClose, onCta }: { onClose: () => void; onCta: (action: string, reservationId?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const resolvingRef = useRef(false);

  const [camera, setCamera] = useState<CameraState>("idle");
  const [manualToken, setManualToken] = useState("");
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState<ResolveResponse | null>(null);

  const resolveToken = useCallback(async (token: string) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    try {
      const response = await fetch("/api/qr/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const body = await response.json();
      setOutcome(response.ok
        ? body
        : { result: body.result ?? "invalid", message: body.error ?? body.message ?? "Unable to validate this code." });
    } catch {
      setOutcome({ result: "invalid", message: "Unable to reach HAVEN. Check your connection and try again." });
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera("idle");
  }, []);

  const startCamera = useCallback(async () => {
    setOutcome(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ error: "insecure" });
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCamera({ error: "unavailable" });
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      setCamera("on");
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            stopCamera();
            void resolveToken(code.data);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setCamera({ error: name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable" });
    }
  }, [resolveToken, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  // Keep the typed code across a rejected check so a typo can be corrected —
  // only the outcome is cleared.
  const reset = () => setOutcome(null);

  const ctaLabel = outcome?.action ? CTA_LABELS[outcome.action] : undefined;
  const authorized = outcome?.result === "authorized";

  const errorKind = typeof camera === "object" ? camera.error : null;
  const stateTitle = resolving
    ? "Checking code…"
    : camera === "starting" ? "Starting camera…"
    : errorKind === "blocked" ? "Camera access is blocked"
    : errorKind === "unavailable" ? "Camera unavailable"
    : errorKind === "insecure" ? "Camera not supported"
    : "Camera is off";
  const stateHint = errorKind === "blocked"
    ? "Allow camera access in your browser settings, then try again — or enter the code manually below."
    : errorKind === "unavailable"
    ? "No camera was found, or it's in use by another app. Enter the code manually below."
    : errorKind === "insecure"
    ? "This browser can't access the camera here. Enter the code manually below."
    : null;
  const showStart = !resolving && camera !== "starting" && errorKind !== "insecure";

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Scan a HAVEN QR code"
      description="Scan a guest check-in code or a room placard. You'll be taken to the right action for your role."
      size="md"
      headerVariant="branded"
    >
      {!outcome && (
        <section className="qr-scan" aria-label="QR scanner">
          <div className="qr-viewfinder">
            <video ref={videoRef} muted playsInline className={camera === "on" ? "live" : ""} />
            {camera !== "on" && (
              <div className="qr-viewfinder-state" aria-live="polite">
                {errorKind ? <CameraOff size={30} aria-hidden /> : <Camera size={30} aria-hidden />}
                <p className="qr-state-title">{stateTitle}</p>
                {stateHint && <p className="qr-state-hint">{stateHint}</p>}
                {showStart ? (
                  <button type="button" className="btn btn-accent" onClick={startCamera}>
                    {errorKind ? <RefreshCw size={15} aria-hidden /> : <Camera size={15} aria-hidden />}
                    {errorKind ? "Try again" : "Start camera"}
                  </button>
                ) : camera === "starting" && (
                  <button type="button" className="btn btn-accent" disabled>Starting…</button>
                )}
              </div>
            )}
            {camera === "on" && (
              <div className="qr-live-bar">
                <span>Scanning for QR code…</span>
                <button type="button" className="qr-stop" onClick={stopCamera}>Stop</button>
              </div>
            )}
            <span className="qr-corner tl" aria-hidden /><span className="qr-corner tr" aria-hidden />
            <span className="qr-corner bl" aria-hidden /><span className="qr-corner br" aria-hidden />
          </div>
          <canvas ref={canvasRef} hidden />

          <p className="qr-privacy-note">
            <ShieldCheck size={14} aria-hidden />
            Camera is used only to scan the QR code — video is processed on this device and never recorded or uploaded.
          </p>

          <div className="qr-divider" aria-hidden="true"><span>or enter code manually</span></div>

          <form
            className="qr-manual"
            onSubmit={(event) => { event.preventDefault(); if (manualToken.trim()) void resolveToken(manualToken.trim()); }}
          >
            <label htmlFor="qr-manual-input">QR / Check-in code</label>
            <div className="qr-manual-row">
              <input
                id="qr-manual-input"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Paste or type the code"
                maxLength={200}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-accent qr-check" disabled={!manualToken.trim() || resolving}>
                {resolving ? "Checking…" : "Check code"}
              </button>
            </div>
          </form>
        </section>
      )}

      {outcome && (
        <section className={`qr-outcome ${authorized ? "authorized" : "rejected"}`} aria-live="polite">
          <div className="qr-outcome-head">
            {authorized ? <ShieldCheck size={28} aria-hidden /> : <RefreshCw size={28} aria-hidden />}
            <h3>{authorized ? "Code verified" : "Code not accepted"}</h3>
          </div>
          <p>{outcome.message}</p>

          {authorized && outcome.reservation && (
            <dl className="qr-detail">
              <div><dt>Guest</dt><dd>{outcome.reservation.guestName ?? "You"}</dd></div>
              <div><dt>Confirmation</dt><dd>{outcome.reservation.confirmationNumber ?? outcome.reservation.id}</dd></div>
              <div><dt>Stay</dt><dd>{outcome.reservation.checkIn} → {outcome.reservation.checkOut}</dd></div>
              <div><dt>Room type</dt><dd>{outcome.reservation.roomType}</dd></div>
              {outcome.reservation.roomNumber && <div><dt>Room</dt><dd>{outcome.reservation.roomNumber}</dd></div>}
              {outcome.reservation.paymentStatus && <div><dt>Payment</dt><dd>{outcome.reservation.paymentStatus.replace("_", " ")}</dd></div>}
            </dl>
          )}
          {authorized && outcome.room && (
            <dl className="qr-detail">
              <div><dt>Room</dt><dd>{outcome.room.number}{outcome.room.floor !== undefined ? ` · Floor ${outcome.room.floor}` : ""}</dd></div>
              {outcome.room.type && <div><dt>Type</dt><dd>{outcome.room.type}</dd></div>}
              {outcome.room.status && <div><dt>Status</dt><dd>{outcome.room.status}</dd></div>}
              {outcome.room.housekeeping && <div><dt>Housekeeping</dt><dd>{outcome.room.housekeeping}</dd></div>}
              {outcome.openTasks !== undefined && <div><dt>Open tasks</dt><dd>{outcome.openTasks}</dd></div>}
              {outcome.openOrders !== undefined && <div><dt>Open work orders</dt><dd>{outcome.openOrders}</dd></div>}
              {outcome.currentStay && <div><dt>Current guest</dt><dd>{outcome.currentStay.guestName} ({outcome.currentStay.checkIn} → {outcome.currentStay.checkOut})</dd></div>}
            </dl>
          )}

          <div className="qr-outcome-actions">
            <button type="button" className="btn btn-soft" onClick={reset}>Scan another code</button>
            {ctaLabel && <button type="button" className="btn btn-accent" onClick={() => onCta(outcome.action!, outcome.reservation?.id)}>{ctaLabel}</button>}
          </div>
        </section>
      )}
    </Modal>
  );
}
