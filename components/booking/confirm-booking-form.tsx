"use client";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, ImageUp, ShieldCheck, Smartphone } from "lucide-react";
import { formatPeso } from "@/lib/format";
import type { DepositPolicy } from "@/lib/booking";
import type { OperationalPolicy } from "@/lib/hotel-policy";
import { DepositPolicyPanel } from "./deposit-policy-panel";

const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
type Staged = { path: string; name: string; size: number };

export function ConfirmBookingForm({ token, deposit, accountName, mobileNumber, qrDataUrl, depositPolicy, cancelPolicy, remainingBalance, checkIn }: { token: string; deposit: number; accountName: string; mobileNumber: string; qrDataUrl: string | null; depositPolicy: DepositPolicy; cancelPolicy: OperationalPolicy; remainingBalance: number; checkIn: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const stagedRef = useRef<Staged | null>(null);

  async function discardStaged() {
    const current = stagedRef.current;
    stagedRef.current = null;
    setStaged(null);
    if (current) void fetch(`/api/booking/holds/${token}/proof`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: current.path }) });
  }

  async function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    if (!file) return;
    if (!PROOF_TYPES.includes(file.type)) { setError("Upload your payment screenshot as a JPEG, PNG, or WebP image."); event.target.value = ""; return; }
    if (file.size > PROOF_MAX_BYTES) { setError("Payment proof must be 5 MB or smaller."); event.target.value = ""; return; }
    await discardStaged();
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/booking/holds/${token}/proof`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Upload failed. Please try again."); event.target.value = ""; return; }
      const next = { path: body.path as string, name: body.originalName as string || file.name, size: Number(body.size) || file.size };
      stagedRef.current = next;
      setStaged(next);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function copyNumber() {
    setError("");
    try {
      await navigator.clipboard.writeText(mobileNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copy failed — long-press the number to copy it manually.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading || !staged) return;
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const proofPath = staged.path;
    const proofName = staged.name;
    const response = await fetch(`/api/booking/holds/${token}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: "manual_gcash", paymentReference: form.get("paymentReference"), proofPath, proofOriginalName: proofName })
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? "We could not submit the reservation deposit.");
      // A failed confirm releases the staged upload — the guest picks a new file for the retry.
      if (body.error?.includes("hold expired") || body.error?.includes("no longer available") || body.error?.includes("rate changed")) discardStaged();
      return;
    }
    router.push(`/booking/confirmation/${body.reservationId}`);
    router.refresh();
  }

  const formatMb = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return <form className="booking-form-card deposit-form" onSubmit={submit}>
    <section className="gcash-destination" aria-labelledby="gcash-heading">
      <h2 id="gcash-heading"><Smartphone size={16} aria-hidden="true" /> Pay via GCash</h2>
      <p className="deposit-due-line">Deposit due <strong>{formatPeso(deposit)}</strong></p>
      {qrDataUrl
        ? /* eslint-disable-next-line @next/next/no-img-element -- Owner-configured QR bytes served inline by the page */
          <img src={qrDataUrl} alt={`Official GCash QR for ${accountName}`} className="gcash-qr" width={240} height={240} />
        : <p className="booking-error" role="alert">The official QR is unavailable right now. Please try again shortly.</p>}
      <dl className="gcash-details">
        <div><dt>Account name</dt><dd>{accountName}</dd></div>
        <div><dt>GCash number</dt><dd>{mobileNumber} <button type="button" className="btn btn-soft btn-sm" onClick={copyNumber} aria-live="polite">{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></dd></div>
        <div><dt>Amount to send</dt><dd>{formatPeso(deposit)}</dd></div>
      </dl>
    </section>
    <section aria-labelledby="gcash-how">
      <h3 id="gcash-how">How to pay</h3>
      <ol className="gcash-steps">
        <li>Open GCash.</li>
        <li>Scan the QR or send payment to the GCash number shown.</li>
        <li>Send the exact reservation deposit amount.</li>
        <li>Copy your GCash transaction/reference number.</li>
        <li>Save the successful payment receipt.</li>
        <li>Enter the reference below.</li>
        <li>Upload the receipt.</li>
        <li>Submit for verification.</li>
      </ol>
    </section>
    <DepositPolicyPanel depositPolicy={depositPolicy} cancelPolicy={cancelPolicy} depositRequired={deposit} remainingBalance={remainingBalance} checkIn={checkIn} />
    <label className="deposit-reference">GCash reference number<input name="paymentReference" required minLength={4} maxLength={120} autoComplete="off" placeholder="Enter your GCash reference" /></label>
    <div className="proof-field">
      <span className="proof-label">GCash payment receipt</span>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only-proofs" onChange={pickFile} aria-label="Upload your GCash payment receipt" />
      {staged
        ? <div className="proof-staged">
            <div className="proof-file-info"><strong>{staged.name || "Payment receipt"}</strong><small>{formatMb(staged.size)} · uploaded</small></div>
            <button type="button" className="btn btn-soft" onClick={() => { void discardStaged(); if (fileInput.current) fileInput.current.value = ""; }}>Replace</button>
            <button type="button" className="btn btn-soft" onClick={() => { void discardStaged(); if (fileInput.current) fileInput.current.value = ""; }}>Remove</button>
          </div>
        : <button type="button" className="proof-upload" onClick={() => fileInput.current?.click()} disabled={uploading}>
            <ImageUp size={18} aria-hidden="true" />
            <span><strong>{uploading ? "Uploading…" : "Upload your payment receipt"}</strong><small>Required for verification · JPEG, PNG, or WebP · up to 5 MB</small></span>
          </button>}
    </div>
    <p className="deposit-verification-note">Haven does not currently have an automated payment gateway. Submitting your reference and receipt creates a pending payment for staff verification; it does not mark the deposit as paid.</p>
    {error && <p className="booking-error" role="alert">{error}</p>}
    <button className="btn btn-accent" disabled={loading || uploading || !staged || !qrDataUrl}><ShieldCheck size={17} />{loading ? "Submitting…" : uploading ? "Uploading proof…" : `Submit ${formatPeso(deposit)} Deposit for Verification`}</button>
  </form>;
}
