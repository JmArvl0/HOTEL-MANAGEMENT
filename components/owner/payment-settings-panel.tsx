"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, QrCode } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { PageHeader } from "@/components/ui/Navigation";
import { OwnerEmpty, OwnerSectionHead, OwnerTablePanel, formatOwnerDate } from "@/components/owner/owner-primitives";
import { GCASH_QR_PATH_RE, normalizeGcashNumber } from "@/lib/payment-destination";

type DepositMethod = "paymongo" | "manual" | "off";
type Destination = { accountName: string | null; mobileNumber: string | null; qrStoragePath: string | null; enabled: boolean; depositMethod: DepositMethod; version: number };
type TrailEntry = { id: number; created_at: string; actorName: string; action: string; after_data?: { accountName?: unknown; mobileNumber?: unknown; qrConfigured?: unknown; enabled?: unknown; reason?: unknown } | null };
type Payload = { destination: Destination; qrDataUrl: string | null; qrHealthy: boolean; lastUpdated: string | null; lastUpdatedBy: string | null; trail: TrailEntry[] };

const EMPTY: Destination = { accountName: null, mobileNumber: null, qrStoragePath: null, enabled: false, depositMethod: "manual", version: 1 };

// The method radio is the single control: path + on/off. The toggle is gone;
// "off" means deposits stop and the destination save re-syncs gcash_enabled.
const METHOD_OPTIONS: [DepositMethod, string, string][] = [
  ["paymongo", "PayMongo instant auto-pay", "Provider-hosted GCash checkout, confirmed automatically."],
  ["manual", "Manual GCash verification", "Guest transfers, then staff verify the receipt."],
  ["off", "Deposits off", "Guests see a temporarily-unavailable notice."],
];

