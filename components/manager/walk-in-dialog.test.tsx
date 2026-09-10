// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import WalkInDialog from "./walk-in-dialog";
import type { RecordItem } from "@/lib/types";

// jsdom has no matchMedia; Modal reads it on every render for reduced motion.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
});
afterEach(cleanup);

const guests: RecordItem[] = [
  { id: "g1", name: "Maria Santos", email: "maria@example.com", phone: "+63 917 000 0001" },
];

// Availability is only fetched after Continue; these tests never enter step 2.

function renderDialog(onClose = vi.fn()) {
  render(<WalkInDialog guests={guests} hotelToday="2026-09-07" onClose={onClose} onCreated={vi.fn()} />);
  return onClose;
}

describe("WalkInDialog on the shared Modal", () => {
  it("renders a dialog with an accessible name from the title", async () => {
    renderDialog();
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Check in a guest without a reservation" })).toBeTruthy();
  });

  it("keeps Continue disabled until the guest fields are valid", async () => {
    renderDialog();
    await act(async () => {});
    const continueButton = screen.getByRole("button", { name: /Continue/ });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Guest full name/), { target: { value: "Maria Santos" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: "+63 917 000 0001" } });
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("closes on Escape through the shared modal's key handler", async () => {
    const onClose = renderDialog();
    await act(async () => {});
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
