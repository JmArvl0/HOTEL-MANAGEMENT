"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { useId } from "react";
import { DownloadMenu } from "@/components/ui/download-menu";
import type { FinanceExportFormat } from "@/lib/finance-export";
import { formatHotelDateTime } from "@/lib/format";
import type { NightAudit } from "@/lib/hotel-operations";
import { saveBlob } from "@/lib/receipt-image";

const formats = [
  { value: "csv", label: "CSV file" },
  { value: "xlsx", label: "Excel workbook" },
  { value: "pdf", label: "PDF summary" },
] satisfies { value: FinanceExportFormat; label: string }[];
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function CloseDownload({ date }: { date: string }) {
  async function download(format: FinanceExportFormat) {
    const params = new URLSearchParams({ date, format });
    const response = await fetchPublic(`/api/accounting/exports?${params}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await readResponse(response).catch(() => null);
      throw new Error(body?.error || "The file could not be prepared. Select a format to retry.");
    }
    const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
    saveBlob(await response.blob(), filename ?? `HAVEN-close-${date}.${format}`);
  }
  return <DownloadMenu className="finance-close-download" label={`Download closed day ${date}`} actions={formats.map(format => ({
    ...format, run: () => download(format.value), successMessage: `${format.label} download started.`,
  }))} />;
}

export default function FinanceCloseHistory({ closes }: { closes: NightAudit["recentCloses"] }) {
  const heading = useId();
  return (
    <section className="finance-close-history" aria-labelledby={heading}>
      <header className="finance-close-header">
        <h3 id={heading}>Closed days</h3>
        <p>Download saved night-audit totals for Finance review.</p>
      </header>
      {closes.length === 0 ? (
        <p className="finance-close-empty">A completed night audit will appear here with its download options.</p>
      ) : (
        <ul className="finance-close-list">
          {closes.map(close => (
            <li key={close.business_date}>
              <div className="finance-close-date">
                <time dateTime={close.business_date}>{close.business_date}</time>
                <span>Closed {formatHotelDateTime(close.closed_at)}</span>
              </div>
              <dl className="finance-close-totals">
                <div><dt>Room accrual</dt><dd>{close.snapshot.roomAccrual === null ? "Unavailable" : peso.format(close.snapshot.roomAccrual)}</dd></div>
                <div><dt>Collections</dt><dd>{peso.format(close.snapshot.received)}</dd></div>
                <div><dt>Refunds</dt><dd>{peso.format(close.snapshot.refunds)}</dd></div>
              </dl>
              <CloseDownload date={close.business_date} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
