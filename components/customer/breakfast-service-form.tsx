"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import jsQR from "jsqr";
import { breakfastPassCode } from "@/lib/breakfast";

type Result = { status: string; serviceDate?: string; roomNumber?: string; remaining?: number; allowance?: number; used?: number };
const messages: Record<string, string> = {
  invalid: "Breakfast pass not found. Check the code and try again.",
  outside_service: "The pass is outside its scheduled breakfast hours.",
  ineligible: "This booking is no longer eligible for breakfast service.",
  used: "All breakfasts for this date have already been recorded.",
  insufficient: "Fewer meals remain. Check the pass again before recording.",
  conflict: "This request already has a different result. Check the pass again.",
  forbidden: "Front Desk or Manager access is required.",
};

export function BreakfastServiceForm() {
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ passCode: string; quantity: number; requestId: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);

  async function send(action: "verify" | "redeem", passCode = code.trim()) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    if (action === "redeem") pending.current ??= { passCode, quantity, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/staff/breakfast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "verify" ? { action, passCode } : { action, ...pending.current }) });
      if (response.status >= 500) throw new Error("Unavailable");
      const data: Result = await response.json();
      setResult(data);
      if (data.status === "valid") setQuantity(1);
      pending.current = null;
      setUncertain(false);
    } catch {
      setUncertain(action === "redeem");
      if (action === "verify") setResult({ status: "unavailable" });
    } finally { sending.current = false; setBusy(false); }
  }

  async function readImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || sending.current || uncertain) return;
    setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Image too large");
      const image = await createImageBitmap(file);
      let decoded: string | undefined;
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image reader unavailable");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        decoded = jsQR(pixels.data, pixels.width, pixels.height)?.data;
      } finally { image.close(); }
      if (!decoded || !breakfastPassCode.safeParse(decoded).success) throw new Error("No breakfast QR");
      setCode(decoded);
      await send("verify", decoded);
    } catch { setResult({ status: "image_invalid" }); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent, action: "verify" | "redeem") {
    event.preventDefault();
    void send(action);
  }

  return <>
    <form onSubmit={event => submit(event, "verify")}>
      <label htmlFor="breakfast-code">Breakfast pass code</label>
      <input id="breakfast-code" value={code} onChange={event => { setCode(event.target.value); setResult(null); }} maxLength={80} required disabled={busy || uncertain} autoComplete="off" spellCheck={false} />
      <button className="btn btn-accent" disabled={busy || uncertain}>Check pass</button>
      <label htmlFor="breakfast-scan-image">Or read a saved pass image</label>
      <input className="breakfast-scan-image" id="breakfast-scan-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void readImage(event)} disabled={busy || uncertain} />
    </form>
    <div role="status">
      {result?.status === "valid" && <p>{result.roomNumber ? `Room ${result.roomNumber} · ` : ""}{result.serviceDate} · {result.remaining} of {result.allowance} meals available.</p>}
      {result?.status === "recorded" && <p>Service recorded. Check the pass again for its current remaining allowance.</p>}
      {result && messages[result.status] && <p>{messages[result.status]}</p>}
      {result?.status === "unavailable" && <p>Could not verify the pass. Try again.</p>}
      {result?.status === "image_invalid" && <p>Could not read a breakfast QR from this image. Try the original PNG or enter the pass code.</p>}
      {uncertain && <p>Could not confirm the outcome. Retry the same request to avoid recording it twice.</p>}
    </div>
    {result?.status === "valid" && <form onSubmit={event => submit(event, "redeem")}>
      <label htmlFor="breakfast-quantity">Guests served</label>
      <input id="breakfast-quantity" type="number" value={quantity} onChange={event => setQuantity(Number(event.target.value))} min={1} max={result.remaining} required disabled={busy || uncertain} />
      <button className="btn btn-accent" disabled={busy}>{uncertain ? "Retry recording" : "Record meals served"}</button>
    </form>}
  </>;
}
