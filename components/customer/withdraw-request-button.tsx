"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function WithdrawRequestButton({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function withdraw() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/requests/${id}/withdraw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to withdraw. Try again.");
      router.refresh(); setConfirming(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to withdraw. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="btn-row">
    {!confirming ? <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>Withdraw request</button> : <>
      <span>Withdraw this item?</span>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void withdraw()}>{busy ? "Withdrawing…" : "Confirm withdrawal"}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep request</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