export default function PaymentSettingsPanel({ notify }: { notify: (message: string) => void }) {
  const dialogs = useActionDialogs();
  const [loaded, setLoaded] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [depositMethod, setDepositMethod] = useState<DepositMethod>("manual");
  const enabled = depositMethod !== "off";
  const [qrPath, setQrPath] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
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
      setDepositMethod(dest.depositMethod === "paymongo" || dest.depositMethod === "off" ? dest.depositMethod : "manual");
      setQrPath(dest.qrStoragePath);
      setQrPreview(data.qrDataUrl);
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
    // Destination details are only required on the manual path — instant
    // checkout never shows them, so PayMongo mode saves without them.
    if (enabled && depositMethod === "manual") {
      if (!name.trim()) { setError("Account name is required while manual GCash deposits are enabled."); return; }
      if (!/^09\d{9}$/.test(canonical)) { setError("Enter a valid GCash mobile number (09XXXXXXXXX)."); return; }
      if (!qrPath) { setError("Upload the official GCash QR while manual deposits are enabled."); return; }
    }
    const destReason = await dialogs.askPrompt({
      title: "Confirm payment destination change",
      message: "Changing the payment destination affects where customers send reservation deposits. Confirm that these details are correct.",
      portal: true,
      headerVariant: "branded",
      label: "Reason for change",
      placeholder: "Record the business reason — it is stored in the audit trail…",
      multiline: true,
      required: true,
      validation: (value) => (typeof value === "string" && value.trim().length >= 3 ? null : "Record why this payment destination is changing (3+ characters)."),
      submitText: "Save payment settings",
      cancelText: "Review again",
    });
    if (!destReason) return;
    setSaving(true);
    try {
      const response = await fetch("/api/owner/payment-destination", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: name.trim(), mobileNumber: canonical, qrStoragePath: qrPath, enabled, reason: destReason.trim(), version: loaded?.destination.version ?? 1 }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to save payment settings."); return; }
      notify(enabled ? "GCash payment destination is live for new deposits." : "GCash deposit acceptance is off. Guests see the unavailable notice.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveMethod() {
    setError("");
    const destComplete = Boolean(name.trim()) && /^09\d{9}$/.test(normalizeGcashNumber(mobile)) && Boolean(qrPath);
    const methodReason = await dialogs.askPrompt({
      title: "Switch deposit method",
      portal: true,
      headerVariant: "branded",
      message: depositMethod === "manual" && !destComplete
        ? "Only one deposit method is offered at a time. Pending payments on the previous path still finish honestly. Destination details are incomplete — guests will see “details unavailable” on manual until you complete Step 2."
        : "Only one deposit method is offered at a time. Pending payments on the previous path still finish honestly.",
      label: "Reason for change",
      placeholder: "Record the business reason — it is stored in the audit trail…",
      multiline: true,
      required: true,
      validation: (value) => (typeof value === "string" && value.trim().length >= 3 ? null : "Record why the deposit method is changing (3+ characters)."),
      submitText: "Switch method",
      cancelText: "Review again",
    });
    if (!methodReason) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/deposit-method", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositMethod, reason: methodReason.trim(), version: loaded?.destination.version ?? 1 }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to save the deposit method."); return; }
      notify(`Deposit method switched to ${depositMethod === "paymongo" ? "PayMongo instant auto-pay" : depositMethod === "manual" ? "manual GCash verification" : "off"}.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [justPicked, setJustPicked] = useState<DepositMethod | null>(null);
  function pickMethod(value: DepositMethod) {
    setDepositMethod(value);
    setJustPicked(value);
    window.setTimeout(() => setJustPicked((current) => (current === value ? null : current)), 350);
  }
  const methodLabel = METHOD_OPTIONS.find(([value]) => value === depositMethod)?.[1] ?? depositMethod;
  const paymongoSelected: boolean = depositMethod === "paymongo";

  if (loading || !loaded) return <OwnerEmpty icon={<QrCode size={22} />} title="Loading payment settings…" body="Fetching the authoritative payment destination." />;
  const trailRows = (loaded.trail ?? []).map((entry) => ({ ...entry, id: String(entry.id) }));
  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: "Method" },
    { n: 2, label: "Destination" },
    { n: 3, label: "Review" },
  ];
  return (
    <div className="owner-payment-settings">
      <PageHeader
        variant="default"
        eyebrow="Business configuration"
        title="Payment Settings"
        subtitle="You control where customers send reservation deposits. Changes apply to new deposits immediately and are audited."
        actions={<span className={`badge ${enabled ? "paid" : "expired"}`}>{enabled ? "Active" : "Inactive"}</span>}
      />
      {error && <p className="owner-form-error" role="alert">{error}</p>}
      <OwnerSectionHead
        title="Configuration"
        note={loaded.lastUpdated ? `Last updated ${formatOwnerDate(loaded.lastUpdated)}${loaded.lastUpdatedBy ? ` by ${loaded.lastUpdatedBy}` : ""}` : "No destination changes recorded yet."}
      />
      <ol className="owner-wizard" aria-label="Payment setup progress">
        {steps.map(({ n, label }) => {
          const skipped = depositMethod === "paymongo" && n > 1;
          return (
          <li key={n} className={step === n && !skipped ? "current" : step > n || skipped ? "done" : ""} aria-current={step === n && !skipped ? "step" : undefined}>
            <button type="button" onClick={() => setStep(n)} disabled={skipped} aria-label={skipped ? `${label} — not needed for instant checkout` : `Go to step ${n}: ${label}`}>
              <span className="owner-wizard-dot">{step > n || skipped ? "✓" : n}</span>
              <span>{label}</span>
            </button>
          </li>
          );
        })}
      </ol>
      {depositMethod === "paymongo" && <p className="owner-express-note">Instant checkout needs no destination or review — pick PayMongo, record the reason, activate.</p>}
      <div className="owner-steps" key={`${step}-${depositMethod}`}>
        {(step === 1 || depositMethod === "paymongo") && (
        <section className="data-panel owner-panel owner-step-enter" aria-labelledby="pay-method">
          <div className="panel-heading"><div><h3 id="pay-method">Step 1 — Deposit method</h3><p>The single method offered for new online reservation deposits.</p></div></div>
          <div className="owner-method-grid" role="radiogroup" aria-label="Deposit method">
            {METHOD_OPTIONS.map(([value, label, hint]) => (
              <label key={value} className={`owner-method-card${depositMethod === value ? " active" : ""}${justPicked === value ? " picked" : ""}`}>
                <input type="radio" name="deposit-method" checked={depositMethod === value} onChange={() => pickMethod(value)} />
                <span><strong>{label}</strong><small>{hint}</small></span>
              </label>
            ))}
          </div>
          <div className="form-actions">{depositMethod === "paymongo"
            ? <button type="button" className="btn btn-accent" disabled={saving} onClick={saveMethod}>{saving ? "Activating…" : "Activate PayMongo"}</button>
            : <button type="button" className="btn btn-accent" disabled={saving} onClick={() => setStep(2)}>Continue to destination</button>}</div>
        </section>
        )}
        {step === 2 && depositMethod !== "paymongo" && (
        <section className="data-panel owner-panel owner-step-enter" aria-labelledby="pay-destination">
          <div className="panel-heading"><div><h3 id="pay-destination">Step 2 — Payment destination</h3><p>{paymongoSelected ? "Not needed for instant checkout — only required if you switch back to manual. No PINs, passwords, or secrets belong here." : "Exactly what customers pay into. No PINs, passwords, or secrets belong here."}</p></div></div>
          <div className="owner-dest-grid">
            <div className="owner-dest-fields">
              <label>Account / display name<input type="text" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="HAVEN Hotel & Residences" autoComplete="off" /></label>
              <label>GCash mobile number<input type="tel" value={mobile} maxLength={30} onChange={(event) => setMobile(event.target.value)} placeholder="09XX XXX XXXX" autoComplete="off" inputMode="tel" /></label>
            </div>
            <div className="owner-qr-field">
              <span>Official GCash QR</span>
              {qrPreview
                // eslint-disable-next-line @next/next/no-img-element -- Owner-uploaded QR preview, same rationale as receipt thumbnails
                ? <div className="owner-qr-staged"><img className="owner-qr" src={qrPreview} alt="Official GCash QR preview" /><button type="button" className="btn btn-soft" onClick={() => fileInput.current?.click()}>Replace QR</button></div>
                : <button type="button" className="owner-qr-upload" onClick={() => fileInput.current?.click()}><ImageUp size={18} aria-hidden="true" /><span><strong>Upload official QR</strong><small>JPEG, PNG, or WebP · up to 5 MB</small></span></button>}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="owner-qr-input" onChange={replaceQr} aria-label="Upload the official GCash QR" />
              {!loaded.qrHealthy && <p className="owner-form-error" role="alert">The saved QR image is missing from storage. Upload it again before enabling deposits.</p>}
              <div className="owner-live-preview" aria-live="polite">
                <p><strong>{name.trim() || "—"}</strong></p>
                <p className="owner-record-id">{mobile.trim() || "—"}</p>
                <p className="owner-live-method">{methodLabel} · {enabled ? "Active" : "Inactive"}</p>
              </div>
            </div>
          </div>
          <div className="form-actions"><button type="button" className="btn btn-soft" onClick={() => setStep(1)}>Back</button><button type="button" className="btn btn-accent" onClick={() => setStep(3)}>Review changes</button></div>
        </section>
        )}
        {step === 3 && depositMethod !== "paymongo" && (
        <section className="data-panel owner-panel owner-step-enter" aria-labelledby="pay-review">
          <div className="panel-heading"><div><h3 id="pay-review">Step 3 — Review & save</h3><p>Confirm exactly what guests will see before anything goes live.</p></div></div>
          <dl className="owner-review-list">
            <div><dt>Deposit method</dt><dd>{methodLabel}</dd></div>
            <div><dt>Accepting deposits</dt><dd>{enabled ? "Active" : "Inactive"}</dd></div>
            <div><dt>Account name</dt><dd>{name.trim() || "—"}</dd></div>
            <div><dt>Mobile number</dt><dd className="owner-record-id">{mobile.trim() || "—"}</dd></div>
            <div><dt>QR image</dt><dd>{qrPreview ? "Uploaded — preview updates live as you type." : "Missing"}</dd></div>
            <div><dt>Reason</dt><dd>Recorded in the save confirmation.</dd></div>
          </dl>
          {qrPreview && (
            // eslint-disable-next-line @next/next/no-img-element -- Owner-uploaded QR preview, same rationale as receipt thumbnails
            <img className="owner-qr" src={qrPreview} alt="Final QR preview" />
          )}
          <div className="form-actions"><button type="button" className="btn btn-soft" onClick={() => setStep(2)}>Back</button></div>
        </section>
        )}
      </div>
      <div className="form-actions owner-sticky-saves" aria-label="Save payment configuration">
        <button type="button" className="btn btn-soft" disabled={saving} onClick={saveMethod}>{saving ? "Switching…" : "Switch deposit method"}</button>
        <button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      <OwnerSectionHead title="Governance" note="Every destination and method change is recorded." />
      <OwnerTablePanel
        title="Configuration history"
        noun="changes"
        note="Newest first · Executive source order retained."
        rows={trailRows}
        columns={[
          { key: "created_at", header: "When", render: (row) => formatOwnerDate(row.created_at) },
          { key: "actorName", header: "Changed by", render: (row) => String(row.actorName ?? "—") },
          { key: "mobileNumber", header: "Number", render: (row) => { const v = (row.after_data as { mobileNumber?: unknown } | null)?.mobileNumber; return <span className="owner-record-id">{typeof v === "string" && v ? v : "—"}</span>; } },
          { key: "enabled", header: "Status", render: (row) => <span className={`badge ${(row.after_data as { enabled?: unknown } | null)?.enabled ? "paid" : "expired"}`}>{(row.after_data as { enabled?: unknown } | null)?.enabled ? "Active" : "Inactive"}</span> },
        ]}
        empty={<OwnerEmpty icon={<QrCode size={22} />} title="No destination changes" body="Recorded payment destination changes will appear here." />}
      />
      {dialogs.view}
    </div>
  );
}
