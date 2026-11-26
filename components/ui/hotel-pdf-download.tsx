"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { userMessage } from "@/lib/errors";
import { saveBlob } from "@/lib/receipt-image";

type DocumentKind = "booking-confirmation" | "checkout-folio" | "cash-shift-close" | "daily-operations-report";

export async function downloadHotelPdf(kind: DocumentKind, id: string) {
  const response = await fetchPublic(`/api/documents/${kind}/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) {
    const body = await readResponse(response).catch(() => null);
    throw new Error(body?.error ?? "Unable to download the PDF. Try again.");
  }
  if (!response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("Sign in again to download the PDF.");
  const filename = response.headers.get("content-disposition")?.match(/filename="([a-z0-9_.-]+)"/i)?.[1];
  saveBlob(await response.blob(), filename ?? `haven-${kind}.pdf`);
}

export function HotelPdfDownload({ kind, id, label, className = "btn btn-soft" }: {
  kind: DocumentKind; id: string; label: string; className?: string;
}) {
  const downloading = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (downloading.current) return;
    downloading.current = true;
    setBusy(true);
    setError("");
    try { await downloadHotelPdf(kind, id); }
    catch (cause) { setError(userMessage(cause, "Unable to download the PDF. Try again.")); }
    finally { downloading.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className={className} disabled={busy} onClick={() => void download()}>
      <Download size={15} aria-hidden="true" /> {busy ? "Preparing PDF…" : label}
    </button>
    {error && <span role="alert">{error}</span>}
  </>;
}
