"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { useId, useState } from "react";
import type { DepositMethod } from "@/lib/online-checkout";
import "./deposit-method-switch.css";

const DEPOSIT_OPTIONS: [DepositMethod, string, string][] = [
  ["xendit", "Xendit sandbox", "Hosted GCash or Maya test payments. No real money."],
  ["off", "Off", "Guests see a temporarily-unavailable notice."],
];

export function DepositMethodSwitch({
  current,
  version,
  xenditOn,
  notify,
  onRefresh,
}: {
  current: DepositMethod;
  version: number;
  xenditOn?: boolean;
  notify?: (message: string, tone?: "info" | "success" | "warning" | "error") => void;
  onRefresh?: () => void;
}) {
  const [method, setMethod] = useState<DepositMethod>(current);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const methodGroup = useId();
  async function save() {
    setError("");
    if (reason.trim().length < 3) { setError("Record why the deposit method is changing (3+ characters)."); return; }
    setSaving(true);
    try {
      const response = await fetchPublic("/api/admin/deposit-method", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositMethod: method, reason: reason.trim(), version }),
      });
      const body = await readResponse(response).catch(() => null);
      if (!response.ok) { setError((body as { error?: string } | null)?.error ?? "Unable to switch the deposit method."); return; }
      notify?.(`Deposit method switched to ${method === "xendit" ? "Xendit sandbox" : "off"}.`);
      setReason("");
      onRefresh?.();
    } catch {
      setError("Unable to switch the deposit method. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="deposit-method-switch">
      <dt>Online checkout</dt>
      <dd>
        <div className="deposit-method-options" role="radiogroup" aria-label="Deposit method">
          {DEPOSIT_OPTIONS.map(([value, optionLabel, hint]) => (
            <label key={value}>
              <input type="radio" name={methodGroup} checked={method === value} disabled={saving} onChange={() => setMethod(value)} />
              <span><strong>{optionLabel}</strong><small>{hint}</small></span>
            </label>
          ))}
        </div>
        {method === "xendit" && !xenditOn && <p className="deposit-method-error" role="alert">Xendit sandbox needs a test secret, webhook token and HTTPS app origin. Guests cannot pay until all three are configured.</p>}
        <label className="deposit-method-reason">
          Reason for change
          <textarea value={reason} rows={2} maxLength={500} disabled={saving} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p className="deposit-method-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-soft" disabled={saving || method === current} onClick={save}>{saving ? "Switching…" : "Switch deposit method"}</button>
      </dd>
    </div>
  );
}
