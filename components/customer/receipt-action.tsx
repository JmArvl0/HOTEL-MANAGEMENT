"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { useRef, useState } from "react";
import { Loader2, Mail, ReceiptText } from "lucide-react";
import { DownloadMenu, printDownload } from "@/components/ui/download-menu";
import { Modal } from "@/components/ui/Modal";
import { HavenButton } from "@/components/ui/haven-button";
import { ReceiptDocumentView } from "@/components/customer/receipt-document-view";
import { useCustomerToast } from "@/components/customer/customer-toast";
import { receiptFileName, type ReceiptDocument } from "@/lib/receipt";
import { receiptPdf } from "@/lib/receipt-pdf";
import { receiptPng, saveBlob } from "@/lib/receipt-image";

/**
 * "View Receipt" and the actions that follow from it.
 *
 * The button carries no authority: it asks /api/account/receipts/<id> and is
 * given a document or a 404. Ownership and eligibility are decided server-side
 * in getCustomerReceipt, so hiding this component is a presentation choice, not
 * a security boundary.
 *
 * Mounted only for payments the server already judged receipt-eligible.
 */
export function ReceiptAction({ paymentId, emailAvailable }: { paymentId: string; emailAvailable: boolean }) {
  const toast = useCustomerToast();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  async function openReceipt() {
    setOpen(true);
    if (receipt || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetchPublic(`/api/account/receipts/${paymentId}`, { cache: "no-store" });
      const body = await readResponse(response).catch(() => null);
      if (response.ok && body?.data) setReceipt(body.data as ReceiptDocument);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function download(kind: "pdf" | "png") {
    if (!receipt) return;
    const name = receiptFileName(receipt, kind);
    try {
      if (kind === "pdf") saveBlob(new Blob([receiptPdf(receipt)], { type: "application/pdf" }), name);
      else saveBlob(await receiptPng(receipt), name);
      toast({ title: `Receipt ${kind === "pdf" ? "PDF" : "PNG"} downloaded.`, detail: name, tone: "success" });
    } catch {
      // A canvas or encoder failure is reported, never swallowed into a no-op.
      toast({ title: "The receipt file could not be prepared.", detail: "Please try again.", tone: "error" });
    }
  }

  async function emailReceipt() {
    setSending(true);
    try {
      const response = await fetchPublic(`/api/account/receipts/${paymentId}/email`, { method: "POST" });
      const body = await readResponse(response).catch(() => null);
      if (response.ok && body?.ok) toast({ title: "Receipt emailed.", detail: `Sent to ${body.to}.`, tone: "success" });
      else if (body?.error === "EMAIL_UNAVAILABLE") toast({ title: "Email receipt is currently unavailable.", tone: "warning" });
      else if (body?.outcome === "unknown") toast({ title: "We couldn't confirm that the receipt email was sent.", detail: "Check your inbox before trying again.", tone: "warning", duration: 0 });
      else toast({ title: "We couldn't send the receipt email right now.", detail: "You can download your receipt instead.", tone: "error" });
    } catch {
      toast({ title: "We couldn't confirm that the receipt email was sent.", detail: "Check your inbox before trying again.", tone: "warning", duration: 0 });
    } finally {
      setSending(false);
    }
  }

  const disabled = loading || failed || !receipt;

  return (
    <>
      <HavenButton
        ref={trigger}
        variant="secondary"
        density="customer"
        className="receipt-trigger"
        icon={<ReceiptText size={16} />}
        aria-haspopup="dialog"
        onClick={openReceipt}
      >
        View Receipt
      </HavenButton>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Payment receipt"
        description="Official payment record · HAVEN Hotel & Residences"
        headerVariant="branded"
        size="md"
        portal
        returnFocusRef={trigger}
        footer={
          <div className="receipt-footer">
            {emailAvailable ? (
              <HavenButton
                variant="secondary"
                density="customer"
                icon={sending ? <Loader2 size={16} className="receipt-spin" /> : <Mail size={16} />}
                disabled={disabled || sending}
                onClick={emailReceipt}
              >
                {sending ? "Sending…" : "Email receipt"}
              </HavenButton>
            ) : (
              <span className="receipt-footer-note" id={`receipt-email-unavailable-${paymentId}`}>
                Email receipt is currently unavailable.
              </span>
            )}
            <DownloadMenu
              label="Download receipt"
              opensUp
              disabled={disabled}
              actions={[
                { value: "pdf", label: "PDF document", run: () => download("pdf") },
                { value: "png", label: "PNG image", run: () => download("png") },
                { ...printDownload, label: "Print receipt" },
              ]}
            />
          </div>
        }
      >
        {loading && (
          <p className="receipt-state">
            <Loader2 size={18} className="receipt-spin" aria-hidden="true" /> Preparing your receipt…
          </p>
        )}
        {!loading && failed && <p className="receipt-state">This receipt is unavailable right now. Please try again.</p>}
        {!loading && receipt && <ReceiptDocumentView document={receipt} />}
      </Modal>
    </>
  );
}
