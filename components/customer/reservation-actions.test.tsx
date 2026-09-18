// @vitest-environment jsdom
// Request-a-Change is one complete modal (dates + HavenSelect room type +
// required reason textarea); a reservation with an unresolved request shows a
// non-action pending state instead of an active button.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReservationActions } from "./reservation-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// jsdom has no matchMedia; Modal reads it on every render for reduced motion.
if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    media: "",
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => cleanup());

const base = {
  id: "RSV-TEST01",
  status: "confirmed",
  checkIn: "2026-11-10",
  checkOut: "2026-11-12",
  roomType: "Garden Twin",
  openRequest: null,
};

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(impl(url, init)) })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-1111-1111-111111111111" });
});

describe("ReservationActions change modal", () => {
  it("opens one modal containing dates, room type, and reason", async () => {
    mockFetch((url) =>
      url.includes("room-options")
        ? { data: [{ name: "Garden Twin", availableUnits: 2 }, { name: "Deluxe King", availableUnits: 1 }] }
        : {}
    );
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    expect(await screen.findByText("Choose the changes you'd like us to review.")).toBeTruthy();
    expect(screen.getByLabelText(/Requested check-in/)).toBeTruthy();
    expect(screen.getByLabelText(/Requested check-out/)).toBeTruthy();
    expect(screen.getByLabelText("Requested room type")).toBeTruthy();
    expect(screen.getByLabelText(/Reason for change/)).toBeTruthy();
    // No second modal: exactly one dialog title on screen.
    expect(screen.getAllByText("Request a reservation change").length).toBe(1);
  });

  it("uses native date pickers with no dropdown chevron on the date fields", async () => {
    mockFetch(() => ({ data: [] }));
    const { container } = render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    const checkin = await screen.findByLabelText(/Requested check-in/);
    expect(checkin.getAttribute("type")).toBe("date");
    expect(screen.getByLabelText(/Requested check-out/).getAttribute("type")).toBe("date");
    // No select/chevron affordance wraps the date inputs.
    expect(container.querySelector(".change-date-input + svg")).toBeNull();
  });

  it("offers room types through HavenSelect, not a free-text input", async () => {
    mockFetch((url) =>
      url.includes("room-options")
        ? { data: [{ name: "Garden Twin", availableUnits: 2 }, { name: "Deluxe King", availableUnits: 1 }] }
        : {}
    );
    const { container } = render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    const trigger = await screen.findByLabelText("Requested room type");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(container.querySelector('input[id="change-roomtype"]')).toBeNull();
    // Options load asynchronously; the trigger stays disabled until then.
    await screen.findByText("Only room types with availability for your dates are listed.");
    fireEvent.click(trigger);
    expect(await screen.findByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Deluxe King.*1 available/ })).toBeTruthy();
  });

  it("shows the current stay summary at the top of the modal", async () => {
    mockFetch(() => ({ data: [] }));
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    const summary = await screen.findByText(/Current stay:/);
    expect(summary.textContent).toMatch(/Garden Twin/);
  });

  it("labels the default option Keep current room type", async () => {
    mockFetch((url) =>
      url.includes("room-options")
        ? { data: [{ name: "Garden Twin", availableUnits: 2 }, { name: "Deluxe King", availableUnits: 1 }] }
        : {}
    );
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    await screen.findByText("Only room types with availability for your dates are listed.");
    fireEvent.click(await screen.findByLabelText("Requested room type"));
    expect(await screen.findByRole("option", { name: "Keep current room type" })).toBeTruthy();
  });

  it("states explicitly when no alternative room types exist for the dates", async () => {
    mockFetch((url) => (url.includes("room-options") ? { data: [] } : {}));
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    expect(await screen.findByText("No alternative room types are available for these dates. You can still change your dates and keep your current room type.")).toBeTruthy();
  });

  it("keeps the current room type selectable so date-only changes stay possible", async () => {
    mockFetch((url) => (url.includes("room-options") ? { data: [{ name: "Ocean Suite", availableUnits: 3 }] } : {}));
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    await screen.findByText("Only room types with availability for your dates are listed.");
    fireEvent.click(await screen.findByLabelText("Requested room type"));
    expect(await screen.findByRole("option", { name: "Keep current room type" })).toBeTruthy();
  });

  it("requires a reason in the same modal — textarea, no chevron, no second step", async () => {
    mockFetch(() => ({ data: [] }));
    const { container } = render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    const reason = await screen.findByLabelText(/Reason for change/);
    expect(reason.tagName).toBe("TEXTAREA");
    expect(reason.getAttribute("aria-required")).toBe("true");
    expect(container.querySelector("#change-reason + svg")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    // Still one modal — the reason prompt never leaves this dialog.
    expect(screen.getAllByText("Request a reservation change").length).toBe(1);
  });

  it("submits once on double-click with a single idempotency key", async () => {
    let posts = 0;
    const bodies: string[] = [];
    const fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("room-options")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ name: "Garden Twin", availableUnits: 2 }] }) });
      }
      posts += 1;
      bodies.push(String(init?.body ?? ""));
      return new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ data: { status: "pending", id: "c1" } }) }), 30));
    });
    vi.stubGlobal("fetch", fetch);
    render(<ReservationActions {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Request a change/ }));
    fireEvent.change(await screen.findByLabelText(/Requested check-out/), { target: { value: "2026-11-14" } });
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: "Need an extra night" } });
    const submit = screen.getByRole("button", { name: "Submit change request" });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await waitFor(() => expect(posts).toBe(1));
    expect(bodies[0]).toContain("Need an extra night");
    expect(bodies[0]).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("shows a non-action pending state when an unresolved request exists", () => {
    render(
      <ReservationActions
        {...base}
        openRequest={{
          requestedCheckIn: "2026-11-12",
          requestedCheckOut: "2026-11-14",
          requestedRoomType: "Deluxe King",
          reason: "Need an extra night",
        }}
      />
    );
    const pending = screen.getByRole("button", { name: /Change request under review/ });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^Request a change$/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/We received your requested changes/);
  });
});
