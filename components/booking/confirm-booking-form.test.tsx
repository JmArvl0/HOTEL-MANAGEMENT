// @vitest-environment jsdom
// Customer deposit form is GCash-only: destination renders from Owner
// configuration, the number copies, and no bank-transfer path exists.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmBookingForm } from "./confirm-booking-form";

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
};

describe("ConfirmBookingForm (GCash-only)", () => {
  it("renders the Owner-configured destination and deposit amount", () => {
    render(<ConfirmBookingForm {...props} />);
    expect(screen.getByText("HAVEN Hotel & Residences")).toBeTruthy();
    expect(screen.getByText("09171234567")).toBeTruthy();
    // Due line and amount-to-send row agree on one figure (the submit
    // button carries the same figure inside a longer label).
    expect(screen.getAllByText("₱1,740").length).toBe(2);
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
});
