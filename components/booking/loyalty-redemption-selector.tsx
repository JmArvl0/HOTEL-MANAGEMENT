"use client";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/format";
import { POINTS_TO_PESO } from "@/lib/loyalty";

// Points-for-folio redemption inside the reservation folio panel. The rate is
// POINTS_TO_PESO (PHP 1 per point). Server RPC owns balance checks and
// idempotency; this only collects the amount and confirms.
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
  // The RPC credits least(points, invoice total) but debits every point sent,
  // so the cap must never exceed the folio balance — otherwise points burn for
  // credit the guest never receives.
  const max = Math.min(points, Math.floor(folioBalance));
  const applied = Math.min(Math.max(0, amount), max);
  const count = (value: number) => value.toLocaleString("en-PH");
  async function redeem() {
    if (applied <= 0) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/account/loyalty/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, points: applied, idempotencyKey: crypto.randomUUID() })
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setMessage(body.error ?? "Unable to redeem points."); return; }
    window.location.reload();
  }
  return (
    <section className="loyalty-redeem" aria-labelledby="loyalty-redeem-heading">
      <header className="loyalty-redeem-head">
        <span className="loyalty-redeem-icon" aria-hidden="true"><Coins size={18} /></span>
        <div>
          <h3 id="loyalty-redeem-heading">Redeem rewards points</h3>
          <p>1 point = {formatPeso(POINTS_TO_PESO)} off this folio.</p>
        </div>
      </header>

      <div className="loyalty-redeem-figures">
        <span className="loyalty-redeem-figure">
          <small>Available</small>
          <strong>{count(points)} pts</strong>
        </span>
        <span className="loyalty-redeem-figure">
          <small>Max for this folio</small>
          <strong>{count(max)} pts</strong>
        </span>
      </div>

      <div className="loyalty-redeem-control">
        <div className="loyalty-redeem-control-head">
          <label htmlFor="loyalty-redeem-amount">Points to apply</label>
          <button type="button" className="loyalty-redeem-max" disabled={applied >= max} onClick={() => setAmount(max)}>
            Use max
          </button>
        </div>
        <input id="loyalty-redeem-amount" className="loyalty-redeem-range" type="range" min={0} max={max} step={1}
          value={applied} onChange={(e) => setAmount(Number(e.target.value))} aria-valuetext={`${applied} points`} />
        <div className="loyalty-redeem-row">
          <div className="loyalty-redeem-amount-field">
            <label className="sr-only" htmlFor="loyalty-redeem-points">Points to apply — exact amount</label>
            <input id="loyalty-redeem-points" type="number" min={0} max={max} value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.min(max, Number(e.target.value))))} />
            <span aria-hidden="true">pts</span>
          </div>
          <button type="button" className="btn btn-accent" disabled={busy || applied <= 0} onClick={redeem}>
            {busy ? "Applying…" : `Apply ${count(applied)} pts`}
          </button>
        </div>
        <p className="loyalty-redeem-credit" aria-live="polite">
          {applied > 0
            ? <>Removes <strong>{formatPeso(applied * POINTS_TO_PESO)}</strong> from your balance.</>
            : "Move the slider or type an amount to see the credit."}
        </p>
      </div>

      {message && <p className="loyalty-redeem-error" role="alert">{message}</p>}
    </section>
  );
}
