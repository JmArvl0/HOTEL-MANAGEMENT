// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import WalkInDialog from "./walk-in-dialog";

// jsdom has no matchMedia; Modal reads it on every render for reduced motion.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderDialog(onClose = vi.fn()) {
  render(<WalkInDialog hotelToday="2026-09-07" onClose={onClose} onCreated={vi.fn()} />);
  return onClose;
}

describe("WalkInDialog on the shared Modal", () => {
  it("renders a dialog with an accessible name from the title", async () => {
    renderDialog();
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Check in a guest without a reservation" })).toBeTruthy();
  });

  it("offers explicit profile selection or entry for a new guest", async () => {
    renderDialog();
    await act(async () => {});
    const continueButton = screen.getByRole("button", { name: /Continue/ });
    fireEvent.click(continueButton);
    expect(screen.getByRole("alert").textContent).toContain("Select a saved profile");
    fireEvent.click(screen.getByRole("button", { name: "Enter a new guest" }));

    fireEvent.change(screen.getByLabelText(/Guest full name/), { target: { value: "Maria Santos" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: "+63 917 123 4567" } });
    fireEvent.click(continueButton);
    expect(screen.getByRole("heading", { name: "Choose the stay and room type" })).toBeTruthy();
  });

  it("loads availability for a saved guest and recovers a committed phone booking without re-posting", async () => {
    const onCreated = vi.fn();
    const fetchCalls = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("calendar=1")) return Response.json({ data: { hotelToday: "2026-09-07" } });
      if (url.includes("availability")) return Response.json({ data: [{ id: "r1", name: "Deluxe Twin", beds: "Twin", maxGuests: 2, nights: 1, availableUnits: 1, subtotal: 4000 }] });
      if (init?.method === "POST") throw new Error("The network dropped after commit");
      return Response.json({ data: { reservation_id: "rsv1", confirmation_number: "HVN-1001", total: 4000 } });
    });
    vi.stubGlobal("fetch", fetchCalls);
    render(<WalkInDialog hotelToday="2026-09-07" initialSource="Phone" initialGuest={{ id: "g1", name: "Maria Santos", email: "maria@example.com", phone: "+639171234567" }} onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.queryByLabelText("Guest full name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-09-08" } });
    fireEvent.click(await screen.findByRole("radio", { name: /Deluxe Twin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review reservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit guest" }));
    expect(screen.getByRole("heading", { name: "Who is staying?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByRole("radio", { name: /Deluxe Twin/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Review reservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Create reservation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check booking status" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "rsv1", source: "Phone" })));
    const writes = fetchCalls.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    const payload = JSON.parse(String(writes[0][1]?.body));
    expect(payload).toMatchObject({ guestId: "g1", source: "Phone", quotedTotal: 4000 });
    expect(fetchCalls.mock.calls.some(([url]) => url.endsWith(payload.idempotencyKey))).toBe(true);
  });

  it("closes on Escape through the shared modal's key handler", async () => {
    const onClose = renderDialog();
    await act(async () => {});
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
