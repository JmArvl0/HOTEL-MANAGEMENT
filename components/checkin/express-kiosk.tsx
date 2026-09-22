"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Success {
  reservationId: string;
  roomNumber: string;
  roomFloor: string;
  digitalKey: string;
}

/**
 * Express self-check-in kiosk: camera scan (jsQR) + manual code fallback.
 * The QR is a lookup key only — eligibility is enforced server-side, and any
 * failure shows a friendly Front-Desk routing card, never a raw error.
 */
export function ExpressKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const busyRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const checkIn = useCallback(async (token: string) => {
    if (busyRef.current || !token.trim()) return;
    busyRef.current = true;
    setWorking(true);
    setFailure(null);
    try {
      const response = await fetch("/api/qr/express-checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qrToken: token.trim() }),
      });
      const payload = (await response.json()) as { data?: Success; error?: string };
      if (!response.ok) {
        setFailure(payload.error ?? "Self check-in is unavailable. Please see the Front Desk.");
        return;
      }
      if (payload.data) setSuccess(payload.data);
    } catch {
      setFailure("Self check-in is unavailable. Please see the Front Desk.");
    } finally {
      setWorking(false);
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not available on this device. Enter your code below.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }
        const tick = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !success) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const found = jsQR(
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                canvas.width,
                canvas.height
              );
              if (found?.data) void checkIn(found.data);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setCameraError("Camera access was blocked. Enter your code below.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [checkIn, success]);

  if (success) {
    return (
      <section aria-label="Check-in complete" className="kiosk-card kiosk-success">
        <p className="eyebrow">Welcome to Haven</p>
        <h1>Check-in complete.</h1>
        <dl>
          <div><dt>Room</dt><dd>{success.roomNumber}</dd></div>
          <div><dt>Floor</dt><dd>{success.roomFloor}</dd></div>
        </dl>
        <p className="kiosk-key">Digital key: <code>{success.digitalKey}</code></p>
        <p>Show this screen if staff ask. Enjoy your stay.</p>
        <button type="button" onClick={() => setSuccess(null)}>Check in another stay</button>
      </section>
    );
  }

  return (
    <section aria-label="Express check-in" className="kiosk-card">
      <p className="eyebrow">Express check-in</p>
      <h1>Scan your stay QR.</h1>
      {working && (
        <div className="kiosk-skeleton" aria-label="Verifying your stay">
          <span className="pulse-bar" /><span className="pulse-bar short" />
        </div>
      )}
      {!cameraError ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted aria-label="QR camera" className="kiosk-video" />
          <canvas ref={canvasRef} hidden />
        </>
      ) : (
        <p role="note">{cameraError}</p>
      )}
      {failure && (
        <div role="alert" className="kiosk-failure">
          <p>{failure}</p>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void checkIn(manual);
        }}
        className="kiosk-manual"
      >
        <label htmlFor="kiosk-code">Or enter your QR code manually</label>
        <input
          id="kiosk-code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoComplete="off"
          inputMode="text"
        />
        <button type="submit" disabled={working || !manual.trim()}>
          {working ? "Verifying…" : "Check in"}
        </button>
      </form>
    </section>
  );
}
