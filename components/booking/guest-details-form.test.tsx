// @vitest-environment jsdom
// Guest Details — Expected arrival is a native <input type="time">, the same control as
// Pickup time under Need a ride. No radial clock, no wheel sheet, no shared state between
// the two times, and no change to what the hold receives. Booking, transportation and
// early-check-in rules are untouched (asserted by source contract).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuestDetailsForm } from "./guest-details-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const formSource = readFileSync("components/booking/guest-details-form.tsx", "utf8");
const bookingCss = readFileSync("app/guest-booking.css", "utf8");

const base = { roomType: "King", checkIn: "2026-09-20", checkOut: "2026-09-22", guests: 2, checkInFrom: "2:00 PM", defaults: {} as Record<string, string> };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ token: "hold-token" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Renders the form, optionally turning on the transportation block so Pickup time exists. */
function renderForm(props: Partial<Parameters<typeof GuestDetailsForm>[0]> = {}, withRide = false) {
  const view = render(<GuestDetailsForm {...base} {...props}/>);
  if (withRide) fireEvent.click(screen.getByLabelText("Request transportation"));
  return view;
}

const submitForm = (container: HTMLElement) => fireEvent.submit(container.querySelector("form")!);
const payloadOf = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
const arrival = () => screen.getByLabelText("Expected arrival") as HTMLInputElement;
const pickup = () => screen.getByLabelText("Pickup time") as HTMLInputElement;

describe("expected arrival — simple time input", () => {
  it("renders a native time input with an explicit label association", () => {
    const { container } = renderForm();
    const input = arrival();
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("time");
    expect(input.getAttribute("name")).toBe("expectedArrival");
    const label = container.querySelector('label[for="expected-arrival"]')!;
    expect(label.textContent).toBe("Expected arrival");
    expect(label.getAttribute("for")).toBe(input.id);
    // The long note stays outside the label, so it never becomes the accessible name.
    expect(screen.getByText(/Early check-in is a separate request/).tagName).toBe("SMALL");
  });

  it("has no radial clock, wheel or popover left in the DOM", () => {
    const { container } = renderForm();
    expect(screen.queryByRole("button", { name: /arrival/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".arrival-clock,.arrival-trigger,.arrival-popover,.arrival-wheels,.arrival-face,.arrival-wheel")).toBeNull();
    // The grid cell survives, but holds exactly the label, the input and the note.
    const cell = container.querySelector(".arrival-field")!;
    expect(cell.querySelectorAll("input").length).toBe(1);
    expect(cell.querySelectorAll("svg").length).toBe(0);
  });

  it("uses the same primitive as Pickup time, in the same grid", () => {
    const { container } = renderForm({}, true);
    for (const input of [arrival(), pickup()]) {
      expect(input.getAttribute("type")).toBe("time");
      expect(input.closest(".booking-form-grid")).not.toBeNull();
    }
    expect(container.querySelectorAll('.booking-form-grid input[type="time"]').length).toBe(2);
  });

  it("keeps the two times independent in both directions", () => {
    renderForm({}, true);
    fireEvent.change(arrival(), { target: { value: "13:00" } });
    expect(arrival().value).toBe("13:00");
    expect(pickup().value).toBe("");

    fireEvent.change(pickup(), { target: { value: "13:30" } });
    expect(pickup().value).toBe("13:30");
    expect(arrival().value).toBe("13:00");

    fireEvent.change(arrival(), { target: { value: "09:15" } });
    expect(arrival().value).toBe("09:15");
    expect(pickup().value).toBe("13:30");
  });

  it("posts each value under its own key, with no cross-contamination", async () => {
    const { container } = renderForm({}, true);
    fireEvent.change(arrival(), { target: { value: "13:00" } });
    fireEvent.change(pickup(), { target: { value: "13:30" } });
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const payload = payloadOf();
    expect(payload.expectedArrival).toBe("13:00");
    expect(payload.transportationPreferences.pickupTime).toBe("13:30");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/booking/review/hold-token"));
  });

  it("prefills from the hold, and survives a submit round-trip", async () => {
    const { container } = renderForm({ initialArrival: "13:00" }, true);
    expect(arrival().value).toBe("13:00");
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(payloadOf().expectedArrival).toBe("13:00");
  });

  it("still requires a value, with the same message and the same presentation", async () => {
    const { container } = renderForm();
    submitForm(container);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Select your expected arrival time.");
    expect(alert.className).toBe("booking-error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("commits from the keyboard alone", () => {
    renderForm();
    const input = arrival();
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "18:45" } });
    fireEvent.blur(input);
    expect(input.value).toBe("18:45");
  });
});

describe("guest details — untouched contracts", () => {
  it("keeps the early check-in disclosure and policy wording verbatim", () => {
    expect(formSource).toContain("Helps Front Desk prepare — your room follows check-in from {checkInFrom}, not this time. Early check-in is a separate request.");
    expect(formSource).toContain("checkInFrom");
    // No auto-approval of early check-in was introduced anywhere in the form.
    expect(formSource.toLowerCase()).not.toContain("earlycheckin");
    expect(formSource.toLowerCase()).not.toContain("early_check_in");
  });

  it("keeps the transportation block and its payload shape verbatim", () => {
    expect(formSource).toContain("Need a ride?");
    expect(formSource).toContain("...(needRide ? { transportationPreferences: {");
    expect(formSource).toContain("SERVICE_OPTIONS.map((option)");
    expect(formSource).toContain('name="pickupTime"');
  });

  it("no longer imports or renders the old picker", () => {
    expect(formSource).not.toContain("expected-arrival-picker");
    expect(formSource).not.toContain("ExpectedArrivalPicker");
  });

  it("drops the radial clock CSS and keeps the note rule", () => {
    for (const dead of ["arrival-popover", "arrival-clock", "arrival-trigger", "arrival-wheels", "arrival-segment", "arrival-period"]) {
      expect(bookingCss).not.toContain(dead);
    }
    expect(bookingCss).toContain(".booking-form-grid .arrival-note");
    // The time input carries no bespoke width — it inherits the shared grid rule.
    expect(bookingCss).not.toMatch(/\.arrival-field\s+input\s*\{/);
  });
});
