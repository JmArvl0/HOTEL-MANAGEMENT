"use client";
import { useEffect, useState } from "react";

// Points-for-folio redemption inside the reservation folio panel. 1 point =
// PHP 1 credit. Server RPC owns balance checks and idempotency; this only
// collects the amount and confirms.
export default function LoyaltyRedemptionSelector({ reservationId, folioBalance }: { reservationId: string; folioBalance: number }) {
  const [points, setPoints] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/account/loyalty", { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => { if (live && ok) setPoints(Number(body.data?.points ?? 0)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (points === null || points <= 0 || folioBalance <= 0) return null;
  const max = Math.min(points, Math.floor(folioBalance));
  async function redeem() {
    if (amount <= 0 || amount > max) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/account/loyalty/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, points: amount, idempotencyKey: crypto.randomUUID() })
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setMessage(body.error ?? "Unable to redeem points."); return; }
    window.location.reload();
  }
  return (
    <div className="loyalty-redeem" aria-label="Redeem rewards points">
      <p><strong>Use {points.toLocaleString("en-PH")} pts?</strong> 1 point = ₱1 off this folio (up to {max.toLocaleString("en-PH")} pts).</p>
      <label htmlFor="loyalty-redeem-amount">Points to apply</label>
      <input id="loyalty-redeem-amount" type="range" min={0} max={max} step={1} value={Math.min(amount, max)}
        onChange={(e) => setAmount(Number(e.target.value))} aria-valuetext={`${amount} points`} />
      <div className="loyalty-redeem-row">
        <input type="number" min={0} max={max} value={amount} onChange={(e) => setAmount(Math.max(0, Math.min(max, Number(e.target.value))))} aria-label="Points to apply" />
        <button type="button" className="btn btn-accent" disabled={busy || amount <= 0} onClick={redeem}>
          {busy ? "Applying…" : `Apply ${amount.toLocaleString("en-PH")} pts`}
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
