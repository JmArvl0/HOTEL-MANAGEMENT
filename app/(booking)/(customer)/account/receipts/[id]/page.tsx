import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptDocumentView } from "@/components/customer/receipt-document-view";
import { requireCustomerSession } from "@/lib/customer-auth";
import { getCustomerReceipt } from "@/lib/customer";

/**
 * The canonical receipt document route.
 *
 * The preview modal is the usual way in; this page remains the addressable,
 * printable, linkable version of the same document. Both render
 * ReceiptDocumentView from the same model, so there is one receipt layout in the
 * codebase rather than one per entry point.
 *
 * Ownership and eligibility live in getCustomerReceipt — an id belonging to
 * another guest, an unsettled payment or a refund all land on notFound().
 */
export default async function CustomerReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomerSession();
  const { id } = await params;
  const receipt = await getCustomerReceipt(session.user.id, id);
  if (!receipt) notFound();
  return (
    <div className="receipt-page">
      <ReceiptDocumentView document={receipt} />
      <Link className="btn btn-soft receipt-page-back" href="/account/payments">
        Back to payments
      </Link>
    </div>
  );
}
