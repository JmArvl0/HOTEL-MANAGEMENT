// @vitest-environment jsdom
// Customer deposit form is GCash-only: destination renders from Owner
// configuration, the number copies, and no bank-transfer path exists.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfirmBookingForm } from "./confirm-booking-form";
import { DEFAULT_DEPOSIT_POLICY } from "@/lib/booking";
import { DEFAULT_OPERATIONAL_POLICY } from "@/lib/hotel-policy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => cleanup());

const props = {
  token: "0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f",
  deposit: 1740,
  accountName: "HAVEN Hotel & Residences",
  mobileNumber: "09171234567",
  qrDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  depositPolicy: DEFAULT_DEPOSIT_POLICY,
  cancelPolicy: DEFAULT_OPERATIONAL_POLICY,
  remainingBalance: 4060,
  checkIn: "2026-10-20",
};

describe("ConfirmBookingForm (GCash-only)", () => {
  it("renders the Owner-configured destination and deposit amount", () => {
    render(<ConfirmBookingForm {...props} />);
    expect(screen.getByText("HAVEN Hotel & Residences")).toBeTruthy();
    expect(screen.getByText("09171234567")).toBeTruthy();
    // Due line, amount-to-send row, and the Before-You-Pay "Amount due now"
    // agree on one figure (the submit button carries the same figure inside
    // a longer label, matched separately below).
    expect(screen.getAllByText("₱1,740").length).toBe(3);
  });
  it("renders the official QR without filters or cropping", () => {
    render(<ConfirmBookingForm {...props} />);
    const qr = screen.getByAltText("Official GCash QR for HAVEN Hotel & Residences");
    expect(qr.getAttribute("src")).toBe(props.qrDataUrl);
  });
  it("copies the exact displayed number with feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ConfirmBookingForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("09171234567");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
  it("offers no bank-transfer option", () => {
    const { container } = render(<ConfirmBookingForm {...props} />);
    expect(container.textContent).not.toMatch(/bank transfer/i);
    expect(container.querySelector('input[name="paymentMethod"]')).toBeNull();
  });
  it("keeps submit disabled until a receipt is staged", () => {
    render(<ConfirmBookingForm {...props} />);
    const submit = screen.getByRole("button", { name: /Submit .* Deposit for Verification/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows deposit, refund, and remaining-balance terms before the submit action", () => {
    const { container } = render(<ConfirmBookingForm {...props} />);
    const panel = container.querySelector(".before-you-pay");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toMatch(/Before you pay/);
    expect(panel?.textContent).toMatch(/Cancellation & refunds/);
    expect(panel?.textContent).toMatch(/Remaining balance/);
    // Panel sits between the how-to-pay steps and the reference field, which
    // precedes the submit button — policy first, payment evidence second.
    const order = ["gcash-steps", "before-you-pay", "deposit-reference"];
    const html = container.innerHTML;
    expect(order.every((cls, i, arr) => i === 0 || html.indexOf(arr[i - 1]) < html.indexOf(cls))).toBe(true);
  });
  it("derives the panel figures from the passed snapshots, not hardcoded text", () => {
    const { container } = render(
      <ConfirmBookingForm
        {...props}
        depositPolicy={{ ...DEFAULT_DEPOSIT_POLICY, calculationType: "fixed", fixedAmount: 2000 }}
        deposit={2000}
        remainingBalance={3800}
        cancelPolicy={{ ...DEFAULT_OPERATIONAL_POLICY, cancellationFullRefundDays: 21 }}
      />,
    );
    expect(container.querySelector(".before-you-pay")?.textContent).toMatch(/21 days or more/);
    expect(container.querySelector(".before-you-pay")?.textContent).not.toMatch(/30%/);
  });
});

describe("ConfirmBookingForm proof upload is a single visible control", () => {
  const css = readFileSync(join(process.cwd(), "app/guest-booking.css"), "utf8");

  it("visually hides the native file input so only the styled button shows", () => {
    // Regression: the input's class matched no loaded rule, so the native
    // "Choose file" control rendered beside the styled upload button.
    expect(css).toContain('.proof-field input[type="file"]');
    expect(css).toMatch(/\.proof-field input\[type="file"\][^{]*\{[^}]*clip:/);
  });

  it("never uses display:none on the file input, which would break picker forwarding", () => {
    const rule = css.match(/\.proof-field input\[type="file"\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toMatch(/display\s*:\s*none/);
    expect(rule).not.toMatch(/visibility\s*:\s*hidden/);
  });
});
