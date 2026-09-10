"use client";
import { useEffect, useState } from "react";

/** Read-only payment-proof thumbnail for the paying guest. Fetches a
 *  60-second signed URL (owner/Accounting-only route) each mount; silent
 *  when no proof or the URL can't be minted. */
export function ProofThumbnail({ paymentId, alt }: { paymentId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/booking/payments/${paymentId}/proof`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((body: { url?: string }) => { if (!cancelled && body.url) setUrl(body.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [paymentId]);
  if (!url) return <span className="proof-thumb-name">{alt}</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="proof-thumb" title="View your submitted payment proof">
    {/* eslint-disable-next-line @next/next/no-img-element -- signed 60s URLs can't be pre-optimized and must never hit the Next image cache */}
    <img src={url} alt={`Payment proof — ${alt}`}/>
  </a>;
}
