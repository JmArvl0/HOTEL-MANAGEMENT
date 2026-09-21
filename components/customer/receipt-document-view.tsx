import { receiptNote, receiptRows, type ReceiptDocument } from "@/lib/receipt";

/**
 * The receipt layout, rendered from the canonical model.
 *
 * Shared deliberately: the preview modal and the printable /account/receipts
 * route both mount this, so there is exactly one receipt layout in the codebase
 * rather than one per entry point.
 *
 * `receiptRows()` supplies the rows, which means the modal, the PNG and the PDF
 * cannot disagree — including about which rows exist.
 */
export function ReceiptDocumentView({ document }: { document: ReceiptDocument }) {
  return (
    <section className="customer-receipt receipt-sheet">
      <p className="eyebrow">Official payment record</p>
      <h1>Payment receipt</h1>
      <p>HAVEN Hotel &amp; Residences</p>
      <dl>
        {receiptRows(document).map((row) => (
          <div key={row.label} className={row.emphasis ? "detail-balance" : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p>{receiptNote(document)}</p>
    </section>
  );
}
