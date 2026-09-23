"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, CameraOff, RefreshCw, ShieldCheck, Upload } from "lucide-react";

type CameraState = "idle" | "starting" | "on" | { error: "blocked" | "unavailable" | "insecure" };

const SELFIE_MAX_EDGE = 1280;

/** Downscale to a bounded JPEG so uploads stay small without new deps. */
async function compressSelfie(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, SELFIE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) {
    bitmap.close();
    return source;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return source;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ?? source;
}

/**
 * Token-link recovery with a blocking identity selfie. The selfie uploads
 * first (staged server-side); the new password is only submitted with the
 * staged path, and the server refuses the reset without a verified one.
 */
export default function RecoverPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [selfiePath, setSelfiePath] = useState("");
  const [preview, setPreview] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera("idle");
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ error: "insecure" });
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera("on");
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setCamera({ error: name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable" });
    }
  }, []);

  async function uploadBlob(blob: Blob) {
    setUploadBusy(true);
    setError("");
    try {
      const compressed = await compressSelfie(blob);
      const form = new FormData();
      form.append("file", compressed, "selfie.jpg");
      const response = await fetch(`/api/recover/${token}/selfie`, { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Selfie upload failed. Please try again.");
        return;
      }
      setSelfiePath(String(body.path ?? ""));
      setPreview((old) => {
        if (old.startsWith("blob:")) URL.revokeObjectURL(old);
        return URL.createObjectURL(compressed);
      });
      stopCamera();
    } finally {
      setUploadBusy(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError("Camera is not ready yet. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) void uploadBlob(blob);
      else setError("Photo capture failed. Try the file upload instead.");
    }, "image/jpeg", 0.92);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selfiePath) {
      setError("Upload an identity selfie before setting the new password.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/recover/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password"), confirmPassword: form.get("confirmPassword"), selfiePath }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Unable to reset access.");
      return;
    }
    router.push("/login?recovered=1");
  }

  const cameraError = typeof camera === "object" ? camera.error : null;
  const live = camera === "on";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Secure account recovery</p>
        <h1>Choose a new password</h1>
        <p>This one-time link expires after one hour and cannot be reused. A live identity selfie is required first.</p>

        <h2><ShieldCheck size={15} aria-hidden="true" /> Step 1 — Identity selfie</h2>
        {preview ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your staged identity selfie preview" style={{ maxWidth: "100%", borderRadius: 12 }} />
            <p role="status">Selfie staged. <button type="button" className="table-action" onClick={() => { setSelfiePath(""); setPreview(""); }} disabled={busy || uploadBusy}><RefreshCw size={13} aria-hidden="true" /> Retake</button></p>
          </div>
        ) : (
          <div>
            <video ref={videoRef} playsInline muted hidden={!live} style={{ maxWidth: "100%", borderRadius: 12 }} aria-label="Live selfie preview" />
            {live ? (
              <div>
                <p>
                  <button type="button" className="btn btn-accent" onClick={capturePhoto} disabled={uploadBusy}><Camera size={15} aria-hidden="true" /> {uploadBusy ? "Uploading…" : "Capture selfie"}</button>{" "}
                  <button type="button" className="table-action" onClick={stopCamera}>Stop camera</button>
                </p>
              </div>
            ) : (
              <div>
                {camera === "starting" && <p role="status">Starting camera…</p>}
                {cameraError && (
                  <p role="alert">
                    <CameraOff size={15} aria-hidden="true" />{" "}
                    {cameraError === "blocked" ? "Camera access is blocked — allow it in the browser, or upload a photo instead." : "Camera is unavailable on this device — upload a photo instead."}
                  </p>
                )}
                <p>
                  <button type="button" className="btn btn-accent" onClick={startCamera} disabled={camera === "starting" || uploadBusy}><Camera size={15} aria-hidden="true" /> Use camera</button>
                </p>
                <label>Or upload a selfie photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadBlob(file); e.target.value = ""; }} /></label>
                <p><Upload size={13} aria-hidden="true" /> JPEG, PNG, or WebP, 5 MB or smaller. The photo is reviewed by an administrator.</p>
              </div>
            )}
          </div>
        )}

        <h2>Step 2 — New password</h2>
        <form onSubmit={submit}>
          <label>New password<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
          <label>Confirm password<input name="confirmPassword" type="password" minLength={12} required autoComplete="new-password" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-accent" disabled={busy || uploadBusy || !selfiePath}>{busy ? "Securing account…" : "Set password and activate"}</button>
        </form>
        <Link href="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
