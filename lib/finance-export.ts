import { z } from "zod";
import { assembleA4Pdf, MARGIN, pdfRule, pdfText } from "@/lib/pdf-page";
import { writeCloseWorkbook } from "@/lib/finance-export-workbook";

export type FinanceExportFormat = "csv" | "xlsx" | "pdf" | "json";

const money = z.number().transform(value => Math.round(value * 100)).pipe(z.number().int().safe());
const closedSnapshot = z.object({
  date: z.string().date(),
  roomAccrual: money,
  assessedCharges: money,
  adjustments: money,
  received: money,
  refunds: money,
  netReceipts: money,
  outstanding: money,
});

export function buildFinanceCloseExport(close: { business_date: string; closed_at: string; snapshot: unknown }) {
  const snapshot = closedSnapshot.parse(close.snapshot);
  if (snapshot.date !== close.business_date || snapshot.received - snapshot.refunds !== snapshot.netReceipts) {
    throw new Error("Closed-day totals are inconsistent.");
  }
  const date = snapshot.date;
  return {
    id: `HAVEN-CLOSE-${date}-V1`,
    date,
    closedAt: new Date(close.closed_at).toISOString(),
    status: "For Finance review",
    currency: "PHP",
    lines: [
      { code: "room_accrual", label: "Booked room accrual", minor: snapshot.roomAccrual },
      { code: "assessed_charges", label: "Assessed folio charges", minor: snapshot.assessedCharges },
      { code: "signed_adjustments", label: "Signed adjustments", minor: snapshot.adjustments },
      { code: "gross_collections", label: "Gross collections", minor: snapshot.received },
      { code: "refunds_paid", label: "Refunds paid", minor: snapshot.refunds },
      { code: "net_collections", label: "Net collections", minor: snapshot.netReceipts },
      { code: "outstanding_at_close", label: "Outstanding at close", minor: snapshot.outstanding },
    ],
  };
}

export type FinanceCloseExport = ReturnType<typeof buildFinanceCloseExport>;

export const financeExportContentType: Record<FinanceExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  json: "application/json; charset=utf-8",
};

export function renderFinanceCloseExport(batch: FinanceCloseExport, format: FinanceExportFormat): Uint8Array<ArrayBuffer> {
  if (format === "xlsx") return writeCloseWorkbook(batch);
  if (format === "pdf") return renderPdf(batch);
  if (format === "json") {
    const reviewBatch = {
      schemaVersion: 1,
      property: "HAVEN",
      batchId: batch.id,
      businessDate: batch.date,
      closedAtUtc: batch.closedAt,
      currency: batch.currency,
      status: "review_pending",
      measures: batch.lines.map(line => ({ id: `${batch.id}:${line.code}`, code: line.code, amountMinor: line.minor })),
    };
    return new TextEncoder().encode(`${JSON.stringify(reviewBatch, null, 2)}\n`);
  }
  const columns = ["batch_id", "property", "business_date", "closed_at_utc", "status", "measure", "currency", "amount_minor"];
  // These fields are controlled identifiers, ISO dates, fixed labels and integer centavos.
  const lines = batch.lines.map(line => [
    batch.id, "HAVEN", batch.date, batch.closedAt, batch.status, line.code, batch.currency, line.minor,
  ].join(","));
  return new Uint8Array(new TextEncoder().encode([columns.join(","), ...lines, ""].join("\r\n")));
}

function renderPdf(batch: FinanceCloseExport) {
  const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ops = [
    pdfText("F2", 10, MARGIN, 780, "HAVEN HOTEL & RESIDENCES", 0.25),
    pdfText("F2", 24, MARGIN, 738, "Closed-day finance summary", 0.06),
    pdfText("F1", 11, MARGIN, 711, `${batch.date}   /   ${batch.status}`, 0.32),
    pdfRule(690),
    pdfText("F1", 10, MARGIN, 664, `Batch   ${batch.id}`, 0.23),
    pdfText("F1", 10, MARGIN, 644, `Closed at (UTC)   ${batch.closedAt}`, 0.23),
    pdfText("F2", 10, MARGIN, 600, "CLOSED-DAY TOTALS", 0.28),
    pdfText("F2", 10, 392, 600, "AMOUNT (PHP)", 0.28),
    pdfRule(586),
  ];
  batch.lines.forEach((line, index) => {
    const y = 560 - index * 37;
    const font = line.code === "net_collections" ? "F2" : "F1";
    ops.push(pdfText(font, 11, MARGIN, y, line.label, 0.13));
    ops.push(pdfText(font, 11, 392, y, currency.format(line.minor / 100), 0.13));
    ops.push(pdfRule(y - 13));
  });
  ops.push(
    pdfText("F1", 9, MARGIN, 283, "Totals come from the saved night audit. Net collections deduct refunds.", 0.35),
    pdfText("F1", 9, MARGIN, 267, "Finance review is pending. This summary carries no journal posting.", 0.35),
  );
  return assembleA4Pdf(ops.join("\n"));
}
