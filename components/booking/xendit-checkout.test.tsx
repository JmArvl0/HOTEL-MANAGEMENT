// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { XenditCheckout, XenditPaymentBreakdown, XenditPaymentChoice } from "./xendit-checkout";
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("discloses sandbox mode, sends only a hold and selected wallet, and prevents repeated clicks", async () => {
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  render(<XenditCheckout holdToken="hold-placeholder" amount={1250.5} />);
  expect(screen.getByText(/Test mode — no real money/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Maya"));
  const pay = screen.getByRole("button", { name: "Continue with Maya" });
  fireEvent.click(pay); fireEvent.click(pay);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ holdToken: "hold-placeholder", channel: "PAYMAYA" });
  expect((pay as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: true, json: async () => ({ data: { confirmationUrl: "/booking/confirmation/RES-1" }, message: "Payment pending" }) });
  await waitFor(() => expect(push).toHaveBeenCalledWith("/booking/confirmation/RES-1"));
});
it("reports unavailable channels and leaves a retry action", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Wallet unavailable in this sandbox" }) }));
  render(<XenditCheckout holdToken="hold-placeholder" amount={100} retry />);
  fireEvent.click(screen.getByRole("button", { name: "Retry payment" }));
  await screen.findByText("Wallet unavailable in this sandbox");
  expect((screen.getByRole("button", { name: "Retry payment" }) as HTMLButtonElement).disabled).toBe(false);
  expect(push).not.toHaveBeenCalled();
});
it("updates the stay summary and submits only the selected payment choice with the wallet", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Sandbox unavailable" }) });
  vi.stubGlobal("fetch", fetcher);
  render(<XenditPaymentChoice deposit={1250.5} total={4100.75} balanceDue="At check-in">
    <XenditCheckout holdToken="hold-placeholder" amount={1250.5} />
    <dl><XenditPaymentBreakdown /></dl>
  </XenditPaymentChoice>);
  expect((screen.getByRole("radio", { name: "Pay deposit" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText("Remaining balance").nextElementSibling?.textContent).toBe("₱2,850.25");
  fireEvent.click(screen.getByRole("radio", { name: "Pay in full" }));
  expect(screen.getByText("Pay today").nextElementSibling?.textContent).toBe("₱4,100.75");
  expect(screen.getByText("Remaining balance").nextElementSibling?.textContent).toBe("₱0");
  fireEvent.click(screen.getByRole("radio", { name: "Pay deposit" }));
  expect(screen.getByRole("button", { name: "Pay ₱1,250.5 with GCash" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Pay in full" }));
  fireEvent.click(screen.getByRole("radio", { name: "Maya" }));
  fireEvent.click(screen.getByRole("button", { name: "Pay ₱4,100.75 with Maya" }));
  await screen.findByText("Sandbox unavailable");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ holdToken: "hold-placeholder", channel: "PAYMAYA", paymentChoice: "full" });
});
