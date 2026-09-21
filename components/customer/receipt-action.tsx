"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2, Mail, Printer, ReceiptText } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Menu dismissal, modelled on the customer shell's account popover. Escape is
  // handled here rather than by the Modal — `closeOnEscape={!menuOpen}` below
  // hands the key to the menu while it is open, so one press closes one layer.
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: Event) => {
      if (menu.current && !menu.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  function close() {
    setOpen(false);
    setMenuOpen(false);
  }

  async function openReceipt() {
    setOpen(true);
    if (receipt || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/account/receipts/${paymentId}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.data) setReceipt(body.data as ReceiptDocument);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function download(kind: "pdf" | "png") {
    setMenuOpen(false);
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
      const response = await fetch(`/api/account/receipts/${paymentId}/email`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) toast({ title: "Receipt emailed.", detail: `Sent to ${body.to}.`, tone: "success" });
      else if (body?.error === "EMAIL_UNAVAILABLE") toast({ title: "Email receipt is currently unavailable.", tone: "warning" });
      else toast({ title: "The receipt could not be emailed.", detail: "Please try again.", tone: "error" });
    } catch {
      toast({ title: "The receipt could not be emailed.", detail: "Please try again.", tone: "error" });
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
        onClose={close}
        title="Payment receipt"
        description="Official payment record · HAVEN Hotel & Residences"
        headerVariant="branded"
        size="md"
        portal
        closeOnEscape={!menuOpen}
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
            <HavenButton
              variant="secondary"
              density="customer"
              icon={<Printer size={16} />}
              disabled={disabled}
              onClick={() => window.print()}
            >
              Print
            </HavenButton>
            <div className="receipt-download" ref={menu}>
              <HavenButton
                ref={menuButton}
                variant="primary"
                density="customer"
                icon={<Download size={16} />}
                className="receipt-download-trigger"
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                Download
                <ChevronDown size={15} aria-hidden="true" />
              </HavenButton>
              {menuOpen && (
                <div className="receipt-download-menu" role="menu" aria-label="Receipt download format">
                  <button type="button" role="menuitem" onClick={() => download("pdf")}>
                    <b>PDF document</b>
                    <small>Best for printing and records</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => download("png")}>
                    <b>PNG image</b>
                    <small>Best for saving or sharing</small>
                  </button>
                </div>
              )}
            </div>
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
