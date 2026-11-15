// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PaymentSettingsPanel from "./payment-settings-panel";

const current = {
  depositMethod: "xendit",
  version: 5,
  xenditConfigured: true,
  lastUpdated: null,
  lastUpdatedBy: null,
  trail: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps existing Xendit selected and saves only an explicit, audited switch", async () => {
  const notify = vi.fn();
  let policy = current;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "PATCH") {
      policy = { ...policy, depositMethod: "off", version: 6 };
    }
    return Response.json({ data: policy });
  });
  vi.stubGlobal("fetch", fetch);
  render(<PaymentSettingsPanel notify={notify} />);

  const xendit = await screen.findByRole<HTMLInputElement>("radio", { name: /Xendit sandbox/ });
  expect(xendit.checked).toBe(true);
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("radio", { name: /Off/ }));
  fireEvent.click(screen.getByRole("button", { name: "Switch deposit method" }));
  expect(screen.getByRole("alert").textContent).toContain("Record why");
  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText("Reason for change"), { target: { value: "Pause new checkouts" } });
  fireEvent.click(screen.getByRole("button", { name: "Switch deposit method" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Deposit method switched to off."));
  expect(fetch).toHaveBeenCalledWith("/api/admin/deposit-method", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ depositMethod: "off", reason: "Pause new checkouts", version: 5 }),
  }));
  expect(await screen.findByText("Inactive")).toBeTruthy();
});
