"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { ArrowRight, CameraOff, CircleCheck, ScanLine } from "lucide-react";

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
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [manual, setManual] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<{ message: string; signIn?: boolean } | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const checkIn = useCallback(async (token: string) => {
    if (busyRef.current || !token.trim()) return;
    busyRef.current = true;
    setWorking(true);
    setFailure(null);
    try {
      const response = await fetchPublic("/api/qr/express-checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qrToken: token.trim() }),
      });
      const payload = (await readResponse(response)) as { data?: Success; error?: string };
      if (!response.ok) {
        setFailure({
          message: payload.error ?? "Self check-in is unavailable. Please see the Front Desk.",
          signIn: response.status === 401,
        });
        return;
      }
      if (payload.data) {
        setCameraReady(false);
        setSuccess(payload.data);
      } else {
        setFailure({ message: "We couldn’t verify this stay. Please ask the Front Desk for help." });
      }
    } catch {
      setFailure({ message: "Self check-in is unavailable. Please see the Front Desk." });
    } finally {
      setWorking(false);
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (success) return;
    let cancelled = false;
    let lastScannedCode = "";
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
          await videoRef.current.play();
        }
        if (cancelled) return;
        setCameraReady(true);
        const tick = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !busyRef.current) {
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
              if (found?.data && found.data !== lastScannedCode) {
                lastScannedCode = found.data;
                void checkIn(found.data);
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setCameraError("Camera unavailable. Allow camera access to scan, or use your check-in code below.");
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraAttempt, checkIn, success]);

  function restartCamera() {
    setCameraError(null);
    setCameraReady(false);
    setCameraAttempt(attempt => attempt + 1);
  }

  if (success) {
    return (
      <section aria-label="Check-in complete" className="kiosk-card kiosk-success">
        <CircleCheck size={30} aria-hidden="true" />
        <h1>Check-in complete.</h1>
        <dl>
          <div><dt>Room</dt><dd>{success.roomNumber}</dd></div>
          <div><dt>Floor</dt><dd>{success.roomFloor}</dd></div>
        </dl>
        <p className="kiosk-key">Digital key: <code>{success.digitalKey}</code></p>
        <p>Show this screen if staff ask. Enjoy your stay.</p>
        <button type="button" className="kiosk-button" onClick={() => {
          setManual("");
          setCameraError(null);
          setSuccess(null);
        }}>Check in another stay</button>
      </section>
    );
  }

  return (
    <section aria-label="Express check-in" className="kiosk-card">
      <h1>Express check-in</h1>
      <p>Use the QR on your Haven Express Pass.</p>
      <div className="kiosk-camera-panel">
        <video ref={videoRef} playsInline muted aria-label="QR camera" className="kiosk-video" hidden={!cameraReady} />
        <canvas ref={canvasRef} hidden />
        {cameraReady ? <p><ScanLine size={17} aria-hidden="true" /> Hold your QR in view.</p>
          : <p role="status">{cameraError
            ? <CameraOff size={19} aria-hidden="true" /> : <ScanLine size={19} aria-hidden="true" />}
            {cameraError ?? "Opening camera…"}
          </p>}
        {(cameraError || (cameraReady && failure)) &&
          <button type="button" className="kiosk-text-button" onClick={restartCamera} disabled={working}>Try camera again</button>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void checkIn(manual);
        }}
        className="kiosk-manual"
        aria-busy={working}
      >
        <label htmlFor="kiosk-code">Enter check-in code</label>
        <p id="kiosk-code-help">Use the code from your QR. If you only have a booking reference, ask Front Desk.</p>
        <input
          id="kiosk-code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          inputMode="text"
          spellCheck={false}
          maxLength={200}
          required
          aria-describedby="kiosk-code-help"
        />
        {failure && <div role="alert" className="kiosk-failure">
          <p>{failure.message}</p>
          {failure.signIn && <Link href="/login?callbackUrl=%2Fcheckin%2Fkiosk">Sign in to Haven</Link>}
        </div>}
        {working && <p role="status" className="kiosk-working">Verifying your stay…</p>}
        <button type="submit" className="kiosk-button" disabled={working || !manual.trim()}>
          {working ? "Verifying…" : "Check in"} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
