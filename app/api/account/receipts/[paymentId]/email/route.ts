import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { emailConfigured, guestEmailHtml, sendEmail } from "@/lib/email";
import { supabase } from "@/lib/supabase";
import { getCustomerReceipt } from "@/lib/customer";
import { receiptFileName, receiptNote, receiptRows, type ReceiptDocument } from "@/lib/receipt";
import { receiptPdfBase64 } from "@/lib/receipt-pdf";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

/** The email body is the same receiptRows() list the PDF and the preview walk. */
function receiptEmailBody(receipt: ReceiptDocument): string {
  const rows = receiptRows(receipt)
    .map(
      (row) =>
        `<tr><td style="padding:5px 0;color:#6d7971;font-size:13px">${escapeHtml(row.label)}</td>` +
        `<td style="padding:5px 0;text-align:right;font-size:13px;color:#103e48${
          row.emphasis ? ";font-weight:700" : ""
        }">${escapeHtml(row.value)}</td></tr>`
    )
    .join("");
  return (
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    `<p style="font-size:12px;color:#6d7971;line-height:1.6;margin:20px 0 0">${escapeHtml(receiptNote(receipt))}</p>` +
    `<p style="font-size:12px;color:#6d7971;margin:12px 0 0">The attached PDF is your official receipt.</p>`
  );
}

/**
 * Emails a receipt to the signed-in account address.
 *
 * The destination is session.user.email and nothing else — no address is read
 * from the request body, so a customer cannot redirect their receipt (or
 * anyone else's) to an arbitrary inbox.
 *
 * When RESEND_API_KEY is unset this reports EMAIL_UNAVAILABLE rather than
 * pretending to have sent anything.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  if (!emailConfigured()) {
    return NextResponse.json({ error: "EMAIL_UNAVAILABLE", message: "Email receipt is currently unavailable." }, { status: 503 });
  }

  const to = session.user.email;
  if (!to) return NextResponse.json({ error: "NO_ACCOUNT_EMAIL", message: "Your account has no email address." }, { status: 409 });

  const { paymentId } = await params;
  try {
    const receipt = await getCustomerReceipt(session.user.id, paymentId);
    if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

    const result = await sendEmail({
      to,
      subject: `Your HAVEN receipt — ${receipt.reservationNumber}`,
      html: guestEmailHtml("Payment receipt", receiptEmailBody(receipt)),
      attachments: [{ filename: receiptFileName(receipt, "pdf"), content: receiptPdfBase64(receipt) }]
    });
    if (!result.ok) return NextResponse.json({ error: "EMAIL_FAILED", message: result.message }, { status: 502 });
    return NextResponse.json({ ok: true, to });
  } catch {
    return NextResponse.json({ error: "EMAIL_FAILED", message: "The receipt could not be emailed." }, { status: 500 });
  }
}
