// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GuestRequestForm } from "./guest-request-form";
import { TransportationRequestForm } from "./transportation-request-form";
import PaymentCollectionDialog from "@/components/manager/payment-collection-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("retains the guest request draft and retry identity after a lost response", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch: private fixture host"))
    .mockResolvedValueOnce(Response.json({ data: [{ id: "request-fixture" }] }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<GuestRequestForm reservations={[{ id: "stay-fixture", confirmation_number: "STAY-FIXTURE", room_type: "Garden Twin" }]} options={[{ value: "extra_towels", label: "Extra towels" }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Make a request" }));
  fireEvent.click(screen.getByLabelText("Extra towels"));
  const note = view.baseElement.querySelector<HTMLTextAreaElement>('[name="description"]')!;
  fireEvent.change(note, { target: { value: "Please deliver after breakfast." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Check its current status");
  expect(note.value).toBe("Please deliver after breakfast.");
  expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByText("Submitted — Front Desk will review");
  const payloads = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
  expect(payloads[0].idempotencyKey).toBeTruthy();
  expect(payloads[1]).toEqual(payloads[0]);
  expect(view.baseElement.textContent).not.toContain("private fixture host");
});

it("releases transportation loading and reuses the request identity after a timeout", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("private provider timeout"))
    .mockResolvedValueOnce(Response.json({ data: { id: "trip-fixture" } }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<TransportationRequestForm hotelLabel="HAVEN" reservations={[{ id: "stay-fixture", confirmation_number: "STAY-FIXTURE", room_type: "Garden Twin", check_in: "2026-12-10", check_out: "2026-12-12" }]} />);
  fireEvent.click(screen.getByRole("button", { name: /Request transportation/i }));
  const form = view.baseElement.querySelector("form")!;
  for (const [name, value] of Object.entries({ pickupLocation: "Airport Terminal 3", pickupDate: "2026-12-10", pickupTime: "14:00" })) {
    fireEvent.change(form.querySelector(`[name="${name}"]`)!, { target: { value } });
  }
  fireEvent.submit(form);
  expect((await screen.findByRole("alert")).textContent).toContain("Check your transportation requests");
  expect((screen.getByRole("button", { name: "Submit transportation request" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.submit(form);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const first = JSON.parse(fetcher.mock.calls[0][1].body), second = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(second).toEqual(first);
  expect(view.baseElement.textContent).not.toContain("private provider timeout");
});

it("keeps a confirmed payment receipt when refreshing the ledger fails", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { receipt: { documentNumber: "RCPT-FIXTURE", snapshot: { balance: 0 } } } }));
  vi.stubGlobal("fetch", fetcher);
  render(<PaymentCollectionDialog reservation={{ id: "stay-fixture", guest_name: "Ava Reyes" }} role="front_desk" onClose={() => {}} onSaved={async () => { throw new Error("private refresh exception"); }} />);
  fireEvent.change(screen.getByLabelText("Amount (PHP)"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  expect(await screen.findByText("RCPT-FIXTURE")).toBeTruthy();
  expect(await screen.findByText("Payment recorded. We couldn't refresh the balance. Refresh the folio to check it.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("private refresh exception");
});
