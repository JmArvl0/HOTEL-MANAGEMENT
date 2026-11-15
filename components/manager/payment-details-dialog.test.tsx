// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PaymentDetailsDialog from "./payment-details-dialog";
import type { RecordItem } from "@/lib/types";

afterEach(cleanup);

const payment = {
  id: "payment-1", purpose: "stay_payment", method: "gcash", status: "paid",
  reference: "QATEST-STAGE3-2", amount: 4060,
  submitted_at: "2026-10-18T03:04:00Z",
  reservation: { id: "reservation-1", guest_name: "QA Dispose", confirmation_number: "HVN-261018-7C66CF", room_type: "Garden Twin", check_in: "2026-10-18", check_out: "2026-10-19", status: "cancelled" },
} as unknown as RecordItem;

describe("payment details receipt", () => {
  it("renders the selected audited record, property time and matching totals", () => {
    render(<PaymentDetailsDialog item={payment} proofMeta="" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Payment Details" })).toBeTruthy();
    const brand = document.querySelector('.spr-brand');
    expect(brand?.getAttribute("aria-label")).toBe("HAVEN Hotel & Residences");
    expect(brand?.textContent).toContain("HAVEN");
    expect(brand?.textContent).not.toContain("Garden Twin");
    expect(brand?.querySelector("img")?.getAttribute("src")).toContain("haven-logo-small.png");
    for (const value of ["QA Dispose", "HVN-261018-7C66CF – Garden Twin", "Cancelled", "Stay payment", "GCash", "QATEST-STAGE3-2", "Paid", "No proof image submitted", "Oct 18, 11:04 AM"]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getAllByText("₱4,060.00")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /verify|reject/i })).toBeNull();
    expect(screen.queryByText("Expected deposit")).toBeNull();
  });

  it("uses new record values and preserves proof metadata and preview", () => {
    const differentPayment = { ...payment, amount: 987.5, reference: "BANK-987", method: "bank_transfer", status: "rejected", reservation: undefined };
    render(<PaymentDetailsDialog item={differentPayment} proofMeta="transfer.png · 24 KB" proof={<a href="/proof-test">Open proof</a>} onClose={vi.fn()} />);
    expect(screen.getAllByText("₱987.50")).toHaveLength(2);
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.getByText("Bank transfer")).toBeTruthy();
    expect(screen.getByText("transfer.png · 24 KB")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open proof" }).getAttribute("href")).toBe("/proof-test");
    expect(screen.queryByText("No proof image submitted")).toBeNull();
    expect(screen.queryByText("QA Dispose")).toBeNull();
  });

  it("names the manual GCash submission method consistently", () => {
    render(<PaymentDetailsDialog item={{ ...payment, method: "manual_gcash" }} proofMeta="" onClose={vi.fn()} />);
    expect(screen.getByText("GCash")).toBeTruthy();
  });

  it("uses the header X and Escape to close, with keyboard focus contained", () => {
    const close = vi.fn();
    render(<PaymentDetailsDialog item={payment} proofMeta="" onClose={close} />);
    const top = screen.getByRole("button", { name: "Close dialog" });
    const record = screen.getByRole("region", { name: "Payment record" });
    expect(screen.queryByRole("button", { name: /^Close$/ })).toBeNull();
    record.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(top);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(record);
    fireEvent.click(top);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("makes the record keyboard accessible independently of the header", () => {
    render(<PaymentDetailsDialog item={payment} proofMeta="" onClose={vi.fn()} />);
    const record = screen.getByRole("region", { name: "Payment record" });
    expect(record.tabIndex).toBe(0);
    expect(record.contains(screen.getByText("QA Dispose"))).toBe(true);
    expect(record.contains(screen.getByRole("heading", { name: "Payment Details" }))).toBe(false);
    expect(record.contains(screen.getByRole("button", { name: "Close dialog" }))).toBe(false);
    record.focus();
    expect(document.activeElement).toBe(record);
  });

  it.each([
    { amount: 900, variance: "Under by ₱100.00" },
    { amount: 1100, variance: "Over by ₱100.00" },
    { amount: 1000, variance: null },
  ])("shows deposit-only comparison for a $amount deposit in the same modal", ({ amount, variance }) => {
    const deposit = { ...payment, purpose: "reservation_deposit", amount, reservation: { ...(payment.reservation as unknown as RecordItem), deposit_required: 1000 } } as unknown as RecordItem;
    render(<PaymentDetailsDialog item={deposit} proofMeta="" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Payment Details" })).toBeTruthy();
    expect(screen.getByText("Reservation deposit")).toBeTruthy();
    expect(screen.getByText("Expected deposit")).toBeTruthy();
    if (variance) expect(screen.getByText(variance)).toBeTruthy();
    else expect(screen.queryByText(/by ₱/)).toBeNull();
    expect(screen.queryByRole("button", { name: /verify|reject/i })).toBeNull();
  });

  it.each(["reservation_deposit", "stay_payment"])("displays a legacy %s and its proof without review controls", purpose => {
    render(<PaymentDetailsDialog item={{ ...payment, purpose, method: "manual_gcash", status: "pending_verification" }} proofMeta="legacy.png" onClose={vi.fn()} />);
    expect(screen.getByText("Unsettled legacy payment")).toBeTruthy();
    expect(screen.getByText("legacy.png")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /verify|reject/i })).toBeNull();
  });

  it("shows that Xendit settles the payment automatically", () => {
    render(<PaymentDetailsDialog item={{ ...payment, status: "pending_verification", method: "gateway_xendit" }} proofMeta="" onClose={vi.fn()} />);
    expect(screen.getByText("Awaiting Xendit")).toBeTruthy();
    expect(screen.getByText(/Xendit confirms payments automatically/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /verify|reject/i })).toBeNull();
  });
});
