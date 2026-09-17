"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, QrCode, Smartphone } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { GCASH_QR_PATH_RE, normalizeGcashNumber } from "@/lib/payment-destination";

type Destination = { accountName: string | null; mobileNumber: string | null; qrStoragePath: string | null; enabled: boolean; version: number };
type TrailEntry = { id: number; created_at: string; actorName: string; action: string; after_data?: { accountName?: unknown; mobileNumber?: unknown; qrConfigured?: unknown; enabled?: unknown; reason?: unknown } | null };
type Payload = { destination: Destination; qrDataUrl: string | null; qrHealthy: boolean; lastUpdated: string | null; lastUpdatedBy: string | null; trail: TrailEntry[] };

const EMPTY: Destination = { accountName: null, mobileNumber: null, qrStoragePath: null, enabled: false, version: 1 };

export default function PaymentSettingsPanel({ notify }: { notify: (message: string) => void }) {
  const dialogs = useActionDialogs();
  const [loaded, setLoaded] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [qrPath, setQrPath] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/owner/data?section=payments", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { notify(body.error ?? "Unable to load payment settings."); return; }
      const data = body.data as Payload;
      const dest = data.destination ?? EMPTY;
      setLoaded(data);
      setName(dest.accountName ?? "");
      setMobile(dest.mobileNumber ?? "");
      setEnabled(dest.enabled);
      setQrPath(dest.qrStoragePath);
      setQrPreview(data.qrDataUrl);
      setReason("");
      setError("");
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function replaceQr(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Upload the QR as a JPEG, PNG, or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("QR image must be 5 MB or smaller."); return; }
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/owner/payment-qr", { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "QR upload failed."); return; }
    if (typeof body.path === "string" && GCASH_QR_PATH_RE.test(body.path)) {
      setQrPath(body.path);
      setQrPreview(URL.createObjectURL(file));
    }
  }

  async function save() {
    setError("");
    const canonical = normalizeGcashNumber(mobile);
    if (enabled) {
      if (!name.trim()) { setError("Account name is required while GCash deposits are enabled."); return; }
      if (!/^09\d{9}$/.test(canonical)) { setError("Enter a valid GCash mobile number (09XXXXXXXXX)."); return; }
      if (!qrPath) { setError("Upload the official GCash QR while deposits are enabled."); return; }
    }
    if (reason.trim().length < 3) { setError("Record why this payment destination is changing (3+ characters)."); return; }
    const confirmed = await dialogs.askConfirm({
      title: "Confirm payment destination change",
      message: "Changing the payment destination affects where customers send reservation deposits. Confirm that these details are correct.",
      confirmText: "Save payment settings",
      cancelText: "Review again",
      variant: "danger",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      const response = await fetch("/api/owner/payment-destination", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: name.trim(), mobileNumber: canonical, qrStoragePath: qrPath, enabled, reason: reason.trim(), version: loaded?.destination.version ?? 1 }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to save payment settings."); return; }
      notify(enabled ? "GCash payment destination is live for new deposits." : "GCash deposit acceptance is off. Guests see the unavailable notice.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !loaded) return <div className="empty"><QrCode /><h3>Loading payment settings…</h3></div>;
  return (
    <div>
      <div className="page-title">
        <div>
          <p className="admin-section-context">Business configuration</p>
          <h1>Payment Settings</h1>
          <p>You control where customers send reservation deposits. Changes apply to new deposits immediately and are audited.</p>
        </div>
        <span className={`badge ${enabled ? "paid" : "expired"}`}>{enabled ? "Active" : "Inactive"}</span>
      </div>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <div className="dashboard-grid">
        <section className="data-panel" aria-labelledby="pay-method">
          <div className="panel-heading"><div><h3 id="pay-method">Customer deposit method</h3><p>The single method offered for new online reservation deposits.</p></div></div>
          <p><strong>GCash</strong> — manual transfer verified by Accounting.</p>
          <label className="choice"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Accept GCash deposits</strong><small>While off, guests see a temporarily-unavailable notice and cannot submit.</small></span></label>
        </section>
        <section className="data-panel" aria-labelledby="pay-destination">
          <div className="panel-heading"><div><h3 id="pay-destination">GCash payment destination</h3><p>Exactly what customers pay into. No PINs, passwords, or secrets belong here.</p></div></div>
          <label>Account / display name<input type="text" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="HAVEN Hotel & Residences" autoComplete="off" /></label>
          <label>GCash mobile number<input type="tel" value={mobile} maxLength={30} onChange={(event) => setMobile(event.target.value)} placeholder="09XX XXX XXXX" autoComplete="off" inputMode="tel" /></label>
          <div>
            <span>Official GCash QR</span>
            {qrPreview
              ? <div className="proof-staged">{/* eslint-disable-next-line @next/next/no-img-element -- Owner-uploaded QR preview, same rationale as receipt thumbnails */}<img src={qrPreview} alt="Official GCash QR preview" width={160} style={{ objectFit: "contain" }} /><button type="button" className="btn btn-soft" onClick={() => fileInput.current?.click()}>Replace QR</button></div>
              : <button type="button" className="proof-upload" onClick={() => fileInput.current?.click()}><ImageUp size={18} aria-hidden="true" /><span><strong>Upload official QR</strong><small>JPEG, PNG, or WebP · up to 5 MB</small></span></button>}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only-proofs" onChange={replaceQr} aria-label="Upload the official GCash QR" />
            {!loaded.qrHealthy && <p className="booking-error" role="alert">The saved QR image is missing from storage. Upload it again before enabling deposits.</p>}
          </div>
          <label>Reason for change<textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Record the business reason — it is stored in the audit trail…" /></label>
        </section>
      </div>
      <section className="data-panel" aria-labelledby="pay-preview">
        <div className="panel-heading"><div><h3 id="pay-preview">Customer-facing preview</h3><p>This is what customers will see on the deposit page.</p></div><Smartphone size={18} aria-hidden="true" /></div>
        <p><strong>{name.trim() || "—"}</strong></p>
        <p>{mobile.trim() || "—"}</p>
        {qrPreview
          ? /* eslint-disable-next-line @next/next/no-img-element -- same staged QR preview as above */
            <img src={qrPreview} alt="Customer QR preview" width={220} style={{ objectFit: "contain" }} />
          : <p>No QR configured.</p>}
      </section>
      <div className="form-actions"><button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button></div>
      <section className="data-panel" aria-labelledby="pay-history">
        <div className="panel-heading"><div><h3 id="pay-history">Configuration history</h3><p>{loaded.lastUpdated ? `Last updated ${new Date(loaded.lastUpdated).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}${loaded.lastUpdatedBy ? ` by ${loaded.lastUpdatedBy}` : ""}` : "No destination changes recorded yet."}</p></div></div>
        {loaded.trail.length > 0 && (
          <div className="table-scroll"><table aria-label="Payment destination changes">
            <thead><tr><th>When</th><th>Changed by</th><th>Number</th><th>Status</th></tr></thead>
            <tbody>{loaded.trail.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{entry.actorName}</td>
                <td>{typeof entry.after_data?.mobileNumber === "string" && entry.after_data.mobileNumber ? entry.after_data.mobileNumber : "—"}</td>
                <td>{entry.after_data?.enabled ? "Active" : "Inactive"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {dialogs.view}
    </div>
  );
}
